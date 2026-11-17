/**
 * R-PERF-8 / D161: the core budget. Core is the `mermaid` entry's static import closure, bundled
 * with the bench's production esbuild options. The limit comes from the committed budget file.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { diagramChunks } from './code-size.ts';
import type { ClosureSize } from './size-budget.ts';
import {
  FLOWCHART_ENTRY,
  checkBudget,
  chunkOf,
  flowchartClosureSize,
  measureCoreSize,
  measureStaticClosure,
  readSizeBudget,
} from './size-budget.ts';

const budget = readSizeBudget();
const tight = readSizeBudget(new URL('./__fixtures__/size-budget-70kb.json', import.meta.url));
let core: ClosureSize;

beforeAll(async () => {
  core = await measureStaticClosure(budget.core.entry);
}, 60_000);

describe('core size budget (R-PERF-8, D161)', () => {
  it('measures the entry static closure only, with no diagram chunk', () => {
    expect(core.size.source).toBe('static');
    expect(core.size.files.map((f) => f.path)).toEqual(core.bundle.staticClosure);
    const lazy = core.bundle.files.filter((f) => !core.bundle.staticClosure.includes(f.path));
    expect(lazy.length).toBeGreaterThan(0);
  });

  it('gives the bench and PR reports the closure of the budget entry, not of the bench site', async () => {
    expect(budget.core.entry).toBe('packages/mermaid/src/cdn.ts');
    expect((await measureCoreSize()).gzip).toBe(core.size.gzip);
    // Another entry in the budget file measures that entry instead.
    const other = await measureCoreSize(tight);
    expect(other.gzip).toBe((await measureStaticClosure(tight.core.entry)).size.gzip);
    expect(other.gzip).not.toBe(core.size.gzip);
  }, 60_000);

  it('keeps the mermaid entry within the committed core budget', () => {
    const check = checkBudget(core.size, budget.core);
    expect(check, check.detail).toMatchObject({ ok: true, limit: budget.core.gzipBytes });
  });

  it('fails the same measurement against a tighter fixture budget', () => {
    expect(tight.core.gzipBytes).toBeLessThan(budget.core.gzipBytes);
    const check = checkBudget(core.size, tight.core);
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/over the .* budget/);
  });

  // R-PERF-1's static fallback (D160) measures the same set the runner fetches for a flowchart.
  it('sizes the loaded fallback as the entry closure plus the flowchart chunk closure', () => {
    const loaded = flowchartClosureSize(core.bundle);
    const paths = loaded.files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(core.bundle.staticClosure));
    expect(paths).toContain(chunkOf(core.bundle, FLOWCHART_ENTRY));
    expect(loaded.gzip).toBeGreaterThan(core.size.gzip);
  });

  // #814: the size report's byte figures come from this same build.
  it('gives the size report the core and loaded figures the gates check', () => {
    const chunks = diagramChunks(core.bundle);
    expect(chunks.core).toBe(core.size.gzip);
    expect(chunks.loaded).toBe(flowchartClosureSize(core.bundle).gzip);
    const flowchart = chunks.diagrams.find((d) => d.pkg === 'diagram-flowchart');
    expect(chunks.core + flowchart!.closure).toBe(chunks.loaded);
    expect(chunks.diagrams.map((d) => d.pkg)).toContain('diagram-mindmap');
  });
});
