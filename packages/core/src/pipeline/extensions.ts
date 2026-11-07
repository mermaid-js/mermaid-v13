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
 *
 * Its `glyphs` (D293) draw icons outside labels: core asks each extension in registration order
 * for a glyph fitted into the square the diagram asks for, as `RenderContext.icon`.
 *
 * An extension's `outline` drawer (D302) draws the shapes a diagram writes with `w.outline`
 * another way (hand-drawn): the first registered drawer is asked once per SVG render whether it
 * is active, and its output goes through a sink that admits `<g>` and `<path>` only.
 */
import type { ConfigFragment } from '../config/fragment.ts';
import type { ResolvedConfig } from '../config/resolve.ts';
import type { LayoutModel } from '../layout/types.ts';
import type { AstNode } from '../parser-kit/ast.ts';
import type { ParseResult } from '../parser-kit/result.ts';
import { isAllowedAttr, isAllowedTag } from '../svg/allowlist.ts';
import type { SvgTree } from '../svg/tree.ts';
import type { Attrs } from '../svg/types.ts';
import type {
  InlineBox,
  OutlineDraw,
  OutlineRole,
  OutlineSink,
  OutlineTag,
  SvgFragment,
} from '../svg/writer.ts';
import type {
  InlinePairProvider,
  InlineProvider,
  InlineRequest,
  InlineSpans,
} from '../text/inline.ts';
import type { IconPacks, IconPackSource } from './icon-packs.ts';
import { MermaidError, type Resource } from './errors.ts';
import type { DiagramIcon, GlyphOptions, IconLookup, RenderContext } from './types.ts';

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
 * (`CALLBACK_IGNORED`), `menus` (element menus, `AstMenu`), `icons` (icon packs, D294:
 * `ICON_PACKS_UNSUPPORTED`).
 */
export type ExtensionClaim = 'callbacks' | 'menus' | 'icons';

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
   * Inline-box providers, each for a delimiter pair (D177) or a pattern (D293): label layout hands
   * each span to its provider and draws the box it returns. The span that starts first wins; on a
   * tie, the first registered provider.
   */
  readonly inline?: readonly InlineProvider[];
  /** Glyphs for icons drawn outside labels (D293), which core exposes as `RenderContext.icon`. */
  readonly glyphs?: GlyphProvider;
  /** What it loads lazily, and when a diagram needs it (R-API-2, D178). */
  readonly resources?: ExtensionResources;
  /**
   * Draws the outlines diagrams write with `w.outline` (D302), when `active` says so. The first
   * registered extension with a drawer wins; text output never asks it.
   */
  readonly outline?: OutlineDrawer;
  /**
   * The extension's config fragment (D153): its own keys, defaults, aliases and theme
   * variables, known to the validator while the extension is registered.
   */
  readonly config?: ConfigFragment;
}

/**
 * An extension's outline drawer (D302). `active` is asked once per SVG render, with the hook
 * context; when it returns true, the writer calls `draw` for every `w.outline(role, tag, attrs)`.
 * `draw` writes its replacement into `sink` and returns true, or returns false and the writer
 * writes the plain `<tag …attrs/>` (after anything `draw` wrote). `attrs` is the diagram's; do
 * not change it. A throw, a tag other than `<g>`/`<path>`, an attribute name off the allow-list,
 * an `open` without its `close` (or the reverse) within one `draw`, or a result that is not a
 * boolean is `MermaidError('INTERNAL')` naming the extension.
 */
export interface OutlineDrawer {
  active(ctx: HookContext): boolean;
  draw(role: OutlineRole, tag: OutlineTag, attrs: Attrs, sink: OutlineSink): boolean;
}

/** The drawer one SVG render uses, and the extension it belongs to. */
export interface ActiveOutline {
  /** The extension's id, for errors. */
  readonly id: string;
  readonly draw: OutlineDraw;
  /** Whether `draw` wrote through its sink in this render: only then is the output checked again. */
  readonly wrote: boolean;
}

