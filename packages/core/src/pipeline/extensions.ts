/**
 * Extension plugins and their hook runner (DESIGN §12.2, R-PLUG-2, D52, D70).
 *
 * Hooks run in registration order. Each gets the same frozen {@link HookContext} for the
 * render, so a hook cannot change config. `postLayout` must return the kind it was given;
 * `postRender` edits the compact tree, and the draw step re-checks the allow-list after the
 * last one (R-SEC-2). `afterMount` is typed here but only `mermaid`'s DOM adapter calls it,
 * through {@link HookRun.afterMount}: core never touches the DOM.
 *
 * An extension can also load things lazily (R-API-2, D178): its `resources` say what a parsed
 * diagram needs from it, `prepare()` loads those, and `renderSync` throws `NotLoadedError` (or
 * draws placeholders) while they are missing, as for a diagram's own resources.
 */
import type { ConfigFragment } from '../config/fragment.ts';
import type { ResolvedConfig } from '../config/resolve.ts';
import type { LayoutModel } from '../layout/types.ts';
import type { AstNode } from '../parser-kit/ast.ts';
import type { ParseResult } from '../parser-kit/result.ts';
import { isAllowedAttr, isAllowedTag } from '../svg/allowlist.ts';
import type { SvgTree } from '../svg/tree.ts';
import type { InlineBox } from '../svg/writer.ts';
import type { InlineProvider } from '../text/inline.ts';
import { MermaidError, type Resource } from './errors.ts';
import type { RenderContext } from './types.ts';

/**
 * What `postLayout` hooks get and return: graph diagrams carry the shared `LayoutModel`.
 * `units` says what its lengths are: `px` for SVG, `cell` for text output (D86).
 */
export type LaidOut =
  | {
      readonly kind: 'graph';
      readonly diagram: string;
      readonly units: 'px' | 'cell';
      readonly layout: LayoutModel;
    }
  | {
      readonly kind: 'custom';
      readonly diagram: string;
      readonly units: 'px' | 'cell';
      readonly layout: unknown;
    };

/**
 * Features an extension handles, so a diagram does not warn about them: `callbacks`
 * (`CALLBACK_IGNORED`), `menus` (element menus, `AstMenu`).
 */
export type ExtensionClaim = 'callbacks' | 'menus';

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
  /**
   * Inline-box providers, one per delimiter pair (D177): label layout hands each delimited span
   * to its provider and draws the box it returns. The first registered provider of a pair wins.
   */
  readonly inline?: readonly InlineProvider[];
  /** What it loads lazily, and when a diagram needs it (R-API-2, D178). */
  readonly resources?: ExtensionResources;
  /**
   * The extension's config fragment (D153): its own keys, defaults, aliases and theme
   * variables, known to the validator while the extension is registered.
   */
  readonly config?: ConfigFragment;
}

/** What an extension's `resources.missing` is asked with, besides the parse. */
export interface ResourceRequest {
  readonly config: ResolvedConfig;
  /** The output being prepared or drawn: text output draws no inline boxes (D179). */
  readonly format: 'svg' | 'ascii';
}

/**
 * Resources an extension loads lazily (R-API-2, D178), such as an engine its inline provider
 * needs. `missing` is synchronous and pure: `prepare` asks it what to load, and `renderSync`
 * asks it again and throws `NotLoadedError` listing what is still missing.
 */
export interface ExtensionResources {
  /** Every resource it can load; `preload` loads those of a kind it is asked for (`math`). */
  readonly provides: readonly Resource[];
  /** Those of `provides` that `parse` needs and that have not loaded yet. */
  missing(parse: ParseResult<unknown>, request: ResourceRequest): readonly Resource[];
  /** Loads one of `provides`; once it resolves, `missing` no longer lists it. */
  load(resource: Resource): Promise<void>;
}

/** A resource an extension reported, and how to load it. */
export interface ExtensionNeed {
  readonly resource: Resource;
  load(): Promise<void>;
}

type Hook = 'postParse' | 'postLayout' | 'postRender' | 'afterMount' | 'inline' | 'resources';

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

function checkBox(box: InlineBox): InlineBox {
  const { width, height, baseline } = box as Partial<InlineBox>;
  const node = (box as { node?: unknown }).node;
  for (const [name, n] of [
    ['width', width],
    ['height', height],
    ['baseline', baseline],
  ] as const) {
    if (typeof n !== 'number' || !Number.isFinite(n) || (name !== 'baseline' && n < 0))
      throw new TypeError(`an inline box needs a finite ${name}, got ${String(n)}`);
  }
  checkFragment(node, 0);
  return box;
}

const MAX_DEPTH = 64;

/** The whole fragment: allowed tags and attribute names, children fragments or strings. */
function checkFragment(node: unknown, depth: number): void {
  if (depth > MAX_DEPTH)
    throw new TypeError(`an inline box's node is nested over ${MAX_DEPTH} deep`);
  const f = node as { tag?: unknown; attrs?: unknown; children?: unknown } | null;
  if (typeof f !== 'object' || f === null || typeof f.tag !== 'string' || !isAllowedTag(f.tag))
    throw new TypeError(`an inline box's node holds ${describe(f)}, not an allowed SVG element`);
  if (f.attrs !== undefined) {
    if (typeof f.attrs !== 'object' || f.attrs === null)
      throw new TypeError(`<${f.tag}> in an inline box has attrs that are not an object`);
    for (const name of Object.keys(f.attrs))
      if (!isAllowedAttr(name))
        throw new TypeError(`${name} on <${f.tag}> in an inline box is not an allowed attribute`);
  }
  if (f.children === undefined) return;
  if (!Array.isArray(f.children))
    throw new TypeError(`<${f.tag}> in an inline box has children that are not an array`);
  for (const child of f.children as unknown[])
    if (typeof child !== 'string') checkFragment(child, depth + 1);
}

