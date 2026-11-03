import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { asciiSize, isAsciiModule, splitByFormat } from './ascii-size.ts';
import type { Bundle } from './build.ts';
import { bundle } from './build.ts';
import { LIMITS } from './gates.ts';

const entry = fileURLToPath(new URL('../../mermaid/src/index.ts', import.meta.url));

/** The production bundle the bench serves as `v13` (R-PERF-1), built once for the file. */
let prod: Bundle;
beforeAll(async () => {
  prod = await bundle({
    entry,
    outdir: mkdtempSync(join(tmpdir(), 'mermaid-ascii-')),
    bench: false,
  });
}, 60_000);

describe('ascii chunks in the production bundle (R-ASCII-9, D76, D87)', () => {
  it('takes the entry output for the entry, not the first lazily imported chunk', () => {
    expect(prod.entryFile).toBe('index.js');
    expect(prod.staticClosure[0]).toBe('index.js');
  });

  it('an SVG flowchart render loads no ascii module', () => {
    const { svg } = splitByFormat(prod);
    expect(svg).toContain(prod.entryFile);
    const leaked = svg.flatMap((f) => prod.graph[f]!.inputs.filter(isAsciiModule));
    expect(leaked).toEqual([]);
  });

  it('keeps the SVG flowchart path loading the flowchart plugin (the R-PERF-1 set)', () => {
    const { svg } = splitByFormat(prod);
    const inputs = svg.flatMap((f) => prod.graph[f]!.inputs);
    expect(inputs.some((i) => i.includes('diagram-flowchart/src/plugin.ts'))).toBe(true);
  });

  it('puts core/ascii and the flowchart ascii entry only in chunks a text render loads', () => {
    const { ascii } = splitByFormat(prod);
    const inputs = ascii.flatMap((f) => prod.graph[f]!.inputs);
    expect(inputs.some((i) => i.includes('core/src/ascii/canvas.ts'))).toBe(true);
    expect(inputs.some((i) => i.includes('diagram-flowchart/src/ascii.ts'))).toBe(true);
  });

  it(`stays within ${LIMITS.asciiGzipBytes / 1024} KB gzip`, () => {
    const size = asciiSize(prod);
    expect(size.source).toBe('static');
    expect(size.gzip).toBeGreaterThan(0);
    expect(size.gzip).toBeLessThanOrEqual(LIMITS.asciiGzipBytes);
  });
});
