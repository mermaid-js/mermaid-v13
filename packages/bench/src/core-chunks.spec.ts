/**
 * D313: core's chunking is stable. A new lazily loaded diagram grows core (R-PERF-8) by its
 * registry row only, whichever core subpaths it imports, because the build bundles every module
 * core shares with lazy chunks into one chunk (`stable-chunks.ts`).
 * Without that, esbuild gives each set of lazy importers its own shared chunk, and a diagram
 * that imports one more combination of `svg`, `text`, `layout` or `parser-kit` re-splits core.
 *
 * Each case registers one stub diagram, as a port does: it adds a lazily loaded row for a
 * made-up type at the end of the generated registry. The stubs import different core subpaths.
 *
 * Spec #414 (D331, D322): a diagram's theme table is plain data on its plugin, loaded with its
 * chunk, so a themed stub grows core by its row only too. Its control imports the same table
 * statically, as core held each type's variables before, and grows core by the table.
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
/** The end of the registry's row list, where the stub's row goes. */
const ROWS_END = /^\];$/m;

const STUBS = {
  'svg and text, no layout': new URL('./__fixtures__/stub-diagram/svg-text.ts', import.meta.url),
  'svg only': new URL('./__fixtures__/stub-diagram/svg.ts', import.meta.url),
  'text only': new URL('./__fixtures__/stub-diagram/text.ts', import.meta.url),
  'layout only': new URL('./__fixtures__/stub-diagram/layout.ts', import.meta.url),
  'parser-kit only': new URL('./__fixtures__/stub-diagram/parser.ts', import.meta.url),
  'a theme table': new URL('./__fixtures__/stub-diagram/themed.ts', import.meta.url),
};
type Stub = keyof typeof STUBS;

/**
 * Registers `stub` as a lazily loaded first-party diagram, `stub-beta`, after the last row.
 * `inCore` imports it statically instead, into core's closure (the control for a theme table).
 */