function describe(f: { tag?: unknown } | null): string {
  if (f === null || typeof f !== 'object') return String(f);
  return typeof f.tag === 'string' ? `<${f.tag}>` : 'an element without a tag';
}

/** `provider` with its boxes checked, and its failures reported as `plugin`'s. */
function guarded(plugin: { id: string }, provider: InlineProvider): InlineProvider {
  const { open, close } = provider;
  if (typeof open !== 'string' || open === '' || typeof close !== 'string' || close === '')
    throw new TypeError(
      `Extension "${plugin.id}": an inline provider needs open and close strings`
    );
  if (typeof provider.box !== 'function')
    throw new TypeError(`Extension "${plugin.id}": an inline provider's box must be a function`);
  return {
    open,
    close,
    box(source, request) {
      try {
        const box = provider.box(source, request);
        return box === undefined ? undefined : checkBox(box);
      } catch (e) {
        throw failed(plugin, 'inline', e);
      }
    },
  };
}

const sameResource = (a: Resource, b: Resource): boolean => a.kind === b.kind && a.name === b.name;

function checkResources(plugin: { id: string }, r: unknown): ExtensionResources | undefined {
  if (r === undefined) return undefined;
  const res = r as Partial<ExtensionResources> | null;
  if (
    typeof res !== 'object' ||
    res === null ||
    !Array.isArray(res.provides) ||
    typeof res.missing !== 'function' ||
    typeof res.load !== 'function'
  )
    throw new TypeError(`Extension "${plugin.id}": resources needs provides, missing() and load()`);
  return res as ExtensionResources;
}

/** `resource` and its loader, with a failed load reported as `plugin`'s. */
function need(
  plugin: { id: string },
  resources: ExtensionResources,
  resource: Resource
): ExtensionNeed {
  return {
    resource,
    load: () =>
      Promise.resolve()
        .then(() => resources.load(resource))
        .catch((e: unknown) => {
          throw failed(plugin, 'resources', e);
        }),
  };
}

/**
 * The registered extensions, in registration order. One per `mermaid` API object; call
 * {@link HookRunner.start} once per render.
 */
export class HookRunner<El = unknown, R = unknown> {
  private readonly list: ExtensionPlugin<El, R>[] = [];
  private readonly providers = new Map<ExtensionPlugin<El, R>, readonly InlineProvider[]>();
  /** Each extension's `resources`, checked once at registration. */
  private readonly loaders = new Map<ExtensionPlugin<El, R>, ExtensionResources>();

  /** Adds an extension, or replaces the one with the same id in place (keeping its order). */
  register(plugin: ExtensionPlugin<El, R>): void {
    if (typeof plugin.id !== 'string' || plugin.id === '')
      throw new TypeError('An extension plugin needs a non-empty string id');
    const inline: unknown = plugin.inline ?? [];
    if (!Array.isArray(inline))
      throw new TypeError(`Extension "${plugin.id}": inline must be an array of providers`);
    const providers = (inline as readonly InlineProvider[]).map((p) => guarded(plugin, p));
    const resources = checkResources(plugin, plugin.resources);
    const at = this.list.findIndex((p) => p.id === plugin.id);
    if (at >= 0) {
      this.providers.delete(this.list[at]!);
      this.loaders.delete(this.list[at]!);
      this.list[at] = plugin;
    } else this.list.push(plugin);
    this.providers.set(plugin, providers);
    if (resources) this.loaders.set(plugin, resources);
  }

  /**
   * What the registered extensions report missing for `parse` (R-API-2, D178), in registration
   * order, each with its loader. A resource an extension does not provide is an error.
   */
  resources(parse: ParseResult<unknown>, request: ResourceRequest): readonly ExtensionNeed[] {
    const out: ExtensionNeed[] = [];
    for (const p of this.list) {
      const resources = this.loaders.get(p);
      if (!resources) continue;
      let missing: readonly Resource[];
      try {
        missing = resources.missing(parse, request);
        for (const r of missing)
          if (!resources.provides.some((q) => sameResource(q, r)))
            throw new TypeError(
              `missing() reported ${r.kind} "${r.name}", which it does not provide`
            );
      } catch (e) {
        throw failed(p, 'resources', e);
      }
      for (const r of missing) out.push(need(p, resources, r));
    }
    return out;
  }

  /** Every resource of `kind` the registered extensions provide, for `preload`. */
  provided(kind: Resource['kind']): readonly ExtensionNeed[] {
    return this.list.flatMap((p) => {
      const resources = this.loaders.get(p);
      if (!resources) return [];
      return resources.provides.filter((r) => r.kind === kind).map((r) => need(p, resources, r));
    });
  }

  /** Every extension's inline-box providers, in registration order (D177). */
  inline(): readonly InlineProvider[] {
    return this.list.flatMap((p) => this.providers.get(p) ?? []);
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
          if (out.units !== l.units) throw new TypeError('postLayout must not change the units');
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
