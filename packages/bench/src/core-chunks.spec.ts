/**
 * D313: core's chunking is stable. A new lazily loaded diagram grows core (R-PERF-8) by its
 * registry row only, whichever core subpaths it imports, because the build bundles every module
 * core shares with lazy chunks into one chunk (`stable-chunks.ts`).
 * Without that, esbuild gives each set of lazy importers its own shared chunk, and a diagram
 * that imports one more combination of `svg`, `text`, `layout` or `parser-kit` re-splits core.
 *
 * Each case registers one stub diagram, as a port does: it turns the `venn` placeholder row of
 * the generated registry into a lazily loaded row. The stubs import different core subpaths.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Bundle } from './build.ts';
import { bundle } from './build.ts';
import { closureSize, flowchartClosureSize } from './size-budget.ts';

/**
 * Core growth for one more lazy diagram, gzip bytes: its registry row (measured at 22–35 B) plus
 * minifier-name noise. One more shared chunk costs about 300–450 B.
 */
const ROW_ALLOWANCE = 64;

const ENTRY = fileURLToPath(new URL('../../mermaid/src/cdn.ts', import.meta.url));
const REGISTRY = fileURLToPath(
  new URL('../../mermaid/src/generated/registry.gen.ts', import.meta.url)
);
const PLACEHOLDER = "{ type: 'venn', pattern: /^\\s*venn-beta/ },";

const STUBS = {
  'svg and text, no layout': new URL('./__fixtures__/stub-diagram/svg-text.ts', import.meta.url),
  'svg only': new URL('./__fixtures__/stub-diagram/svg.ts', import.meta.url),
  'text only': new URL('./__fixtures__/stub-diagram/text.ts', import.meta.url),
  'layout only': new URL('./__fixtures__/stub-diagram/layout.ts', import.meta.url),
  'parser-kit only': new URL('./__fixtures__/stub-diagram/parser.ts', import.meta.url),
};
type Stub = keyof typeof STUBS;

/** Registers `stub` as a lazily loaded first-party diagram, in place of the `venn` placeholder. */
function registerStub(stub: URL): Plugin {
  return {
    name: 'register-stub-diagram',
    setup(b) {
      b.onLoad({ filter: /registry\.gen\.ts$/ }, () => {
        const source = readFileSync(REGISTRY, 'utf8');
        if (!source.includes(PLACEHOLDER)) throw new Error(`no ${PLACEHOLDER} row to replace`);
        const row =
          `{ type: 'venn', pattern: /^\\s*venn-beta/, id: 'venn', formats: ['svg'], ` +
          `load: () => import(${JSON.stringify(fileURLToPath(stub))}).then((m) => m.stub) },`;
        return { contents: source.replace(PLACEHOLDER, row), loader: 'ts' };
      });
    },
  };
}

interface Measured {
  bundle: Bundle;
  core: number;
  files: number;
  loaded: number;
}

async function measure(stableCore: boolean, stub?: URL): Promise<Measured> {
  const b = await bundle({
    entry: ENTRY,
    outdir: mkdtempSync(join(tmpdir(), 'mermaid-chunks-')),
    bench: false,
    plugins: stub ? [registerStub(stub)] : [],
    stableCore,
  });
  const core = closureSize(b);
  return {
    bundle: b,
    core: core.gzip,
    files: core.files.length,
    loaded: flowchartClosureSize(b).gzip,
  };
}

/** Source modules in the entry's static closure. */
const coreModules = (m: Measured): string[] =>
  m.bundle.staticClosure.flatMap((f) => m.bundle.graph[f]!.inputs).sort();

const stubs = Object.keys(STUBS) as Stub[];
let stable: Measured;
let plain: Measured;
const withStub = {} as Record<Stub, { stable: Measured; plain: Measured }>;

beforeAll(async () => {
  [stable, plain] = await Promise.all([measure(true), measure(false)]);
  await Promise.all(
    stubs.map(async (s) => {
      const [st, pl] = await Promise.all([measure(true, STUBS[s]), measure(false, STUBS[s])]);
      withStub[s] = { stable: st, plain: pl };
    })
  );
}, 180_000);

describe('stable core chunking (D313, R-PERF-8)', () => {
  it('loads core as the entry and one shared chunk', () => {
    expect(stable.files).toBe(2);
    expect(plain.files).toBeGreaterThan(2);
  });

  it('moves no module into or out of core, only between its files', () => {
    expect(coreModules(stable)).toEqual(coreModules(plain));
  });

  // D280, R-LAYOUT-8: `mermaid` loads the `tree` engine lazily; none of it may reach core.
  it('keeps the tree engine out of core, in a lazy chunk of its own', () => {
    const isTree = (input: string) => input.includes('core/src/layout/tree/');
    expect(coreModules(stable).filter(isTree)).toEqual([]);
    const files = Object.entries(stable.bundle.graph).filter(([, f]) => f.inputs.some(isTree));
    expect(files).toHaveLength(1);
    const [path, file] = files[0]!;
    expect(stable.bundle.staticClosure).not.toContain(path);
    expect(file.inputs.every(isTree)).toBe(true);
  });

  it.each(stubs)('grows core by the registry row only for one more lazy diagram (%s)', (s) => {
    const { stable: next } = withStub[s];
    expect(next.files, 'core files').toBe(stable.files);
    expect(next.core - stable.core, 'core growth, gzip bytes').toBeLessThanOrEqual(ROW_ALLOWANCE);
    expect(next.loaded - stable.loaded, 'loaded growth, gzip bytes').toBeLessThanOrEqual(
      ROW_ALLOWANCE
    );
  });

  // Otherwise the cases above would pass without the fix and guard nothing.
  it('re-splits core without it, for some stub', () => {
    const grown = stubs.filter((s) => {
      const { plain: next } = withStub[s];
      return next.files > plain.files && next.core - plain.core > ROW_ALLOWANCE;
    });
    expect(grown.length).toBeGreaterThan(0);
  });
});
