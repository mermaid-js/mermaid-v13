/**
 * The CDN build (D162, D163; spec #218 T6): the real esbuild build into a temporary directory.
 * The browser behaviour (loader, `cdnBase`, plugin queue) is in e2e/platform/cdn.spec.ts.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
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
let out: CdnBuild;

beforeAll(async () => {
  out = await buildCdn(mkdtempSync(join(tmpdir(), 'mermaid-cdn-')));
  console.log(
    `CDN build: ${ESM_FILE} closure ${out.esmClosureGzip} B gz, ${LOADER_FILE} ${out.loaderGzip} B gz`
  );
}, 60_000);

const file = (path: string) => out.files.find((f) => f.path === path);
const read = (path: string) => readFileSync(join(out.outdir, path), 'utf8');

describe('the CDN build (D162)', () => {
  it('gives every first-party diagram, its ascii and language entries a stable chunk', () => {
    for (const id of ids) {
      expect(file(`chunks/diagram-${id}.mjs`), id).toBeDefined();
      expect(file(`chunks/diagram-${id}-language.mjs`), id).toBeDefined();
    }
    for (const id of DETECTORS.filter((d) => d.formats?.includes('ascii')).map((d) => d.id))
      expect(file(`chunks/diagram-${id}-ascii.mjs`), id).toBeDefined();
    expect(file('chunks/core-theme-specs-dark.mjs')).toBeDefined();
  });

  it('keeps diagrams, text output and other themes out of the ESM entry static closure', () => {
    const seen = new Set<string>();
    const visit = (p: string): void => {
      if (seen.has(p)) return;
      seen.add(p);
      for (const i of file(p)?.imports ?? []) visit(i);
    };
    visit(ESM_FILE);
    expect([...seen].filter((p) => !/^(?:mermaid\.esm\.min\.mjs|chunks\/chunk-)/.test(p))).toEqual(
      []
    );
    const entries = new Set([...seen].map((p) => file(p)?.entryPoint).filter(Boolean));
    expect(entries).toEqual(new Set(['packages/mermaid/src/cdn.ts']));
  });

  it('loads every lazy chunk from cdnBase, never relative to the importing file', () => {
    expect(out.files.filter((f) => f.lazy.length > 0)).toEqual([]);
    const entry = [...new Set([ESM_FILE, ...(file(ESM_FILE)?.imports ?? [])])].map(read).join('');
    expect(entry).toContain('Symbol.for("mermaid.cdnBase")');
    expect(entry).toContain('"chunks/diagram-flowchart.mjs"');
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
});
