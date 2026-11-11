/**
 * Embedded diagrams (ADR-15): the parts of the block pass that need nothing from the API
 * object. A host's parse lists its blocks (`ParseResult.embeds`); `api.ts` detects, parses and
 * draws each one before the host draws, and hands it to the host by id.
 */
import {
  errorFromDiagnostics,
  MermaidError,
  NotLoadedError,
  type EmbeddedDiagram,
  type RenderContext,
  type Warning,
} from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { Diagnostic, EmbeddedBlock, ParseResult } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { embeddedSvg, type SecurityLevel } from '@mermaid-js/core/svg';

/** The blocks a parse lists, none when the type hosts none. */
export function embedsOf(parse: ParseResult<unknown>): readonly EmbeddedBlock[] {
  return parse.embeds ?? [];
}

/** A block's id prefix: the host's, then the block id as an XML name part (ADR-15). */
export function blockPrefix(host: string, id: string): string {
  return `${host}-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/**
 * `e`, thrown for a block whose body starts at `at` in `source` (the whole text): positioned in
 * the whole text, so the line and column are the author's. Errors without a position pass.
 */
export function inOuterText(e: unknown, source: string, at: number): unknown {
  if (!(e instanceof MermaidError) || e instanceof NotLoadedError) return e;
  if (e.diagnostics.length > 0) {
    const shift = (r: { start: number; end: number }) => ({
      start: r.start + at,
      end: r.end + at,
    });
    const moved = e.diagnostics.map(
      (d): Diagnostic => ({
        ...d,
        range: shift(d.range),
        ...(d.related ? { related: d.related.map((r) => ({ ...r, range: shift(r.range) })) } : {}),
      })
    );
    return errorFromDiagnostics(source, moved) ?? e;
  }
  if (e.offset === 0 && e.length === 0) return e;
  return new MermaidError(e.code, e.message, {
    source,
    offset: e.offset + at,
    length: e.length,
    cause: e,
  });
}

/** The error for a block whose body does not start with a diagram type. */
export function noDiagramType(source: string, block: EmbeddedBlock, from: number): MermaidError {
  // The first line that is not blank or a comment, where the type was expected.
  const lines = block.text.slice(from).split('\n');
  let start = from;
  let line = '';
  for (const l of lines) {
    const t = l.trim();
    if (t !== '' && !t.startsWith('%%')) {
      line = l;
      break;
    }
    start += l.length + 1;
  }
  const lead = line.length - line.trimStart().length;
  const at = block.offset + Math.min(start + lead, block.text.length);
  const d: Diagnostic = {
    severity: 'error',
    code: 'EMBED_NO_TYPE',
    message: `The \`mermaid ${block.id}\` block must start with a diagram type, such as \`sequenceDiagram\` or \`classDiagram\`, after any blank lines, comments and front matter.`,
    range: { start: at, end: at + line.trim().length },
  };
  return errorFromDiagnostics(source, [d])!;
}

/** What a block takes from its host's resolved config: the look of the whole picture. */
const INHERITED = ['theme', 'themeVariables', 'fontFamily', 'fontSize', 'darkMode'] as const;

/**
 * A block's config: its own (site, then its front matter and directives), with the host's
 * theme and font, and drawn at its natural size (`useMaxWidth: false` in its sections).
 */
export function blockConfig(
  config: ResolvedConfig,
  host: ResolvedConfig,
  sections: readonly string[]
): ResolvedConfig {
  const out: Record<string, unknown> = { ...config };
  const from = host as Readonly<Record<string, unknown>>;
  for (const key of INHERITED) if (from[key] !== undefined) out[key] = from[key];
  for (const s of sections) {
    const own = (config as Readonly<Record<string, unknown>>)[s];
    out[s] = Object.freeze({ ...(own as object | undefined), useMaxWidth: false });
  }
  return Object.freeze(out) as ResolvedConfig;
}

/** Binds a drawn diagram's interactions (#669), given its own root `<svg>` element. */
export type Bind = (svg: Element) => void;

/** One block drawn for its host: what the host splices in, and how to bind it once mounted. */
export interface DrawnBlock {
  readonly diagram: EmbeddedDiagram;
  readonly bind?: Bind;
}

/** Draws the blocks of one host draw, by block id, with the host's id prefix. */
export type DrawBlocks = (
  prefix: string,
  warn: (w: Warning) => void
) => ReadonlyMap<string, DrawnBlock>;

/** One draw's blocks: the render context's lookup, and the binders of the blocks it drew. */
export interface LazyBlocks {
  readonly embed: RenderContext['embed'];
  /** The binders of the drawn blocks, by block id (none when the draw looked none up). */
  readonly binds: () => ReadonlyMap<string, Bind>;
}

