/**
 * Stable core chunking (D313) for the esbuild builds that size and ship core: the CDN build
 * (`packages/mermaid/scripts/cdn-build.ts`) and the bench's production bundle (`build.ts`).
 *
 * esbuild splits code by reachability: each module goes to the chunk of the exact set of entry
 * points that reach it through static imports, and every lazily imported module is an entry
 * point. A module the `mermaid` entry imports that some lazy chunk also imports lands in a
 * shared chunk, one per distinct set of lazy importers. So the files core loads depended on
 * which diagrams exist and which core subpaths each imports. A diagram that imports
 * `@mermaid-js/core/svg` and `/text` but not `/layout` (pie, the first) gave svg/text a lazy
 * importer set different from layout's, and esbuild cut the shared chunk in two: core grew by
 * one more file (its import and export lists, and a gzip stream with less context to share).
 *
 * The fix gives every module core shares one importer set. A first pass bundles the same
 * options; the modules of core's shared chunks (the entry's static closure minus the entry file
 * itself) are core's shared modules. The second pass appends a bare `import` of each of them to
 * every lazily loaded entry. Bare imports of side-effect-free modules emit no code, but esbuild
 * still follows them when it assigns chunks, so every lazy entry reaches every shared module and
 * they all land in one chunk, whichever diagrams exist and whatever they import.
 *
 * The anchors only point at modules the `mermaid` entry already loads statically, so no code
 * moves into or out of core, and no lazy chunk imports anything that core has not loaded.
 *
 * Node only, like the rest of the bench: never part of a published module.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Metafile, Plugin } from 'esbuild';

export interface StableCorePlan {
  /** Real paths of the modules core shares with lazy chunks (empty when it shares none). */
  readonly shared: readonly string[];
  /** Real path of each anchored entry → the shared modules it is anchored to. */
  readonly anchored: ReadonlyMap<string, readonly string[]>;
  /** `source` with the anchoring imports appended when `file` is anchored; otherwise as is. */
  anchor(file: string, source: string): string;
}

const realOf = (workingDir: string, p: string): string => realpathSync(resolve(workingDir, p));

/** Output files reachable from `root` through static imports (metafile output keys). */
function staticClosure(meta: Metafile, root: string): string[] {
  const seen = new Set<string>();
  const visit = (out: string): void => {
    if (seen.has(out)) return;
    seen.add(out);
    for (const i of meta.outputs[out]?.imports ?? [])
      if (i.kind === 'import-statement' && !i.external) visit(i.path);
  };
  visit(root);
  return [...seen];
}

/**
 * Source modules (metafile input keys) reachable from `roots` through static imports, in
 * evaluation order: a post-order walk, imports before importers.
 */
function staticInputs(meta: Metafile, roots: readonly string[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const walk = (input: string): void => {
    if (seen.has(input)) return;
    seen.add(input);
    for (const i of meta.inputs[input]?.imports ?? [])
      if (i.kind === 'import-statement' && !i.external) walk(i.path);
    order.push(input);
  };
  for (const r of roots) walk(r);
  return order;
}

/**
 * The plan for the second pass, from the first pass's metafile. `entry` is the main entry
 * (`src/cdn.ts`, `src/index.ts`); `workingDir` is esbuild's `absWorkingDir`, which metafile paths
 * are relative to. `groups` are the other entries, in groups that load alike: each entry of a
 * group is anchored to the shared modules any entry of its group reaches. By default there is
 * one group, every entry point but `entry` (in a single-entry build, its lazy imports). The CDN
 * build has two: the lazy imports, which load after core, and the `language` entries, which
 * editors load on their own and so are anchored only to the shared modules they use already.
 */
export function stableCorePlan(
  meta: Metafile,
  workingDir: string,
  entry: string,
  groups?: readonly (readonly string[])[]
): StableCorePlan {
  const main = realpathSync(entry);
  const inputOf = new Map(Object.keys(meta.inputs).map((i) => [realOf(workingDir, i), i]));
  const outputs = Object.keys(meta.outputs).filter((p) => !p.endsWith('.map'));
  const entryPoints = outputs
    .map((p) => meta.outputs[p]!.entryPoint)
    .filter((ep): ep is string => ep !== undefined);
  const mainOut = outputs.find((p) => {
    const ep = meta.outputs[p]!.entryPoint;
    return ep !== undefined && realOf(workingDir, ep) === main;
  });
  if (mainOut === undefined) throw new Error(`stable chunks: no output for the entry ${entry}`);
  const shared = new Set<string>();
  for (const out of staticClosure(meta, mainOut)) {
    if (out === mainOut) continue;
    for (const input of Object.keys(meta.outputs[out]!.inputs)) shared.add(input);
  }
  // In the main entry's evaluation order, which depends only on that entry, not on how the first
  // pass split the shared modules. The order moves no module to another chunk, only changes the
  // minifier's names (a few dozen bytes either way), so it is kept fixed.
  const inOrder = (inputs: Iterable<string>): string[] => {
    const set = new Set(inputs);
    return staticInputs(meta, [meta.outputs[mainOut]!.entryPoint!]).filter((i) => set.has(i));
  };
  const order = inOrder(shared);
  if (order.length !== shared.size)
    throw new Error(
      `stable chunks: ${shared.size - order.length} shared module(s) off the entry's imports`
    );
  const anchored = new Map<string, readonly string[]>();
  for (const group of groups ?? [entryPoints.filter((ep) => realOf(workingDir, ep) !== main)]) {
    const roots = group.map((f) => {
      const input = inputOf.get(realOf(workingDir, f));
      if (input === undefined) throw new Error(`stable chunks: ${f} is not in the build`);
      return input;
    });
    const reached = staticInputs(meta, roots).filter((i) => shared.has(i));
    const anchors = inOrder(reached).map((i) => realOf(workingDir, i));
    if (anchors.length > 0) for (const r of roots) anchored.set(realOf(workingDir, r), anchors);
  }
  return {
    shared: order.map((i) => realOf(workingDir, i)),
    anchored,
    anchor(file, source) {
      const anchors = anchored.get(realpathSync(file));
      if (anchors === undefined) return source;
      // The imports go last (imports hoist), so the source map's lines stay put.
      return `${source}\n${anchors.map((a) => `import ${JSON.stringify(a)};`).join('\n')}\n`;
    },
  };
}

/**
 * Loads each anchored entry with the plan's imports appended. Put it after any plugin that loads
 * an entry itself (the CDN build's lazy-import rewrite), which then calls `plan.anchor` instead.
 */
export function stableCorePlugin(plan: StableCorePlan): Plugin {
  return {
    name: 'mermaid-stable-core',
    setup(b) {
      if (plan.anchored.size === 0) return;
      b.onLoad({ filter: /\.[cm]?[jt]s$/ }, (args) => {
        const file = realpathSync(args.path);
        if (!plan.anchored.has(file)) return undefined;
        return {
          contents: plan.anchor(file, readFileSync(file, 'utf8')),
          loader: /\.[cm]?ts$/.test(file) ? 'ts' : 'js',
          resolveDir: dirname(file),
        };
      });
    },
  };
}
