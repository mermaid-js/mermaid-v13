import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bundle } from './build.ts';

const entry = new URL('./__fixtures__/timed-pipeline.ts', import.meta.url).pathname;
const out = () => mkdtempSync(join(tmpdir(), 'mermaid-bench-'));

describe('bench builds', () => {
  it('compiles the stage timing out of production bundles', async () => {
    const prod = await bundle({ entry, outdir: out(), bench: false });
    const code = prod.files.map((f) => readFileSync(join(prod.outdir, f.path), 'utf8')).join('\n');
    expect(code).not.toMatch(/record\(|"parse"|__MERMAID_BENCH__/);
  });

  it('keeps it in bench builds, which record each stage through the installed clock', async () => {
    const bench = await bundle({ entry, outdir: out(), bench: true });
    const mod = (await import(pathToFileURL(join(bench.outdir, bench.entryFile)).href)) as {
      installStageClock(c: { now(): number; record(s: string, ms: number): void }): void;
      render(text: string): Promise<string>;
    };
    let t = 0;
    const recorded: [string, number][] = [];
    mod.installStageClock({ now: () => (t += 5), record: (s, ms) => recorded.push([s, ms]) });
    expect(await mod.render('a\nb')).toContain('data-lines="2"');
    expect(recorded).toEqual([['parse', 5]]);
  });

  it('sizes the static import closure separately from lazily loaded chunks', async () => {
    const prod = await bundle({ entry, outdir: out(), bench: false });
    expect(prod.files.length).toBe(2);
    expect(prod.staticClosure).toEqual([prod.entryFile]);
    const [entryFile, chunk] = [
      prod.files.find((f) => f.path === prod.entryFile)!,
      prod.files.find((f) => f.path !== prod.entryFile)!,
    ];
    expect(readFileSync(join(prod.outdir, chunk.path), 'utf8')).toContain('lazy-chunk-padding');
    // The repeated padding compresses well: gzip is far smaller than raw.
    expect(chunk.gzip).toBeLessThan(chunk.raw / 2);
    expect(entryFile.gzip).toBeGreaterThan(0);
  });
});