/** The render context's block lookup: the blocks are drawn at the first lookup. */
export function lazyEmbed(
  blocks: DrawBlocks | undefined,
  prefix: () => string,
  warn: (w: Warning) => void
): LazyBlocks {
  let drawn: ReadonlyMap<string, DrawnBlock> | undefined;
  return {
    embed: blocks && ((id) => (drawn ??= blocks(prefix(), warn)).get(id)?.diagram),
    binds() {
      const out = new Map<string, Bind>();
      for (const [id, b] of drawn ?? []) if (b.bind) out.set(id, b.bind);
      return out;
    },
  };
}

const isSvg = (n: Element): boolean => n.tagName.toLowerCase() === 'svg';

/** The nearest `<svg>` above `n`. */
function rootAbove(n: Element): Element | null {
  let p = n.parentElement;
  while (p && !isSvg(p)) p = p.parentElement;
  return p;
}

/** The `<svg>`s one level down in `el`: a root's blocks, or the roots in a mount element. */
function nested(el: Element): Element[] {
  const top = isSvg(el) ? el : rootAbove(el);
  return [...el.querySelectorAll('svg')].filter((s) => rootAbove(s) === top);
}

/**
 * The binder of one drawn diagram (#669): `own` (its interactions run's afterMount) on the
 * element, then each block's binder on that block's root, found by the `data-id` of the node
 * that holds it. A host's binder takes the mount element and its `svgText` (several roots in
 * one element: those with as many `data-id`s as the render); a block's, its own root.
 * Undefined when nothing binds.
 */
function binder(
  own: Bind | undefined,
  blocks: ReadonlyMap<string, Bind>,
  svgText?: string
): Bind | undefined {
  if (!own && blocks.size === 0) return undefined;
  return (el) => {
    own?.(el);
    if (blocks.size === 0) return;
    let roots = svgText === undefined || isSvg(el) ? [el] : nested(el);
    if (roots.length > 1) {
      const n = svgText!.split(' data-id="').length - 1;
      roots = roots.filter((r) => r.querySelectorAll('[data-id]').length === n);
    }
    for (const s of roots.flatMap(nested)) {
      let p = s.parentElement;
      while (p && p.getAttribute('data-id') === null) p = p.parentElement;
      blocks.get(p?.getAttribute('data-id') ?? '')?.(s);
    }
  };
}

/** What binding uses of a draw's interactions run. */
interface Mounting<R> {
  readonly mounts: boolean;
  afterMount(el: Element, result: R): void;
}

/**
 * The binder maker of one draw, from its interactions `run` and its blocks' binders: for a
 * host (`host`), on the mount element; for a block, on its own root.
 */
export function mounter<R extends { readonly svg: string }>(
  run: Mounting<R> | undefined,
  binds: () => ReadonlyMap<string, Bind>
) {
  return (result: R, host?: boolean): Bind | undefined =>
    binder(
      run?.mounts ? (el) => run.afterMount(el, result) : undefined,
      binds(),
      host ? result.svg : undefined
    );
}

/** What the block pass needs from a parsed diagram. */
interface Parsed {
  readonly prepared: { readonly config: ResolvedConfig; readonly parse: ParseResult<unknown> };
}

/** One block draw: the inner diagram's root and what the draw said about it. */
export interface BlockDrawn {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly securityLevel: SecurityLevel;
  readonly linkSchemes?: readonly string[];
  /** The draw's own warnings (not the API object's queued ones). */
  readonly warnings: readonly Warning[];
  /** Binds the block's interactions and its own blocks' in its root (#669). */
  readonly bind?: Bind;
}

/**
 * What the block pass uses of the API object. `A` is a parsed diagram, `F` what detection
 * found, `S` the config snapshot, `P` a plugin, `O` the render options.
 */
export interface BlockDeps<A extends Parsed, F, S, P, O> {
  /** Detects `text`'s type (as `detect`, throwing `UNSUPPORTED_DIAGRAM` when none is found). */
  detect(text: string, s: S): F;
  /** The plugin id `found` names; undefined for a type without a package. */
  idOf(found: F): string | undefined;
  /** Parses `text` with `plugin` (throws when it is undefined), for a host parsed as `host`. */
  analyse(text: string, s: S, found: F, plugin: P | undefined, host: A): A;
  load(id: string): Promise<P | undefined>;
  loaded(id: string): P | undefined;
  /** Loads what `a` draws with (layout, themes, extension resources). */
  resources(a: A): Promise<unknown>;
  /** Draws `a`, its ids prefixed `id`, with `blocks` for its own blocks. */
  draw(
    text: string,
    s: S,
    options: O,
    a: A,
    id: string,
    blocks: DrawBlocks | undefined
  ): BlockDrawn;
}

