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
  type EmbeddedText,
  type Warning,
} from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { Diagnostic, EmbeddedBlock, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import { preprocess, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { embeddedSvg, type SecurityLevel } from '@mermaid-js/core/svg';

/** The blocks a parse lists, none when the type hosts none. */
export function embedsOf(parse: ParseResult<unknown>): readonly EmbeddedBlock[] {
  return parse.embeds ?? [];
}

/** The edges a parse made, for a limit counted across blocks; 0 for a type that does not say. */
function edgesOf(parse: ParseResult<unknown>): number {
  return parse.edgeCount ?? 0;
}

/**
 * A block's id prefix: the host's, `-`, then the block id as an XML name part (ADR-15). The
 * encoding is one-to-one and never writes `-`, so no two blocks share a prefix: `_` is `__`,
 * and any other character but a letter or digit is `_<hex code>_`.
 */
export function blockPrefix(host: string, id: string): string {
  return `${host}-${id.replace(/[^A-Za-z0-9]/gu, (c) => (c === '_' ? '__' : `_${c.codePointAt(0)!.toString(16)}_`))}`;
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

/** The block's first diagram line (where its type is), after what may come before it. */
function typeRange(b: EmbeddedBlock, at: number): Range {
  const from = preprocess(b.text).bodyStart;
  let start = from;
  for (const l of b.text.slice(from).split('\n')) {
    const t = l.trim();
    if (t !== '' && !t.startsWith('%%')) {
      start += at + l.length - l.trimStart().length;
      return { start, end: start + t.length };
    }
    start += l.length + 1;
  }
  return { start: at + b.text.length, end: at + b.text.length };
}

/** An error `code` at `range` in the whole text `root`. */
function blockError(root: string, code: string, message: string, range: Range): MermaidError {
  return errorFromDiagnostics(root, [{ severity: 'error', code, message, range }])!;
}

/** The error for a block whose body does not start with a diagram type. */
export function noDiagramType(root: string, b: EmbeddedBlock): MermaidError {
  const range = typeRange(b, b.offset);
  const word = /^[^\s{[(;:]*/.exec(root.slice(range.start, range.end))![0];
  return blockError(
    root,
    'EMBED_NO_TYPE',
    `The \`mermaid ${b.id}\` block must start with a diagram type, such as \`sequenceDiagram\` or \`classDiagram\`, after any blank lines, comments and front matter${word ? `; \`${word}\` is not a diagram type` : ''}.`,
    range
  );
}

/**
 * `pre` without the directives (and their diagnostics) inside the bodies of `parse`'s blocks:
 * a `%%{init}%%` in a block configures the block, not its host. `pre` itself when none is.
 */
export function outsideBlocks(
  pre: PreprocessResult,
  parse: ParseResult<unknown>
): PreprocessResult {
  const bodies = embedsOf(parse);
  if (bodies.length === 0) return pre;
  const inside = ({ range }: { range: { start: number } }) =>
    bodies.some((b) => range.start >= b.offset && range.start < b.offset + b.text.length);
  if (!pre.directives.some(inside)) return pre;
  return {
    ...pre,
    directives: pre.directives.filter((d) => !inside(d)),
    diagnostics: pre.diagnostics.filter((d) => !inside(d)),
  };
}

/** Config keys a block cannot set: the look of the whole picture comes from the host. */
const HOST_KEYS: ReadonlySet<string> = new Set([
  'theme',
  'themeVariables',
  'themeCSS',
  'look',
  'darkMode',
  'fontFamily',
  'fontSize',
  'handDrawnSeed',
]);

/** `layer` without the keys a block cannot set, each one dropped added to `dropped`. */
function withoutHostKeys<T extends object>(
  layer: T,
  secure: ReadonlySet<string>,
  dropped: Set<string>
): T {
  const kept: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(layer)) {
    if (HOST_KEYS.has(k) || secure.has(k)) dropped.add(k);
    else kept[k] = v;
  }
  return kept as T;
}

/**
 * A block's config layers (front matter, directives) without the keys only the host or the
 * integrator sets (`secure`); one warning names those it dropped.
 */
export function blockLayers<T extends object>(
  front: T | undefined,
  directives: readonly T[],
  secure: ReadonlySet<string>,
  warn: (w: Warning) => void
): { front: T | undefined; directives: T[] } {
  const dropped = new Set<string>();
  const out = {
    front: front && withoutHostKeys(front, secure, dropped),
    directives: directives.map((d) => withoutHostKeys(d, secure, dropped)),
  };
  if (dropped.size > 0)
    warn({
      code: 'EMBED_CONFIG_IGNORED',
      message: `An embedded diagram cannot set ${[...dropped].map((k) => `\`${k}\``).join(', ')}; ignored: theme, look and font come from the host.`,
    });
  return out;
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

/**
 * One block drawn for its host: what the host splices in (an SVG root, or `EmbeddedText` for
 * text output), and how to bind it once mounted (SVG only).
 */
export interface DrawnBlock<E = EmbeddedDiagram> {
  readonly diagram: E;
  readonly bind?: Bind;
}

/** Draws the blocks of one host draw, by block id, with the host's id prefix. */
export type DrawBlocks<E = EmbeddedDiagram> = (
  prefix: string,
  warn: (w: Warning) => void
) => ReadonlyMap<string, DrawnBlock<E>>;

/** One draw's blocks: the render context's lookup, and the binders of the blocks it drew. */
export interface LazyBlocks<E = EmbeddedDiagram> {
  readonly embed: ((id: string) => E | undefined) | undefined;
  /** The binder maker of the draw (`mounter`), with the binders of the blocks it drew. */
  readonly mounter: <R extends { readonly svg: string }>(
    run: Mounting<R> | undefined
  ) => (result: R, host?: boolean) => Bind | undefined;
}

/** The render context's block lookup: the blocks are drawn at the first lookup. */
export function lazyEmbed<E = EmbeddedDiagram>(
  blocks: DrawBlocks<E> | undefined,
  prefix: () => string,
  warn: (w: Warning) => void
): LazyBlocks<E> {
  let drawn: ReadonlyMap<string, DrawnBlock<E>> | undefined;
  return {
    embed: blocks && ((id) => (drawn ??= blocks(prefix(), warn)).get(id)?.diagram),
    mounter: (run) =>
      mounter(run, () => {
        const out = new Map<string, Bind>();
        for (const [id, b] of drawn ?? []) if (b.bind) out.set(id, b.bind);
        return out;
      }),
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
function mounter<R extends { readonly svg: string }>(
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

/** One block drawn as text (ADR-14): the drawing, or a stand-in, and what the draw said. */
export interface BlockText extends EmbeddedText {
  /** The draw's own warnings (not the API object's queued ones). */
  readonly warnings: readonly Warning[];
}

/** What a block pass loads resources for: an SVG draw or text output. */
export type BlockFormat = 'svg' | 'ascii';

/**
 * What the block pass uses of the API object. `A` is a parsed diagram, `F` what detection
 * found, `S` the config snapshot, `P` a plugin, `O` the render options.
 */
export interface BlockDeps<A extends Parsed, F, S, P, O> {
  /** Detects `text`'s type (as `detect`, throwing `UNSUPPORTED_DIAGRAM` when none is found). */
  detect(text: string, s: S): F;
  /** The plugin id `found` names; undefined for a type without a package. */
  idOf(found: F): string | undefined;
  /** The diagram type `found` names, for errors. */
  typeOf(found: F): string;
  /** The integrator's edge limit for the whole text. */
  maxEdges(s: S): number;
  /** Parses `text` with `plugin`, for a host parsed as `host`. */
  analyse(text: string, s: S, found: F, plugin: P, host: A): A;
  load(id: string): Promise<P | undefined>;
  loaded(id: string): P | undefined;
  /** Loads what `a` draws with in `format` (layout, themes, extension resources, text entry). */
  resources(a: A, format: BlockFormat): Promise<unknown>;
  /** Draws `a`, its ids prefixed `id`, with `blocks` for its own blocks. */
  draw(
    text: string,
    s: S,
    options: O,
    a: A,
    id: string,
    blocks: DrawBlocks | undefined
  ): BlockDrawn;
  /**
   * Draws block `b` (parsed as `a`) as text, its ids prefixed `id`, with `blocks` for its own
   * blocks; a type without text output is a stand-in and one warning.
   */
  drawText(
    b: EmbeddedBlock,
    s: S,
    options: O,
    a: A,
    id: string,
    blocks: DrawBlocks<EmbeddedText> | undefined
  ): BlockText;
}

/** What a block draw said about it, besides what it drew. */
interface BlockWarnings {
  readonly warnings: readonly Warning[];
}

/** Where a block's body is: the whole text, and the offset of the body in it. */
interface Place {
  readonly root: string;
  readonly at: number;
}

/**
 * The types of `host`'s folded blocks by id (#670), each detected from its type line alone: the
 * rest of the body is never read. A line no detector knows is shown as its first word.
 */
const folds =
  <F, S>(deps: Pick<BlockDeps<Parsed, F, S, unknown, unknown>, 'detect' | 'idOf' | 'typeOf'>) =>
  (host: Parsed, s: S): ((id: string) => string | undefined) | undefined => {
    const folded = embedsOf(host.prepared.parse).filter((b) => b.folded);
    if (folded.length === 0) return undefined;
    const typeOf = (b: EmbeddedBlock): string => {
      const { start, end } = typeRange(b, 0);
      const line = b.text.slice(start, end);
      try {
        const f = deps.detect(line, s);
        return deps.idOf(f) ?? deps.typeOf(f);
      } catch {
        return /^[^\s{[(;:]*/.exec(line)![0];
      }
    };
    let types: Map<string, string> | undefined;
    return (id) => (types ??= new Map(folded.map((b) => [b.id, typeOf(b)]))).get(id);
  };

/** The blocks of `host` to parse and draw: a folded one never is (#670). */
const unfolded = (host: Parsed): EmbeddedBlock[] =>
  embedsOf(host.prepared.parse).filter((b) => !b.folded);

/** How deep blocks may nest: a block in the host is level 1 (ADR-15). */
export const MAX_BLOCK_DEPTH = 4;

/** The `mermaid <id>["Title"] {` line of the block whose body starts at `at` in `root`. */
function openerRange(root: string, at: number): Range {
  const brace = root.lastIndexOf('{', at - 1);
  let start = root.lastIndexOf('\n', brace) + 1;
  while (root[start] === ' ' || root[start] === '\t') start++;
  return { start, end: brace + 1 };
}

/** A block whose type this `mermaid` cannot draw: its body at `at`, its type. */
interface Missing {
  readonly b: EmbeddedBlock;
  readonly at: number;
  readonly type: string;
}

const WHY =
  'not in this build or not registered (`mermaid/slim` draws only the diagrams given to `createMermaid`)';

/**
 * The error for the blocks whose types this `mermaid` cannot draw (unported or unregistered),
 * at the first: its message names each block and type, with one diagnostic per block.
 */
function unavailable(root: string, missing: readonly Missing[]): MermaidError {
  const one = ({ b, type }: Missing) => `\`mermaid ${b.id}\` block is a "${type}" diagram`;
  const diagnostics = missing.map(
    (m): Diagnostic => ({
      severity: 'error',
      code: 'EMBED_UNAVAILABLE',
      message: `The ${one(m)}, which this mermaid cannot draw: it is ${WHY}.`,
      range: typeRange(m.b, m.at),
    })
  );
  if (missing.length > 1)
    diagnostics[0] = {
      ...diagnostics[0]!,
      message: `The ${missing.map(one).join(', the ')}; this mermaid cannot draw them: each is ${WHY}.`,
    };
  const { message, offset, length } = errorFromDiagnostics(root, diagnostics)!;
  return new MermaidError('UNSUPPORTED_DIAGRAM', message, {
    source: root,
    offset,
    length,
    diagnostics,
  });
}

/** Throws the error for the `missing` blocks of a walk, if there are any. */
function checkMissing(root: string, missing: readonly Missing[]): void {
  if (missing.length > 0) throw unavailable(root, missing);
}

/** Edges counted so far in the whole text, against the integrator's `maxEdges`. */
interface Count {
  used: number;
  readonly max: number;
}

/** Checks block `b` (body at `at`) at nesting level `depth`, before it is parsed. */
function checkDepth({ root, at }: Place, b: EmbeddedBlock, depth: number): void {
  if (depth <= MAX_BLOCK_DEPTH) return;
  throw blockError(
    root,
    'EMBED_DEPTH',
    `The \`mermaid ${b.id}\` block is nested more than ${MAX_BLOCK_DEPTH} deep.`,
    openerRange(root, at)
  );
}

/** Adds parsed block `a`'s edges to the whole text's count. */
function countEdges({ root, at }: Place, b: EmbeddedBlock, a: Parsed, count: Count): void {
  count.used += edgesOf(a.prepared.parse);
  if (count.used <= count.max) return;
  throw blockError(
    root,
    LIMIT_CODES.maxEdges,
    `Edge limit exceeded: with the \`mermaid ${b.id}\` block, the text asks for ${count.used} edges, but the limit is ${count.max}.`,
    openerRange(root, at)
  );
}

/** Detects block `b`, its body at `at` in `root` (the whole text), its errors placed there. */
function detectBlock<F, S>(
  deps: { detect(text: string, s: S): F },
  { root, at }: Place,
  b: EmbeddedBlock,
  s: S
): F {
  try {
    return deps.detect(b.text, s);
  } catch (e) {
    if (e instanceof MermaidError && e.code === 'UNSUPPORTED_DIAGRAM')
      throw noDiagramType(root, { ...b, offset: at });
    throw inOuterText(e, root, at);
  }
}

/** The count for a walk from the top-level `host`, against `max`. */
const countFrom = (host: Parsed, max: number): Count => ({
  used: edgesOf(host.prepared.parse),
  max,
});

export interface BlockPass<A, S, O> {
  /**
   * Loads and parses `host`'s blocks and theirs, and with `resources` what each one draws
   * with in that format. `base` is where `host`'s text starts in `root`.
   */
  prepare(
    root: string,
    base: number,
    host: A,
    s: S,
    resources: BlockFormat | undefined
  ): Promise<void>;
  /** `host`'s blocks drawn for its lookup (undefined when it has none). */
  draw(root: string, base: number, host: A, s: S, options: O): DrawBlocks | undefined;
  /** The types of `host`'s folded blocks by id (undefined when it has none), #670. */
  foldedType(host: A, s: S): ((id: string) => string | undefined) | undefined;
  /** `host`'s blocks drawn as text for its lookup (undefined when it has none). */
  drawText(
    root: string,
    base: number,
    host: A,
    s: S,
    options: O
  ): DrawBlocks<EmbeddedText> | undefined;
}

/**
 * The block pass of one API object: `prepare` walks the block tree before a draw, loading
 * each block's plugin; `draw` renders a host's blocks, deepest first, for its lookup. Block
 * analyses are kept with their host's, so a cached host keeps its blocks. Both walks check
 * the nesting depth and count the edges of the whole text against `maxEdges`. A folded
 * block is never walked: `foldedType` detects its type alone (#670).
 */
export function blockPass<A extends Parsed, F, S, P, O>(
  deps: BlockDeps<A, F, S, P, O>
): BlockPass<A, S, O> {
  return { ...walks(deps), foldedType: folds(deps) };
}

/**
 * The block analyses of {@link blockPass}, kept with their host's, so a cached host keeps its
 * blocks: `prepared` loads a block's plugin, `loaded` takes it as loaded.
 */
function analysesOf<A extends Parsed, F, S, P, O>(deps: BlockDeps<A, F, S, P, O>) {
  const analyses = new WeakMap<A, Map<string, A>>();

  const found = (place: Place, b: EmbeddedBlock, s: S): F => detectBlock(deps, place, b, s);

  /** Block `b` of `host` (detected as `f`), parsed once, its errors placed in `root`. */
  function blockOf({ root, at }: Place, host: A, b: EmbeddedBlock, s: S, f: F, plugin: P): A {
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

  /**
   * The analysis of block `b`, its plugin loaded first; undefined, and the block added to
   * `missing`, when its type cannot be drawn.
   */
  async function prepared(
    place: Place,
    host: A,
    b: EmbeddedBlock,
    s: S,
    missing: Missing[]
  ): Promise<A | undefined> {
    const cached = analyses.get(host)?.get(b.id);
    if (cached) return cached;
    const f = found(place, b, s);
    const id = deps.idOf(f);
    const plugin = id === undefined ? undefined : await deps.load(id);
    if (plugin) return blockOf(place, host, b, s, f, plugin);
    missing.push({ b, at: place.at, type: deps.typeOf(f) });
  }

  /**
   * The analysis of block `b`, for a draw: its plugin must be loaded. Undefined, and the block
   * added to `missing`, when its type has no package.
   */
  function loaded(
    place: Place,
    host: A,
    b: EmbeddedBlock,
    s: S,
    missing: Missing[] = []
  ): A | undefined {
    const cached = analyses.get(host)?.get(b.id);
    if (cached) return cached;
    const f = found(place, b, s);
    const id = deps.idOf(f);
    if (id === undefined) return void missing.push({ b, at: place.at, type: deps.typeOf(f) });
    const plugin = deps.loaded(id);
    // renderSync draws only what prepare loaded (R-API-2).
    if (!plugin) throw new NotLoadedError([{ kind: 'diagram', name: id }]);
    return blockOf(place, host, b, s, f, plugin);
  }

  return { prepared, loaded };
}

/** The walks of {@link blockPass}: prepare, draw and drawText. */
function walks<A extends Parsed, F, S, P, O>(
  deps: BlockDeps<A, F, S, P, O>
): Omit<BlockPass<A, S, O>, 'foldedType'> {
  const { prepared, loaded } = analysesOf(deps);

  /** Prepares `host`'s blocks (its text at `base` in `root`), nested `depth` levels down. */
  async function prepareLevel(
    { root, at: base }: Place,
    host: A,
    s: S,
    walk: {
      readonly resources: BlockFormat | undefined;
      readonly count: Count;
      readonly missing: Missing[];
    },
    depth: number
  ): Promise<void> {
    for (const b of unfolded(host)) {
      const place = { root, at: base + b.offset };
      checkDepth(place, b, depth);
      const inner = await prepared(place, host, b, s, walk.missing);
      if (!inner) continue;
      countEdges(place, b, inner, walk.count);
      if (walk.resources) await deps.resources(inner, walk.resources);
      await prepareLevel(place, inner, s, walk, depth + 1);
    }
  }

  async function prepare(
    root: string,
    base: number,
    host: A,
    s: S,
    resources: BlockFormat | undefined
  ): Promise<void> {
    const walk = { resources, count: countFrom(host, deps.maxEdges(s)), missing: [] };
    await prepareLevel({ root, at: base }, host, s, walk, 1);
    checkMissing(root, walk.missing);
  }

  /** Parses `host`'s blocks and theirs for a draw, checking depth and edges. */
  function check(
    root: string,
    base: number,
    host: A,
    s: S,
    walk: { readonly count: Count; readonly missing: Missing[] },
    depth: number
  ): void {
    for (const b of unfolded(host)) {
      const place = { root, at: base + b.offset };
      checkDepth(place, b, depth);
      const inner = loaded(place, host, b, s, walk.missing);
      if (!inner) continue;
      countEdges(place, b, inner, walk.count);
      check(root, place.at, inner, s, walk, depth + 1);
    }
  }

  /**
   * `host`'s blocks drawn by `one` for its lookup, each with its own blocks drawn first (`one`
   * gets the block's analysis and where its body starts in `root`). SVG and text share it.
   */
  function drawAll<E>(
    root: string,
    base: number,
    host: A,
    s: S,
    one: (b: EmbeddedBlock, inner: A, at: number, prefix: string) => DrawnBlock<E> & BlockWarnings
  ): DrawBlocks<E> | undefined {
    if (embedsOf(host.prepared.parse).length === 0) return undefined;
    return (prefix, warn) => {
      const out = new Map<string, DrawnBlock<E>>();
      for (const b of unfolded(host)) {
        const at = base + b.offset;
        const { warnings, ...drawn } = one(
          b,
          // Checked before the draw: every block is loaded.
          loaded({ root, at }, host, b, s)!,
          at,
          blockPrefix(prefix, b.id)
        );
        for (const w of warnings) warn(w);
        out.set(b.id, drawn);
      }
      return out;
    };
  }

  /** `host`'s blocks drawn as SVG for its lookup, each with its own blocks drawn first. */
  function drawLevel(
    root: string,
    base: number,
    host: A,
    s: S,
    options: O
  ): DrawBlocks | undefined {
    return drawAll<EmbeddedDiagram>(root, base, host, s, (b, inner, at, id) => {
      const drawn = deps.draw(
        b.text,
        s,
        options,
        inner,
        id,
        drawLevel(root, at, inner, s, options)
      );
      const { securityLevel, linkSchemes } = drawn;
      const diagram: EmbeddedDiagram = {
        width: drawn.width,
        height: drawn.height,
        svg: embeddedSvg(drawn.svg, { securityLevel, linkSchemes }),
      };
      return { diagram, bind: drawn.bind, warnings: drawn.warnings };
    });
  }

  /** `host`'s blocks drawn as text for its lookup, each with its own blocks drawn first. */
  function textLevel(
    root: string,
    base: number,
    host: A,
    s: S,
    options: O
  ): DrawBlocks<EmbeddedText> | undefined {
    return drawAll<EmbeddedText>(root, base, host, s, (b, inner, at, id) => {
      const deeper = textLevel(root, at, inner, s, options);
      const { warnings, ...diagram } = deps.drawText(b, s, options, inner, id, deeper);
      return { diagram, warnings };
    });
  }

  /** A top-level draw (SVG or text): the whole block tree checked first, then `level`. */
  function checked<E>(
    level: (root: string, base: number, host: A, s: S, options: O) => DrawBlocks<E> | undefined
  ) {
    return (root: string, base: number, host: A, s: S, options: O): DrawBlocks<E> | undefined => {
      if (embedsOf(host.prepared.parse).length === 0) return undefined;
      const walk = { count: countFrom(host, deps.maxEdges(s)), missing: [] };
      check(root, base, host, s, walk, 1);
      checkMissing(root, walk.missing);
      return level(root, base, host, s, options);
    };
  }

  return { prepare, draw: checked(drawLevel), drawText: checked(textLevel) };
}
