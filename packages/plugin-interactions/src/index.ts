/**
 * Interactions extension plugin: v12 click callbacks and `bindFunctions` (DESIGN §12.3,
 * R-PLUG-9, R-SVG-5, D47, D74).
 *
 * `postParse` collects the `click … callback` / `call` statements of the AST (any node with a
 * `callback` field, see `AstCallback`) into the render's state and claims `callbacks`, so core
 * does not warn. `afterMount` (reached through `RenderResult.bindFunctions` or the DOM
 * adapter's `run` / `mount`) adds a click listener to each rendered node (`g.node[data-id]`)
 * that calls the named function, resolved on `window` the way v12's `utils.runFunc` did.
 *
 * Nothing in the diagram text can turn this on: only registering the plugin does
 * (`registerExternalDiagrams([interactions])`). The svg itself is unchanged, so it still
 * passes the allow-list (R-SEC-2).
 */
import type { ExtensionPlugin, HookContext } from '@mermaid-js/core';
import type { AstCallback, AstNode } from '@mermaid-js/core/parser-kit';

/** One callback to bind: a node id, the function name and its arguments. */
export interface Binding {
  readonly id: string;
  readonly name: string;
  readonly args: readonly string[];
}

/** The state `postParse` hands to `afterMount`. */
interface InteractionState {
  bindings?: Binding[];
  /** Nodes already bound in this render, so a second `bindFunctions` call adds nothing. */
  bound?: WeakSet<object>;
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

function collect(node: AstNode, out: Binding[]): void {
  const callback = (node as AstNode & { callback?: AstCallback }).callback;
  if (callback !== undefined)
    for (const id of callback.targets)
      out.push({ id, name: callback.name, args: callbackArgs(id, callback.args) });
  for (const child of node.children ?? []) collect(child, out);
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

/** The interactions extension. Register it with `registerExternalDiagrams([interactions])`. */
export const interactions: ExtensionPlugin<Element, unknown> = {
  id: 'interactions',
  claims: ['callbacks'],
  postParse(ast: AstNode, ctx: HookContext): AstNode {
    const bindings: Binding[] = [];
    collect(ast, bindings);
    (ctx.state as InteractionState).bindings = bindings;
    return ast;
  },
  afterMount(el: Element, _result: unknown, state: Record<string, unknown>): void {
    const { bindings = [] } = state as InteractionState;
    if (bindings.length === 0) return;
    const bound = ((state as InteractionState).bound ??= new WeakSet());
    const byId = new Map<string, Binding[]>();
    for (const b of bindings) byId.set(b.id, [...(byId.get(b.id) ?? []), b]);
    for (const node of Array.from(el.querySelectorAll('g.node[data-id]'))) {
      const mine = byId.get(node.getAttribute('data-id') ?? '');
      if (mine === undefined || bound.has(node)) continue;
      bound.add(node);
      for (const b of mine)
        node.addEventListener('click', () => runFunction(b.name, b.args), false);
    }
  },
};

export default interactions;