/** What an extension's `resources.missing` is asked with, besides the parse. */
export interface ResourceRequest {
  readonly config: ResolvedConfig;
  /** The output being prepared or drawn: text output draws no inline boxes (D179). */
  readonly format: 'svg' | 'ascii';
  /**
   * The API object's icon packs (D294), read-only, with their loader. `iconPack` resources are
   * the API object's: `missing()` reports them without providing them, `mermaid` loads those of
   * a registered pack and ignores the others (an unregistered pack is unresolved, D291).
   */
  readonly iconPacks: IconPackSource;
  /**
   * The parsed diagram's label texts as written (`DiagramPlugin.labels`), when its plugin lists
   * them. Without it, every string in the parse may be a label.
   */
  labels?(): readonly string[];
  /**
   * The icon names the parsed diagram draws outside labels (`DiagramPlugin.icons`, D293), when its
   * plugin lists them.
   */
  icons?(): readonly DiagramIcon[];
}

/**
 * An extension's glyphs (D293). `glyph` runs while a diagram draws, so it is synchronous; a glyph
 * whose data loads later is `undefined` until it has loaded, and its extension asks `prepare()`
 * for that data as a resource.
 */
export interface GlyphProvider {
  /**
   * The glyph `name` (as written, `fa:bell`) names, drawn in the `size` px square at the origin
   * (fitted by the provider, as `xMidYMid meet`); `null` when it does not resolve and the
   * extension warns `ICON_NOT_RENDERED` for it (D291), so the diagram may give its own alias
   * (flowchart's `ICON_UNAVAILABLE`, D299); `'pending'` for a placeholder, a glyph whose data is
   * still loading (D299); `undefined` when it has none to give (a name it leaves to others).
   * A provider that gives `undefined` for a placeholder is read as having none.
   */
  glyph(name: string, request: GlyphRequest): SvgFragment | 'pending' | null | undefined;
}

/** What a glyph provider gets with each name. */
export interface GlyphRequest {
  /** The side, in px, of the square the glyph is drawn in. */
  readonly size: number;
  /** The pack for a name without a prefix ({@link GlyphOptions}). */
  readonly fallbackPrefix?: string;
  /** What the glyph's `currentColor` paints take ({@link GlyphOptions}); the provider applies it. */
  readonly paint?: GlyphOptions['paint'];
  /** The render's warnings, as `InlineRequest.warn`: once per render. */
  readonly warn: (warning: { readonly code: string; readonly message: string }) => void;
  /** The render's icon packs (D294), read-only. */
  readonly iconPacks?: IconPacks;
  /** The render's scratch, as `InlineRequest.scratch`. */
  readonly scratch: Record<string, unknown>;
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

type Hook =
  | 'postParse'
  | 'postLayout'
  | 'postRender'
  | 'afterMount'
  | 'inline'
  | 'glyphs'
  | 'resources'
  | 'outline';

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
  /**
   * The outline drawer for this SVG render (D302): the first registered extension's, when its
   * `active` returns true; `active` runs on the first call only. The draw step calls it.
   */
  outline(): ActiveOutline | undefined;
}

function failed(plugin: { id: string }, hook: Hook, e: unknown): MermaidError {
  if (e instanceof MermaidError) return e;
  const why = e instanceof Error ? e.message : String(e);
  return new MermaidError('INTERNAL', `Extension "${plugin.id}" failed in ${hook}: ${why}`, {
    cause: e,
  });
}

/** An inline box's sizes (finite; none negative but its baseline) and its whole fragment. */
function checkBox(box: InlineBox): InlineBox {
  for (const name of ['width', 'height', 'baseline'] as const) {
    const n = box[name];
    if (typeof n !== 'number' || !Number.isFinite(n) || (name !== 'baseline' && n < 0))
      throw new TypeError(`an inline box needs a finite ${name}, got ${String(n)}`);
  }
  checkFragment(box.node);
  return box;
}

const MAX_DEPTH = 64;

/**
 * The whole fragment: allowed tags and attribute names, children fragments or strings. The
 * error is the extension's (`failed`), which names the hook.
 */
function checkFragment(node: unknown, depth = 0): void {
  if (depth > MAX_DEPTH) throw new TypeError(`a node is nested over ${MAX_DEPTH} deep`);
  const f = node as { tag?: unknown; attrs?: unknown; children?: unknown } | null;
  if (typeof f !== 'object' || f === null || typeof f.tag !== 'string' || !isAllowedTag(f.tag))
    throw new TypeError(`a node holds ${describe(f)}, not an allowed SVG element`);
  if (f.attrs !== undefined) {
    if (typeof f.attrs !== 'object' || f.attrs === null)
      throw new TypeError(`<${f.tag}> has attrs that are not an object`);
    for (const name of Object.keys(f.attrs))
      if (!isAllowedAttr(name))
        throw new TypeError(`${name} on <${f.tag}> is not an allowed attribute`);
  }
  if (f.children === undefined) return;
  if (!Array.isArray(f.children))
    throw new TypeError(`<${f.tag}> has children that are not an array`);
  for (const child of f.children as unknown[])
    if (typeof child !== 'string') checkFragment(child, depth + 1);
}