/** Where a block's body is: the whole text, and the offset of the body in it. */
interface Place {
  readonly root: string;
  readonly at: number;
}

export interface BlockPass<A, S, O> {
  /**
   * Loads and parses `host`'s blocks and theirs, and with `resources` what each one draws
   * with. `base` is where `host`'s text starts in `root`.
   */
  prepare(root: string, base: number, host: A, s: S, resources: boolean): Promise<void>;
  /** `host`'s blocks drawn for its lookup (undefined when it has none). */
  draw(root: string, base: number, host: A, s: S, options: O): DrawBlocks | undefined;
}

/**
 * The block pass of one API object: `prepare` walks the block tree before a draw, loading
 * each block's plugin; `draw` renders a host's blocks, deepest first, for its lookup. Block
 * analyses are kept with their host's, so a cached host keeps its blocks.
 */
export function blockPass<A extends Parsed, F, S, P, O>(
  deps: BlockDeps<A, F, S, P, O>
): BlockPass<A, S, O> {
  const analyses = new WeakMap<A, Map<string, A>>();

  /** Detects block `b`, its body at `at` in `root` (the whole text). */
  function found({ root, at }: Place, b: EmbeddedBlock, s: S): F {
    try {
      return deps.detect(b.text, s);
    } catch (e) {
      if (e instanceof MermaidError && e.code === 'UNSUPPORTED_DIAGRAM')
        throw noDiagramType(root, { ...b, offset: at }, preprocess(b.text).bodyStart);
      throw inOuterText(e, root, at);
    }
  }

  /** Block `b` of `host` (detected as `f`), parsed once, its errors placed in `root`. */
  function blockOf(
    { root, at }: Place,
    host: A,
    b: EmbeddedBlock,
    s: S,
    f: F,
    plugin: P | undefined
  ): A {
    let map = analyses.get(host);
    let a: A;
    try {
      a = deps.analyse(b.text, s, f, plugin, host);
    } catch (e) {
      throw inOuterText(e, root, at);
    }
    if (!map) analyses.set(host, (map = new Map<string, A>()));
    map.set(b.id, a);
    return a;
  }

  /** The analysis of block `b` whose plugin is already loaded (detected again when uncached). */
  async function prepared(place: Place, host: A, b: EmbeddedBlock, s: S): Promise<A> {
    const cached = analyses.get(host)?.get(b.id);
    if (cached) return cached;
    const f = found(place, b, s);
    const id = deps.idOf(f);
    return blockOf(place, host, b, s, f, id === undefined ? undefined : await deps.load(id));
  }

  /**
   * Loads and parses `host`'s blocks and theirs, and with `resources` what each one draws
   * with. `base` is where `host`'s text starts in `root`.
   */
  async function prepare(
    root: string,
    base: number,
    host: A,
    s: S,
    resources: boolean
  ): Promise<void> {
    for (const b of embedsOf(host.prepared.parse)) {
      const at = base + b.offset;
      const inner = await prepared({ root, at }, host, b, s);
      if (resources) await deps.resources(inner);
      await prepare(root, at, inner, s, resources);
    }
  }

  /** The analysis of block `b`, for a draw: its plugin must be loaded. */
  function loaded(place: Place, host: A, b: EmbeddedBlock, s: S): A {
    const cached = analyses.get(host)?.get(b.id);
    if (cached) return cached;
    const f = found(place, b, s);
    const id = deps.idOf(f);
    const plugin = id === undefined ? undefined : deps.loaded(id);
    // renderSync draws only what prepare loaded (R-API-2).
    if (id !== undefined && !plugin) throw new NotLoadedError([{ kind: 'diagram', name: id }]);
    return blockOf(place, host, b, s, f, plugin);
  }

  /** `host`'s blocks drawn for its lookup, each with its own blocks drawn first. */
  function draw(root: string, base: number, host: A, s: S, options: O): DrawBlocks | undefined {
    if (embedsOf(host.prepared.parse).length === 0) return undefined;
    return (prefix, warn) => {
      const out = new Map<string, DrawnBlock>();
      for (const b of embedsOf(host.prepared.parse)) {
        const at = base + b.offset;
        const inner = loaded({ root, at }, host, b, s);
        const drawn = deps.draw(
          b.text,
          s,
          options,
          inner,
          blockPrefix(prefix, b.id),
          draw(root, at, inner, s, options)
        );
        for (const w of drawn.warnings) warn(w);
        const { securityLevel, linkSchemes } = drawn;
        const diagram: EmbeddedDiagram = {
          width: drawn.width,
          height: drawn.height,
          svg: embeddedSvg(drawn.svg, { securityLevel, linkSchemes }),
        };
        out.set(b.id, { diagram, bind: drawn.bind });
      }
      return out;
    };
  }

  return { prepare, draw };
}
