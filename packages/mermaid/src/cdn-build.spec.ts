/**
 * The CDN build (D162, D163; spec #218 T6): the real esbuild build into a temporary directory.
 * The browser behaviour (loader, `cdnBase`, plugin queue) is in e2e/platform/cdn.spec.ts.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildCdn,
  closureGzip,
  ESM_FILE,
  LOADER_FILE,
  type CdnBuild,
} from '../scripts/cdn-build.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

const budget = JSON.parse(
  readFileSync(new URL('../size-budget.json', import.meta.url), 'utf8')
) as { core: { gzipBytes: number } };
const ids = [...new Set(DETECTORS.flatMap((d) => (d.id ? [d.id] : [])))];
/** Plugin id → the package directory chunks are named after (`quadrantChart` → `diagram-quadrant`). */
const packageDir = new Map<string, string>();
/** The plugin ids whose manifest names a `language` entry (a port adds it with its facet). */
const withLanguage = new Set<string>();
for (const dir of readdirSync(new URL('../../', import.meta.url))) {
  if (!dir.startsWith('diagram-')) continue;
  const pkg = JSON.parse(
    readFileSync(new URL(`../../${dir}/package.json`, import.meta.url), 'utf8')
  ) as { mermaid?: { id?: string; language?: string } };
  if (!pkg.mermaid?.id) continue;
  packageDir.set(pkg.mermaid.id, dir);
  if (pkg.mermaid.language !== undefined) withLanguage.add(pkg.mermaid.id);
}
const chunk = (id: string) => `chunks/${packageDir.get(id) ?? `diagram-${id}`}`;
let out: CdnBuild;

beforeAll(async () => {
  out = await buildCdn(mkdtempSync(join(tmpdir(), 'mermaid-cdn-')));
  console.log(
    `CDN build: ${ESM_FILE} closure ${out.esmClosureGzip} B gz, ${LOADER_FILE} ${out.loaderGzip} B gz`
  );
}, 60_000);

const file = (path: string) => out.files.find((f) => f.path === path);
const read = (path: string) => readFileSync(join(out.outdir, path), 'utf8');
/** The ESM entry and every file it imports statically, transitively. */
function staticClosure(): Set<string> {
  const seen = new Set<string>();
  const visit = (p: string): void => {
    if (seen.has(p)) return;
    seen.add(p);
    for (const i of file(p)?.imports ?? []) visit(i);
  };
  visit(ESM_FILE);
  return seen;
}

describe('the CDN build (D162)', () => {
  it('gives every first-party diagram, its ascii and language entries a stable chunk (language: when its manifest names one)', () => {
    for (const id of ids) {
      expect(file(`${chunk(id)}.mjs`), id).toBeDefined();
      expect(file(`${chunk(id)}-language.mjs`) !== undefined, id).toBe(withLanguage.has(id));
    }
    for (const id of DETECTORS.filter((d) => d.formats?.includes('ascii')).map((d) => d.id))
      expect(file(`${chunk(id!)}-ascii.mjs`), id).toBeDefined();
    expect(file('chunks/core-theme-specs-dark.mjs')).toBeDefined();
  });

  it('keeps diagrams, text output and other themes out of the ESM entry static closure', () => {
    const seen = staticClosure();
    expect([...seen].filter((p) => !/^(?:mermaid\.esm\.min\.mjs|chunks\/chunk-)/.test(p))).toEqual(
      []
    );
    const entries = new Set([...seen].map((p) => file(p)?.entryPoint).filter(Boolean));
    expect(entries).toEqual(new Set(['packages/mermaid/src/cdn.ts']));
  });

  it('loads every lazy chunk from cdnBase, never relative to the importing file', () => {
    expect(out.files.filter((f) => f.lazy.length > 0)).toEqual([]);
    const entry = [...new Set([ESM_FILE, ...(file(ESM_FILE)?.imports ?? [])])].map(read).join('');
    expect(entry).toContain('"chunks/diagram-flowchart.mjs"');
    // The base lives in the build (cdn-base.ts), never on the page.
    expect(entry).not.toContain('Symbol.for(');
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as Record<string, string>;
    // A bare package URL (unpkg, jsDelivr) serves the classic loader, as in v12.
    expect([manifest.unpkg, manifest.jsdelivr]).toEqual([
      `./dist/${LOADER_FILE}`,
      `./dist/${LOADER_FILE}`,
    ]);
  });

  it('ships a loader with no imports of its own', () => {
    expect(file(LOADER_FILE)).toMatchObject({ imports: [], lazy: [] });
    expect(read(LOADER_FILE)).toContain(ESM_FILE);
  });

  it('keeps the ESM entry and its static imports within the core budget (R-PERF-8)', () => {
    expect(out.esmClosureGzip).toBe(closureGzip(out.files, ESM_FILE));
    expect(out.esmClosureGzip).toBeLessThanOrEqual(budget.core.gzipBytes);
    expect(out.loaderGzip).toBeLessThan(out.esmClosureGzip);
  });

  // The theme vocabulary inventory (`THEME_VARIABLES`, with its `usedBy` lists) is for tools and
  // specs; the runtime reads the generated alias table. Any spread or side effect in it pulls
  // the whole inventory back into core (R-PERF-8).
  it('keeps the theme vocabulary inventory out of the ESM entry static closure', () => {
    const seen = staticClosure();
    for (const p of seen) expect(read(p), p).not.toMatch(/\busedBy\b/);
  });

  // The diagram packages' own theme variables (spec #414, D331) load with their diagram chunk.
  // Core's sources never name one (`tools/gen-config/src/theme-direction.spec.ts`); this checks
  // the built closure, so a name that reaches core through a dependency, a generated file or a
  // re-export fails too (R-PERF-8).
  it('keeps every diagram package theme variable out of the ESM entry static closure', async () => {
    const names = await packageThemeNames();
    expect(new Set(names.values()).size).toBeGreaterThanOrEqual(12);
    const closure = [...staticClosure()].map((p) => [p, read(p)] as const);
    const found = (owners: ReadonlyMap<string, string>) =>
      closure.flatMap(([p, text]) =>
        namesIn(text, [...owners.keys()]).map((n) => `${p}: ${n} (${owners.get(n)})`)
      );
    expect(found(names)).toEqual([]);
    // Planted: `arrowheadGap` is a shared row (flowchart and state read it), so it is in core.
    const planted = found(new Map([...names, ['arrowheadGap', 'planted']]));
    expect(planted.length).toBeGreaterThan(0);
    for (const f of planted) expect(f).toMatch(/: arrowheadGap \(planted\)$/);
  });
});

/** Every name in a diagram package's `src/theme/vocabulary.ts`, with the package owning it. */
async function packageThemeNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const packages = fileURLToPath(new URL('../../', import.meta.url));
  for (const dir of readdirSync(packages).filter((d) => d.startsWith('diagram-'))) {
    const path = join(packages, dir, 'src/theme/vocabulary.ts');
    if (!existsSync(path)) continue;
    const { THEME_VARIABLES } = (await import(path)) as {
      THEME_VARIABLES: Readonly<Record<string, unknown>>;
    };
    for (const name of Object.keys(THEME_VARIABLES)) names.set(name, dir);
  }
  return names;
}

/** The names that occur in `text` as a whole word, in the order given. */
function namesIn(text: string, names: readonly string[]): string[] {
  return names.filter((n) => new RegExp(`(?<![\\w$])${n}(?![\\w$])`).test(text));
}