function describe(f: { tag?: unknown } | null): string {
  if (f === null || typeof f !== 'object') return String(f);
  return typeof f.tag === 'string' ? `<${f.tag}>` : 'an element without a tag';
}

/** `provider` with its boxes checked, and its failures reported as `plugin`'s. */
function guarded(plugin: { id: string }, provider: InlineProvider): InlineProvider {
  const { open, close, pattern, box } = provider as Partial<
    Record<keyof InlinePairProvider, unknown>
  >;
  if (
    typeof box !== 'function' ||
    !(
      pattern instanceof RegExp ||
      (open && close && typeof open === 'string' && typeof close === 'string')
    )
  )
    throw new TypeError(
      `Extension "${plugin.id}": an inline provider needs open and close strings or a pattern, and box()`
    );
  return {
    ...(provider as object),
    box: (source: string, request: InlineRequest) => {
      try {
        const b = provider.box(source, request);
        return b && checkBox(b);
      } catch (e) {
        throw failed(plugin, 'inline', e);
      }
    },
  } as InlineProvider;
}

function checkOutline(plugin: { id: string }, o: unknown): OutlineDrawer | undefined {
  if (o === undefined) return undefined;
  const d = o as Partial<OutlineDrawer> | null;
  if (
    typeof d !== 'object' ||
    d === null ||
    typeof d.active !== 'function' ||
    typeof d.draw !== 'function'
  )
    throw new TypeError(`Extension "${plugin.id}": outline needs active() and draw()`);
  return d as OutlineDrawer;
}

/**
 * `drawer.draw` behind a sink that admits `<g>` and `<path>` (the writer checks attribute names),
 * balanced within each call, and with its failures reported as `plugin`'s; `wrote` once it writes.
 */