function registerStub(stub: URL, inCore = false): Plugin {
  return {
    name: 'register-stub-diagram',
    setup(b) {
      b.onLoad({ filter: /registry\.gen\.ts$/ }, () => {
        const source = readFileSync(REGISTRY, 'utf8');
        if (!ROWS_END.test(source)) throw new Error('no end of the registry rows to add to');
        const path = JSON.stringify(fileURLToPath(stub));
        const load = inCore
          ? `() => Promise.resolve(stubInCore)`
          : `() => import(${path}).then((m) => m.stub)`;
        const row =
          `{ type: 'stub', pattern: /^\\s*stub-beta(?:\\s|$)/, id: 'stub', formats: ['svg'], ` +
          `load: ${load} },`;
        const head = inCore ? `import { stub as stubInCore } from ${path};\n` : '';
        return { contents: head + source.replace(ROWS_END, () => `  ${row}\n];`), loader: 'ts' };
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

async function measure(stableCore: boolean, stub?: URL, inCore = false): Promise<Measured> {
  const b = await bundle({
    entry: ENTRY,
    outdir: mkdtempSync(join(tmpdir(), 'mermaid-chunks-')),
    bench: false,
    plugins: stub ? [registerStub(stub, inCore)] : [],
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

/** The diagram packages whose lazily loaded entry reaches output file `target` statically. */
function diagramsLoading(m: Measured, target: string): string[] {
  const reaches = (path: string, seen = new Set<string>()): boolean => {
    if (path === target) return true;
    if (seen.has(path)) return false;
    seen.add(path);
    const imports = m.bundle.graph[path]?.imports ?? [];
    return imports.some((i) => i.kind === 'static' && reaches(i.path, seen));
  };
  const types = Object.entries(m.bundle.graph).flatMap(([path, f]) => {
    const type = /diagram-([\w-]+)\//.exec(f.entryPoint ?? '')?.[1];
    return type && reaches(path) ? [type] : [];
  });
  return [...new Set(types)].sort();
}

const stubs = Object.keys(STUBS) as Stub[];
let stable: Measured;
let plain: Measured;
const withStub = {} as Record<Stub, { stable: Measured; plain: Measured }>;
let themedInCore: Measured;

beforeAll(async () => {
  [stable, plain, themedInCore] = await Promise.all([
    measure(true),
    measure(false),
    measure(true, STUBS['a theme table'], true),
  ]);
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

  // D280, D533, R-LAYOUT-8: `mermaid` loads the `tree` and `swimlane` engines lazily; none of
  // either may reach core.
  it.each(['tree', 'swimlane'])(
    'keeps the %s engine out of core, in a lazy chunk of its own',
    (e) => {
      const isEngine = (input: string) => input.includes(`core/src/layout/${e}/`);
      expect(coreModules(stable).filter(isEngine)).toEqual([]);
      const files = Object.entries(stable.bundle.graph).filter(([, f]) => f.inputs.some(isEngine));
      expect(files).toHaveLength(1);
      const [path, file] = files[0]!;
      expect(stable.bundle.staticClosure).not.toContain(path);
      expect(file.inputs.every(isEngine)).toBe(true);
    }
  );

  // D672: line hops are on by default, so their code is part of core (D537 had it in a lazy
  // chunk), and `renderSync` draws them with nothing to preload.
  it('keeps the line-hop code in core', () => {
    const isHops = (input: string) => input.includes('core/src/layout/hops/');
    expect(coreModules(stable).filter(isHops).length).toBeGreaterThan(0);
  });

  // D326, D327: `compass` too, and any graph type may select it.
  it('keeps the compass engine out of core, in a lazy chunk of its own', () => {
    const isCompass = (input: string) => input.includes('core/src/layout/compass/');
    expect(coreModules(stable).filter(isCompass)).toEqual([]);
    const files = Object.entries(stable.bundle.graph).filter(([, f]) => f.inputs.some(isCompass));
    expect(files).toHaveLength(1);
    const [path, file] = files[0]!;
    expect(stable.bundle.staticClosure).not.toContain(path);
    expect(file.inputs.every(isCompass)).toBe(true);
  });

  // #818 (D559): `@mermaid-js/shared/parser/common-values` is a lazy chunk of its own, loaded by
  // the diagrams ported from a langium grammar and by no other diagram.
  it('keeps the common.langium value readers in a lazy chunk of their own', () => {
    const isValues = (input: string) => input.endsWith('shared/src/parser/common-values.ts');
    expect(coreModules(stable).filter(isValues)).toEqual([]);
    const files = Object.entries(stable.bundle.graph).filter(([, f]) => f.inputs.some(isValues));
    expect(files).toHaveLength(1);
    const [path, file] = files[0]!;
    expect(stable.bundle.staticClosure).not.toContain(path);
    expect(file.inputs.every(isValues)).toBe(true);
    expect(diagramsLoading(stable, path)).toEqual(
      [
        'architecture',
        'cynefin',
        'eventmodeling',
        'gitgraph',
        'info',
        'packet',
        'pie',
        'radar',
        'railroad',
        'treemap',
        'treeview',
        'wardley',
      ].sort()
    );
  });

  it.each(stubs)('grows core by the registry row only for one more lazy diagram (%s)', (s) => {
    const { stable: next } = withStub[s];
    expect(next.files, 'core files').toBe(stable.files);
    expect(next.core - stable.core, 'core growth, gzip bytes').toBeLessThanOrEqual(ROW_ALLOWANCE);
    expect(next.loaded - stable.loaded, 'loaded growth, gzip bytes').toBeLessThanOrEqual(
      ROW_ALLOWANCE
    );
  });

  // Otherwise the theme-table case would pass with the table in core and guard nothing.
  it('grows core by the table when the themed stub is in core (the control, spec #414)', () => {
    const lazy = withStub['a theme table'].stable;
    expect(themedInCore.core - stable.core, 'core growth, gzip bytes').toBeGreaterThan(
      ROW_ALLOWANCE
    );
    expect(themedInCore.core).toBeGreaterThan(lazy.core);
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
