/**
 * The CDN build (D162, D163; spec #218 T6): the real esbuild build into a temporary directory.
 * The browser behaviour (loader, `cdnBase`, plugin queue) is in e2e/platform/cdn.spec.ts.
 */
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const packageDir = new Map(
  readdirSync(new URL('../../', import.meta.url)).flatMap((dir) => {
    if (!dir.startsWith('diagram-')) return [];
    const pkg = JSON.parse(
      readFileSync(new URL(`../../${dir}/package.json`, import.meta.url), 'utf8')
    ) as { mermaid?: { id?: string } };
    return pkg.mermaid?.id ? [[pkg.mermaid.id, dir] as const] : [];
  })
);
/**
 * Diagrams registered before their language facet's ticket merged, so they have no `language`
 * entry yet: radar (#449 before #450). Each is asserted still without one, so the row has to go
 * when the facet lands.
 */
const NO_LANGUAGE_YET: ReadonlySet<string> = new Set(['radar']);
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
  it('gives every first-party diagram, its ascii and language entries a stable chunk', () => {
    for (const id of ids) {
      expect(file(`${chunk(id)}.mjs`), id).toBeDefined();
      const language = file(`${chunk(id)}-language.mjs`);
      if (NO_LANGUAGE_YET.has(id))
        expect(language, `${id}: drop it from NO_LANGUAGE_YET`).toBeUndefined();
      else expect(language, id).toBeDefined();
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
});
