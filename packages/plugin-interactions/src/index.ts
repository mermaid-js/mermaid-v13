/**
 * Interactions extension plugin: v12 click callbacks, `bindFunctions` and element menus
 * (DESIGN §12.3, R-PLUG-9, R-SVG-5, D47, D74, D105, D554).
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
 * (`registerExternalDiagrams([interactions])`), and callbacks also need
 * `initialize({ securityLevel: 'loose' })`, as in v12 (D554). The svg itself is unchanged, so
 * it still passes the allow-list (R-SEC-2).
 */
import type { ExtensionPlugin } from '@mermaid-js/core';
import { nodeId, type AstNode } from '@mermaid-js/core/parser-kit';
import { callbackArgs } from '@mermaid-js/shared/parser/callback';
import { defineFeature, isBag, type AnyFeature } from './feature.ts';
import { menus } from './menus.ts';
import { createScope, ownIds, rootsFor } from './scope.ts';

/** v12's argument list of a `call fn(…)`: the shared one (`@mermaid-js/shared/parser/callback`). */
export { callbackArgs } from '@mermaid-js/shared/parser/callback';

/** One callback to bind: a node id, the function name and its arguments. */
export interface Binding {
  readonly id: string;
  readonly name: string;
  readonly args: readonly string[];
}

/**
 * Looks `name` up on `window` (`fn`, `app.handlers.fn`) as v12's `runFunc` did and calls it.
 * A missing name does nothing (v12 logged an error). Reached only from a listener bound under
 * `securityLevel: 'loose'` (see `callbacks`).
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
 * The `clickable` elements of `svg` whose `data-id` is in `ids`: a gantt task's bar and label
 * (v12 bound both, `<id>` and `<id>-text`), which are not `g.node` groups.
 */
function clickableElements(svg: Element, ids: ReadonlySet<string>): Map<string, Element[]> {
  const out = new Map<string, Element[]>();
  for (const el of ownIds(svg)) {
    const id = el.getAttribute('data-id') ?? '';
    if (ids.has(id) && (el.getAttribute('class') ?? '').split(' ').includes('clickable'))
      out.set(id, [...(out.get(id) ?? []), el]);
  }
  return out;
}

/** One render's callbacks: what to bind, and whether the level lets them run. */
interface Callbacks {
  readonly bindings: Binding[];
  /** `securityLevel: 'loose'` as `initialize()` set it; diagram text cannot (a secure key). */
  readonly loose: boolean;
  /** Warns `CALLBACK_IGNORED` once, at the first callback the level leaves unbound. */
  refuse(): void;
}

const NOT_LOOSE =
  "Click callbacks are ignored: they run only with `initialize({ securityLevel: 'loose' })`.";

/**
 * `click … callback` / `call` (`AstCallback`), bound to the nodes' `g.node[data-id]`: flowchart
 * nodes and class boxes alike (the class parser emits the same field). An id with no such node
 * binds its `clickable` elements instead (gantt's bar and label).
 *
 * As in v12, where each diagram's `setClickFun` returned early unless the level was `loose`
 * (#697, D554): under any other level nothing is collected, so nothing is bound, and the
 * render warns `CALLBACK_IGNORED` once. Core maps `loose` to its `default` level for URLs
 * (D75), so the configured value is read here.
 */
const callbacks = defineFeature<Callbacks>({
  field: 'callback',
  claim: 'callbacks',
  start(ctx) {
    let warned = false;
    return {
      bindings: [],
      loose: (ctx.config as { securityLevel?: unknown }).securityLevel === 'loose',
      refuse() {
        if (warned) return;
        warned = true;
        ctx.warn({ code: 'CALLBACK_IGNORED', message: NOT_LOOSE });
      },
    };
  },
  collect(value, acc) {
    if (!isBag(value) || typeof value.name !== 'string' || !Array.isArray(value.targets)) return;
    if (!acc.loose) return acc.refuse();
    const { name, args } = value;
    for (const id of value.targets)
      if (typeof id === 'string')
        acc.bindings.push({
          id,
          name,
          args: callbackArgs(id, typeof args === 'string' ? args : undefined),
        });
  },
  plan: ({ bindings }) => ({
    key: JSON.stringify(bindings),
    bind(scope) {
      if (bindings.length === 0) return;
      const isNode = (g: Element) =>
        (g.getAttribute('class') ?? '').split(' ').includes('node') &&
        drawsNode(g, g.getAttribute('data-id') ?? '');
      const ids = new Set(bindings.map((b) => b.id));
      const anchors = scope.anchors(ids, isNode);
      const rest = new Set([...ids].filter((id) => !anchors.has(id)));
      if (rest.size > 0)
        for (const [id, els] of clickableElements(scope.svg, rest)) anchors.set(id, els);
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