function guardedOutline(plugin: { id: string }, drawer: OutlineDrawer): ActiveOutline {
  const active = { id: plugin.id, wrote: false } as {
    -readonly [K in keyof ActiveOutline]: ActiveOutline[K];
  };
  active.draw = (role, tag, attrs, w) => {
    let depth = 0;
    let live = true;
    const alive = (): void => {
      if (!live) throw new TypeError('an outline sink was used after its draw() returned');
      active.wrote = true;
    };
    const sink: OutlineSink = {
      open(t, a) {
        alive();
        // Untyped callers can pass any tag.
        if ((t as string) !== 'g')
          throw new TypeError(`an outline sink opens <g> only, not <${String(t as unknown)}>`);
        // Both backings reject a disallowed attribute name as they write it.
        w.open(t, a);
        depth++;
      },
      leaf(t, a) {
        alive();
        if ((t as string) !== 'path')
          throw new TypeError(
            `an outline sink writes <path> leaves only, not <${String(t as unknown)}>`
          );
        w.leaf(t, a);
      },
      close() {
        alive();
        if (depth === 0) throw new TypeError('an outline sink close() without its open()');
        depth--;
        w.close();
      },
      path: () => w.path(),
    };
    try {
      const drawn: unknown = drawer.draw(role, tag, attrs, sink);
      if (typeof drawn !== 'boolean')
        throw new TypeError(`draw() must return a boolean, got ${typeof drawn}`);
      if (depth !== 0) throw new TypeError(`draw() returned with ${depth} <g> still open`);
      return drawn;
    } catch (e) {
      throw failed(plugin, 'outline', e);
    } finally {
      live = false;
    }
  };
  return active;
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
  /** Each extension's outline drawer, checked once at registration. */
  private readonly drawers = new Map<ExtensionPlugin<El, R>, OutlineDrawer>();

  /** Adds an extension, or replaces the one with the same id in place (keeping its order). */
  register(plugin: ExtensionPlugin<El, R>): void {
    if (typeof plugin.id !== 'string' || plugin.id === '')
      throw new TypeError('An extension plugin needs a non-empty string id');
    const inline: unknown = plugin.inline ?? [];
    if (!Array.isArray(inline))
      throw new TypeError(`Extension "${plugin.id}": inline must be an array of providers`);
    const providers = (inline as readonly InlineProvider[]).map((p) => guarded(plugin, p));
    const resources = checkResources(plugin, plugin.resources);
    if (plugin.glyphs && typeof plugin.glyphs.glyph !== 'function')
      throw new TypeError(`Extension "${plugin.id}": glyphs needs a glyph() function`);
    const drawer = checkOutline(plugin, plugin.outline);
    const at = this.list.findIndex((p) => p.id === plugin.id);
    if (at >= 0) {
      this.providers.delete(this.list[at]!);
      this.loaders.delete(this.list[at]!);
      this.drawers.delete(this.list[at]!);
      this.list[at] = plugin;
    } else this.list.push(plugin);
    this.providers.set(plugin, providers);
    if (resources) this.loaders.set(plugin, resources);
    if (drawer) this.drawers.set(plugin, drawer);
  }

  /**
   * What the registered extensions report missing for `parse` (R-API-2, D178), in registration
   * order, each with its loader. A resource an extension does not provide is an error, except an
   * `iconPack`, which `request.iconPacks` loads (D294): loading an unregistered or `ready` pack
   * does nothing, and a `failed` one runs its loader again.
   */
  resources(parse: ParseResult<unknown>, request: ResourceRequest): readonly ExtensionNeed[] {
    return this.list.flatMap((p) => {
      const resources = this.loaders.get(p);
      if (!resources) return [];
      try {
        return resources.missing(parse, request).map((r) => {
          // The API object's pack registry loads (or ignores) icon packs (D294).
          if (r.kind === 'iconPack')
            return { resource: r, load: () => request.iconPacks.load(r.name) };
          if (!resources.provides.some((q) => sameResource(q, r)))
            throw new TypeError(
              `missing() reported ${r.kind} "${r.name}", which it does not provide`
            );
          return need(p, resources, r);
        });
      } catch (e) {
        throw failed(p, 'resources', e);
      }
    });
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

  /**
   * One render's `RenderContext.icon` (D293), or `undefined` when no extension has `glyphs`. It
   * asks each extension in registration order and returns the first glyph, checked (its size is
   * the provider's to honour); else `null` when one reported the name unresolved; else, for a
   * caller that asks (`pending: true`), `'pending'` when one has it as a placeholder. `spans`
   * gives the render's once-per-render warnings and scratch (`InlineSpans`).
   */
  icon(spans: Pick<InlineSpans, 'warn' | 'scratch'>, iconPacks?: IconPacks): RenderContext['icon'] {
    const list = this.list.filter((p) => p.glyphs);
    if (!list[0]) return undefined;
    const { warn, scratch } = spans;
    const lookup = (name: string, size: number, options?: GlyphOptions & { pending?: true }) => {
      const { pending: asked, ...rest } = options ?? {};
      const request: GlyphRequest = { ...rest, size, warn, iconPacks, scratch };
      let unresolved = false;
      let pending = false;
      for (const p of list) {
        try {
          const glyph = p.glyphs!.glyph(name, request);
          if (glyph === 'pending') pending = true;
          else if (glyph) return (checkFragment(glyph), glyph);
          else if (glyph === null) unresolved = true;
        } catch (e) {
          throw failed(p, 'glyphs', e);
        }
      }
      if (unresolved) return null;
      return asked && pending ? 'pending' : undefined;
    };
    return lookup as IconLookup;
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
    const owner = list.find((p) => this.drawers.has(p));
    let outline: ActiveOutline | undefined | null = owner === undefined ? undefined : null;
    const activeOutline = (): ActiveOutline | undefined => {
      if (outline !== null) return outline;
      const p = owner as ExtensionPlugin<El, R>;
      const drawer = this.drawers.get(p) as OutlineDrawer;
      let on: unknown;
      try {
        on = drawer.active(context(p));
        if (typeof on !== 'boolean')
          throw new TypeError(`active() must return a boolean, got ${typeof on}`);
      } catch (e) {
        throw failed(p, 'outline', e);
      }
      outline = on ? guardedOutline(p, drawer) : undefined;
      return outline;
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
      outline: activeOutline,
    };
  }
}
