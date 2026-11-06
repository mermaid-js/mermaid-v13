/**
 * Both editor adapters bundle their first-paint grammars lazily (D134, #190): bundled from
 * source with code splitting, each type's generated grammar file is in a chunk of its own that
 * the entry reaches only through a dynamic `import()`, so a page that edits only flowcharts
 * loads no other type's grammar. `adapterChecks` holds the same for the published tarballs.
 */
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { ADAPTERS, FACET_IDS, GRAMMAR_FILE, lazyGrammarProblems } from './adapters-check.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');

describe.each(ADAPTERS)('%s, bundled from source', (name) => {
  it('loads each type’s grammar in its own chunk, through a dynamic import only', async () => {
    const entry = join(ROOT, 'packages', name.slice('@mermaid-js/'.length), 'src/index.ts');
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      splitting: true,
      format: 'esm',
      outdir: '/virtual/out',
      write: false,
      metafile: true,
      packages: 'external',
      logLevel: 'silent',
    });
    const meta = result.metafile;
    // Every lazily imported chunk has an `entryPoint` too, and esbuild's output order follows
    // the chunk hashes: pick the adapter entry's own output by its source path.
    const out = Object.keys(meta.outputs).find((o) => {
      const from = meta.outputs[o]?.entryPoint;
      return from !== undefined && resolve(from) === entry;
    })!;
    expect(out).toBeDefined();
    const grammars = FACET_IDS.map((id) => ({
      id,
      file: `src/generated/${GRAMMAR_FILE[name](id)}`,
    }));
    expect(lazyGrammarProblems(meta, out, grammars, (i) => i.includes('src/generated/'))).toEqual(
      []
    );
  });
});
