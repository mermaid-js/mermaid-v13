// cspell:words mathjax
// Bundle test (#245, D178): a page that bundles mermaid with the math plugin keeps MathJax in a
// lazily imported chunk, and never loads it for a diagram without `$$…$$`. The chunk is
// deleted after the build: a diagram without math still renders, one with math cannot.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, type Metafile } from 'esbuild';
import type { createMermaid as CreateMermaid, ExtensionPlugin } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { engineBuild, PACKAGE_DIR, texDefaultFont } from '../scripts/bundle.ts';

const PAGE = `
import { createMermaid } from 'mermaid';
import math from './index.ts';
export { createMermaid, math };
`;

const isMathJax = (input: string) => input.includes('node_modules/@mathjax/');

async function bundlePage(outdir: string): Promise<Metafile> {
  const result = await build({
    stdin: { contents: PAGE, resolveDir: join(PACKAGE_DIR, 'src'), loader: 'ts' },
    outdir,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    target: 'es2022',
    metafile: true,
    conditions: ['mermaid-source'],
    plugins: [texDefaultFont],
    entryNames: 'page',
    logLevel: 'silent',
  });
  return result.metafile;
}

describe('bundle: MathJax loads only for a diagram with math', () => {
  it('keeps MathJax out of the static imports; a page without $$ never loads it', async () => {
    const outdir = mkdtempSync(join(tmpdir(), 'plugin-math-page-'));
    const meta = await bundlePage(outdir);
    const outputs = Object.entries(meta.outputs);
    const entry = outputs.find(([, o]) => o.entryPoint?.includes('stdin'));
    expect(entry).toBeDefined();
    // Everything the page imports statically, from the entry.
    const byPath = new Map(outputs);
    const closure = new Set<string>();
    const visit = (path: string) => {
      if (closure.has(path)) return;
      closure.add(path);
      for (const i of byPath.get(path)?.imports ?? [])
        if (i.kind === 'import-statement') visit(i.path);
    };
    visit(entry![0]);
    const staticInputs = [...closure].flatMap((p) => Object.keys(byPath.get(p)!.inputs));
    expect(staticInputs.filter(isMathJax)).toEqual([]);
    const mathjax = outputs.filter(([, o]) => Object.keys(o.inputs).some(isMathJax));
    expect(mathjax).toHaveLength(1);

    // Remove the MathJax chunk: only a diagram with math notices.
    for (const [path] of mathjax) rmSync(path);
    const page = (await import(pathToFileURL(join(process.cwd(), entry![0])).href)) as {
      createMermaid: typeof CreateMermaid;
      math: ExtensionPlugin;
    };
    const m = page.createMermaid();
    await m.registerExternalDiagrams([page.math]);
    const plain = await m.render('p', 'flowchart LR\n  A["costs $5 or $10"] --> B["x"]');
    expect(plain.svg).toContain('costs $5 or $10');
    // The math diagram asks for the deleted chunk, through the plugin's resource.
    await expect(m.render('q', 'flowchart LR\n  A["$$x^2$$"]')).rejects.toThrow(
      new RegExp(`Extension "math" failed in resources: .*${basename(mathjax[0]![0])}`)
    );
  }, 120_000);

  it('builds the published engine with the TeX font only', async () => {
    const outfile = join(mkdtempSync(join(tmpdir(), 'plugin-math-engine-')), 'engine.js');
    const result = await build({ ...engineBuild(outfile), metafile: true, logLevel: 'silent' });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.some((i) => i.includes('@mathjax/mathjax-tex-font/'))).toBe(true);
    expect(inputs.filter((i) => i.includes('mathjax-newcm-font'))).toEqual([]);
    expect(inputs.filter((i) => i.includes('packages/core/'))).toEqual([]);
    // About 677 KB gz (#244); a regression to New Computer Modern would add ~357 KB.
    const gz = gzipSync(readFileSync(outfile), { level: 9 }).length;
    expect(gz).toBeLessThan(800_000);
  }, 120_000);
});
