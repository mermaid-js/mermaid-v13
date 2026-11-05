/**
 * The adapter bundles its first-paint Monarch files lazily (D134, #190): bundled with code
 * splitting, each type's generated Monarch file is in a chunk of its own that the entry reaches
 * only through a dynamic `import()`, so a page that edits only flowcharts loads no other
 * type's Monarch file.
 */
import { join } from 'node:path';
import { build } from 'esbuild';
import type { Metafile } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { HIGHLIGHTED_TYPES } from '../scripts/monarch.ts';

const ENTRY = join(import.meta.dirname, 'index.ts');

/** Every output file the entry chunk loads with a static import, itself included. */
function staticClosure(meta: Metafile, entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (out: string) => {
    if (seen.has(out)) return;
    seen.add(out);
    for (const i of meta.outputs[out]?.imports ?? []) {
      if (i.kind === 'import-statement' && !i.external) visit(i.path);
    }
  };
  visit(entry);
  return seen;
}

describe('the bundled adapter', () => {
  it('loads each type’s Monarch file in its own chunk, through a dynamic import only', async () => {
    const result = await build({
      entryPoints: [ENTRY],
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
    const entry = Object.keys(meta.outputs).find((o) => meta.outputs[o]?.entryPoint)!;
    const eager = staticClosure(meta, entry);
    const generatedIn = (out: string) =>
      Object.keys(meta.outputs[out]?.inputs ?? {}).filter((i) => i.includes('src/generated/'));
    for (const out of eager) expect(generatedIn(out), out).toEqual([]);
    for (const id of HIGHLIGHTED_TYPES) {
      const chunks = Object.keys(meta.outputs).filter((o) =>
        generatedIn(o).some((i) => i.endsWith(`/${id}.monarch.js`))
      );
      expect(chunks, id).toHaveLength(1);
      const others = generatedIn(chunks[0]!).filter((i) => !i.includes(`/generated/${id}.`));
      expect(others, id).toEqual([]);
    }
  });
});
