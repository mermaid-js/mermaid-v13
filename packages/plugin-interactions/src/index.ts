/**
 * Interactions extension plugin: v12 click callbacks, `bindFunctions` and element menus
 * (DESIGN §12.3, R-PLUG-9, R-SVG-5, D47, D74, D105).
 *
 * The plugin is a table of features (`FEATURES`), each owning one AST field from collection
 * to binding (`feature.ts`): `callback` (`AstCallback`: `click … callback` / `call`) and `menu`
 * (`AstMenu`: sequence actor `link`/`links`/`properties`/`details`, see `menus.ts`). A new
 * feature is one more entry. `postParse` walks the AST once and hands each field it finds, on
 * any node kind, to its feature; the plugin claims every feature's claim, so the diagram does
 * not warn. `afterMount` (reached through `RenderResult.bindFunctions` or the DOM adapter's
 * `run` / `mount`) binds each feature in each diagram root svg of the element (`scope.ts`).
 *
 * Binding is keyed on content per svg: binding the same interactions again adds nothing, and
 * different ones (a re-render whose svg did not change) replace what was bound before.
 *
 * Nothing in the diagram text can turn this on: only registering the plugin does
 * (`registerExternalDiagrams([interactions])`). The svg itself is unchanged, so it still
 * passes the allow-list (R-SEC-2).
 */
import type { ExtensionPlugin } from '@mermaid-js/core';
import { nodeId, type AstNode } from '@mermaid-js/core/parser-kit';
import { defineFeature, isBag, type AnyFeature } from './feature.ts';
import { menus } from './menus.ts';
import { createScope, rootsFor } from './scope.ts';

/** One callback to bind: a node id, the function name and its arguments. */
export interface Binding {
  readonly id: string;
  readonly name: string;
  readonly args: readonly string[];
}

/**
 * v12 split at each comma followed by an even number of `"` up to the end
 * (`/,(?=(?:(?:[^"]*"){2})*[^"]*$)/`); this is the same split as a linear scan.
 */
function splitArgs(args: string): string[] {
  let after = 0;
  for (const c of args) if (c === '"') after++;
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === '"') after--;
    else if (c === ',' && after % 2 === 0) {
      out.push(args.slice(from, i));
      from = i + 1;
    }
  }
  out.push(args.slice(from));
  return out;
}

/**
 * v12's argument list: split on commas outside double quotes, trim, drop one pair of
 * surrounding quotes; no arguments means the node id.
 */
export function callbackArgs(id: string, args: string | undefined): string[] {
  if (args === undefined) return [id];
  const list = splitArgs(args).map((a) => {
    const item = a.trim();
    return item.length >= 2 && item.startsWith('"') && item.endsWith('"')
      ? item.slice(1, -1)
      : item;
  });
  return list.length === 0 ? [id] : list;
}

/**
 * Looks `name` up on `window` (`fn`, `app.handlers.fn`) as v12's `runFunc` did and calls it.
 * A missing name does nothing (v12 logged an error).
 */
export function runFunction(name: string, args: readonly string[]): void {
  const path = name.split('.');
  let owner: unknown = globalThis;
  for (const key of path.slice(0, -1)) {
    owner = (owner as Record<string, unknown> | null | undefined)?.[key];
    if (owner === null || owner === undefined) return;
  }
  const fn = (owner as Record<string, unknown>)[path[path.length - 1]!];
  if (typeof fn === 'function') (fn as (...a: string[]) => unknown).apply(owner, [...args]);
}

/**
 * True when `g` draws the node `id` itself: its `data-ast` (`n:A`, `n:A@2`, `s:S`) names `id`.
 * Other kinds may share a `data-id` with a node: a class note is `note0` and a lollipop
 * interface `interface0` (`data-ast` `note:1`, `i:A`), and a class can have either name.
 * `data-id` is the raw name and `data-ast` escapes it (`B#2` is `n:B%232`), so `id` is escaped
 * the same way before comparing.
 */
function drawsNode(g: Element, id: string): boolean {
  const ast = g.getAttribute('data-ast');
  if (ast === null) return true;
  const named = ast.slice(ast.indexOf(':') + 1);
  const escaped = nodeId(id).slice('n:'.length);
  return named === escaped || named.startsWith(`${escaped}@`);
}

/**
 * `click … callback` / `call` (`AstCallback`), bound to the nodes' `g.node[data-id]`: flowchart
 * nodes and class boxes alike (the class parser emits the same field).
 */
const callbacks = defineFeature<Binding[]>({
  field: 'callback',
  claim: 'callbacks',
  start: () => [],
  collect(value, acc) {
    if (!isBag(value) || typeof value.name !== 'string' || !Array.isArray(value.targets)) return;
    const { name, args } = value;
    for (const id of value.targets)
      if (typeof id === 'string')
        acc.push({ id, name, args: callbackArgs(id, typeof args === 'string' ? args : undefined) });
  },
  plan: (bindings) => ({
    key: JSON.stringify(bindings),
    bind(scope) {
      if (bindings.length === 0) return;
      const isNode = (g: Element) =>
        (g.getAttribute('class') ?? '').split(' ').includes('node') &&
        drawsNode(g, g.getAttribute('data-id') ?? '');
      const anchors = scope.anchors(new Set(bindings.map((b) => b.id)), isNode);
      for (const b of bindings)
        for (const node of anchors.get(b.id) ?? [])
          scope.listen(node, 'click', () => runFunction(b.name, b.args));
    },
  }),
});

/** Every feature, in binding order. A new interaction feature is a new entry here. */
const FEATURES: readonly AnyFeature[] = [callbacks, menus];

/** What `postParse` hands to `afterMount`: each feature's collected state, by table index. */
interface InteractionState {
  collected?: unknown[];
}

/** What each diagram root svg has bound: the content key and how to undo it. */
const boundRoots = new WeakMap<Element, { key: string; teardown: () => void }>();

function walk(node: AstNode, visit: (node: AstNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/** The interactions extension. Register it with `registerExternalDiagrams([interactions])`. */
export const interactions: ExtensionPlugin<Element, unknown> = {
  id: 'interactions',
  claims: FEATURES.map((f) => f.claim),
  postParse(ast, ctx) {
    const collected = FEATURES.map((f) => f.start(ctx));
    walk(ast, (node) => {
      const fields = node as unknown as Record<string, unknown>;
      FEATURES.forEach((f, i) => {
        if (fields[f.field] !== undefined) f.collect(fields[f.field], collected[i]);
      });
    });
    (ctx.state as InteractionState).collected = collected;
    return ast;
  },
  afterMount(el, result, state) {
    const { collected } = state as InteractionState;
    if (collected === undefined) return;
    const svgText = (result as { svg?: unknown } | undefined)?.svg;
    const plans = FEATURES.map((f, i) => f.plan(collected[i], el.ownerDocument));
    const key = JSON.stringify(plans.map((p) => p.key));
    for (const svg of rootsFor(el, typeof svgText === 'string' ? svgText : '')) {
      const before = boundRoots.get(svg);
      if (before?.key === key) continue;
      before?.teardown();
      const { scope, teardown } = createScope(svg);
      for (const p of plans) p.bind(scope);
      boundRoots.set(svg, { key, teardown });
    }
  },
};

export default interactions;
