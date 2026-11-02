/**
 * Extension plugins and their hook runner (DESIGN §12.2, R-PLUG-2, D52, D70).
 *
 * Hooks run in registration order. Each gets the same frozen {@link HookContext} for the
 * render, so a hook cannot change config. `postLayout` must return the kind it was given;
 * `postRender` edits the compact tree, and the draw step re-checks the allow-list after the
 * last one (R-SEC-2). `afterMount` is typed here but only `mermaid`'s DOM adapter calls it,
 * through {@link HookRun.afterMount}: core never touches the DOM.
 */
import type { LayoutModel } from '../layout/types.ts';
import type { AstNode } from '../parser-kit/ast.ts';
import type { SvgTree } from '../svg/tree.ts';
import { MermaidError } from './errors.ts';
import type { RenderContext } from './types.ts';

/** What `postLayout` hooks get and return: graph diagrams carry the shared `LayoutModel`. */
export type LaidOut =
  | { readonly kind: 'graph'; readonly diagram: string; readonly layout: LayoutModel }
  | { readonly kind: 'custom'; readonly diagram: string; readonly layout: unknown };

/** Features an extension handles, so core does not warn about them. */
export type ExtensionClaim = 'callbacks';

/** The per-render context hooks get: the frozen render context plus two hook-only fields. */
export interface HookContext extends RenderContext {
  /** The diagram plugin id (`flowchart`). A hook written for one diagram type checks it. */
  readonly diagram: string;
  /**
   * This extension's own scratch object for this render: what `postParse` finds (for
   * example click callbacks) and `afterMount` needs. Not shared with other extensions.
   */
  readonly state: Record<string, unknown>;
}

/**
 * An extension plugin (DESIGN §12.2). `El` and `R` are the DOM element and the render
 * result `afterMount` gets; `mermaid` exports it as `ExtensionPlugin<Element, RenderResult>`.
 */
export interface ExtensionPlugin<El = unknown, R = unknown> {
  readonly id: string;
  /** Data in, data out: returns the AST the next hook sees. */
  postParse?(ast: AstNode, ctx: HookContext): AstNode;
  /** Must return the same `kind`; graph-only hooks pass other kinds through. */
  postLayout?(laidOut: LaidOut, ctx: HookContext): LaidOut;
  /** Edits the compact tree in place, before serialisation. */
  postRender?(tree: SvgTree, ctx: HookContext): void;
  /** DOM adapter only (`run`, `mount`, `bindFunctions`). `state` is the render's scratch. */
  afterMount?(el: El, result: R, state: Record<string, unknown>): void;
  readonly claims?: readonly ExtensionClaim[];
}

type Hook = 'postParse' | 'postLayout' | 'postRender' | 'afterMount';

/** One render's hooks, created by {@link HookRunner.start}. */
export interface HookRun<El = unknown, R = unknown> {
  /** True when a `postRender` hook exists: the draw step then writes into a tree. */
  readonly editsTree: boolean;
  /** True when an `afterMount` hook exists: the adapter then offers `bindFunctions`. */
  readonly mounts: boolean;
  postParse(ast: AstNode): AstNode;
  postLayout(laidOut: LaidOut): LaidOut;
  postRender(tree: SvgTree): void;
  /** Runs every `afterMount` hook with this render's state. For the DOM adapter. */
  afterMount(el: El, result: R): void;
}

function failed(plugin: { id: string }, hook: Hook, e: unknown): MermaidError {
  if (e instanceof MermaidError) return e;
  const why = e instanceof Error ? e.message : String(e);
  return new MermaidError('INTERNAL', `Extension "${plugin.id}" failed in ${hook}: ${why}`, {
    cause: e,
  });
}

/**
 * The registered extensions, in registration order. One per `mermaid` API object; call
 * {@link HookRunner.start} once per render.
 */
export class HookRunner<El = unknown, R = unknown> {
  private readonly list: ExtensionPlugin<El, R>[] = [];

  /** Adds an extension, or replaces the one with the same id in place (keeping its order). */
  register(plugin: ExtensionPlugin<El, R>): void {
    if (typeof plugin.id !== 'string' || plugin.id === '')
      throw new TypeError('An extension plugin needs a non-empty string id');
    const at = this.list.findIndex((p) => p.id === plugin.id);
    if (at >= 0) this.list[at] = plugin;
    else this.list.push(plugin);
  }

  get size(): number {
    return this.list.length;
  }

  /** Every claim of every extension, for `DiagramParseContext.claims`. */
  claims(): readonly string[] {
    return [...new Set(this.list.flatMap((p) => p.claims ?? []))];
  }

  /** The hooks of one render with `ctx`; `diagram` is the diagram plugin id. */
  start(ctx: RenderContext, diagram: string): HookRun<El, R> {
    const list = [...this.list];
    const contexts = new Map<ExtensionPlugin<El, R>, HookContext>();
    const states = new Map<ExtensionPlugin<El, R>, Record<string, unknown>>();
    const stateOf = (p: ExtensionPlugin<El, R>): Record<string, unknown> => {
      let s = states.get(p);
      if (!s) states.set(p, (s = {}));
      return s;
    };
    const context = (p: ExtensionPlugin<El, R>): HookContext => {
      let c = contexts.get(p);
      if (!c) contexts.set(p, (c = Object.freeze({ ...ctx, diagram, state: stateOf(p) })));
      return c;
    };
    const each = <T>(hook: Hook, value: T, call: (p: ExtensionPlugin<El, R>, v: T) => T): T => {
      for (const p of list) {
        if (typeof p[hook] !== 'function') continue;
        try {
          value = call(p, value);
        } catch (e) {
          throw failed(p, hook, e);
        }
      }
      return value;
    };
    return {
      editsTree: list.some((p) => typeof p.postRender === 'function'),
      mounts: list.some((p) => typeof p.afterMount === 'function'),
      postParse: (ast) =>
        each('postParse', ast, (p, a) => {
          const out = p.postParse!(a, context(p));
          if (typeof out !== 'object' || out === null || typeof out.type !== 'string')
            throw new TypeError('postParse must return an AST node');
          return out;
        }),
      postLayout: (laidOut) =>
        each('postLayout', laidOut, (p, l) => {
          const out = p.postLayout!(l, context(p));
          if (typeof out !== 'object' || out === null || out.kind !== l.kind)
            throw new TypeError(
              `postLayout must return the kind it was given ("${l.kind}"), got "${
                (out as { kind?: unknown } | null)?.kind as string
              }"`
            );
          if (out.diagram !== l.diagram)
            throw new TypeError('postLayout must not change the diagram id');
          return out;
        }),
      postRender: (tree) =>
        void each('postRender', tree, (p, t) => {
          p.postRender!(t, context(p));
          return t;
        }),
      afterMount: (el, result) =>
        void each('afterMount', el, (p, e) => {
          p.afterMount!(e, result, stateOf(p));
          return e;
        }),
    };
  }
}
