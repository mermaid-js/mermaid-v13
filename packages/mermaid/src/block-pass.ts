/**
 * Embedded diagrams (ADR-15): the block pass, a chunk of its own that `api.ts` loads for the
 * first text with a block (D553). A host's parse lists its blocks (`ParseResult.embeds`);
 * `api.ts` detects, parses and draws each one before the host draws, and hands it to the host
 * by id.
 */
import {
  errorFromDiagnostics,
  MAX_BLOCK_DEPTH,
  MermaidError,
  NotLoadedError,
  openerRange,
  tooDeep,
  type EmbeddedDiagram,
  type EmbeddedText,
  type PluginFormat,
  type Warning,
} from '@mermaid-js/core';
import type { ResolvedConfig, ResolvedSite } from '@mermaid-js/core/config';
import { blockBody, type BlockBody } from '@mermaid-js/core/parser-kit/embed-body';
import type { Diagnostic, EmbeddedBlock, ParseOutput, Range } from '@mermaid-js/core/parser-kit';
import { noDiagramType as noTypeDiagnostic } from '@mermaid-js/core/parser-kit/embed-type';
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { embeddedSvg, type SecurityLevel } from '@mermaid-js/core/svg';
import type { Analysis, Detection } from './analysis-cache.ts';
import type { RenderOptions } from './api-types.ts';
import type { Snapshot } from './config-snapshot.ts';
import { embedsOf, type BlockHost } from './embeds.ts';
import type { AnyPlugin } from './registry.ts';

/** The edges a parse made, for a limit counted across blocks; 0 for a type that does not say. */
function edgesOf(parse: ParseOutput<unknown>): number {
  return parse.edgeCount ?? 0;
}

/**
 * A block's id prefix: the host's, `-`, then the block id as an XML name part (ADR-15). The
 * encoding is one-to-one and never writes `-`, so no two blocks share a prefix: `_` is `__`,
 * and any other character but a letter or digit is `_<hex code>_`.
 */
export function blockPrefix(host: string, id: string): string {
  const part = (c: string) => (c === '_' ? '__' : `_${c.codePointAt(0)!.toString(16)}_`);
  return `${host}-${id.replace(/[^A-Za-z0-9]/gu, part)}`;
}

const bodies = new WeakMap<EmbeddedBlock, BlockBody>();

/** Block `b`'s body as it is detected, parsed and drawn: its common indentation removed (D633). */
function bodyOf(b: EmbeddedBlock): BlockBody {
  let body = bodies.get(b);
  if (!body) bodies.set(b, (body = blockBody(b.text)));
  return body;
}

/** Where offset `o` of a body's parsed text is in the whole text. */
export type Pos = (o: number) => number;

/**
 * `e`, thrown for a block whose parsed body maps to the whole text `source` through `pos`:
 * positioned in the whole text, so the line and column are the author's. Errors without a
 * position pass.
 */
export function inOuterText(e: unknown, source: string, pos: Pos): unknown {
  if (!(e instanceof MermaidError) || e instanceof NotLoadedError) return e;
  if (e.diagnostics.length > 0) {
    const shift = (r: { start: number; end: number }) => ({
      start: pos(r.start),
      end: pos(r.end),
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
  const offset = pos(e.offset);
  return new MermaidError(e.code, e.message, {
    source,
    offset,
    length: pos(e.offset + e.length) - offset,
    cause: e,
  });
}

/**
 * The block's first diagram line (where its type is), after what may come before it, in its
 * parsed body; `pos` places it elsewhere (the whole text).
 */
function typeRange(b: EmbeddedBlock, pos: Pos = (o) => o): Range {
  const { text } = bodyOf(b);
  const from = preprocess(text).bodyStart;
  let start = from;
  for (const l of text.slice(from).split('\n')) {
    const t = l.trim();
    if (t !== '' && !t.startsWith('%%')) {
      start += l.length - l.trimStart().length;
      return { start: pos(start), end: pos(start + t.length) };
    }
    start += l.length + 1;
  }
  return { start: pos(text.length), end: pos(text.length) };
}

/** An error `code` at `range` in the whole text `root`. */
function blockError(root: string, code: string, message: string, range: Range): MermaidError {
  return errorFromDiagnostics(root, [{ severity: 'error', code, message, range }])!;
}

/** The error for a block whose body does not start with a diagram type (placed by `pos`). */
export function noDiagramType(root: string, b: EmbeddedBlock, pos: Pos): MermaidError {
  const range = typeRange(b, pos);
  const line = root.slice(range.start, range.end);
  return errorFromDiagnostics(root, [noTypeDiagnostic(b.id, line, range)])!;
}

/**
 * Whether `key` is a diagram section: one of the block type's own `sections`, or one the schema
 * `tree` gives the keys every diagram has (`useMaxWidth`). A block's front matter and
 * directives may set these only (ADR-15).
 */
function isSection(
  key: string,
  { tree, sections }: Pick<ResolvedSite, 'tree' | 'sections'>
): boolean {
  const keys = tree[key];
  return sections.includes(key) || (typeof keys === 'object' && 'useMaxWidth' in keys);
}

/** `layer`'s diagram sections, each other key added to `dropped`. */
function sectionsOf<T extends object>(
  layer: T,
  site: Pick<ResolvedSite, 'tree' | 'sections'>,
  dropped: Set<string>
): T {
  const kept: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(layer)) {
    if (isSection(k, site)) kept[k] = v;
    else dropped.add(k);
  }
  return kept as T;
}

/**
 * A block's config layers (front matter, directives) with their diagram sections only; one
 * warning names the keys it dropped.
 */
function blockLayers<T extends object>(
  front: T | undefined,
  directives: readonly T[],
  site: Pick<ResolvedSite, 'tree' | 'sections'>,
  warn: (w: Warning) => void
): { front: T | undefined; directives: T[] } {
  const dropped = new Set<string>();
  const out = {
    front: front && sectionsOf(front, site, dropped),
    directives: directives.map((d) => sectionsOf(d, site, dropped)),
  };
  if (dropped.size > 0)
    warn({
      code: 'EMBED_CONFIG_IGNORED',
      message: `An embedded diagram can set only diagram sections (such as \`sequence\`), not ${[...dropped].map((k) => `\`${k}\``).join(', ')}; ignored: the rest, theme and font included, comes from the host.`,
    });
  return out;
}

/**
 * A block's config, resolved over its host's (`config`): the host's theme, and drawn at its
 * natural size (`useMaxWidth: false` in its sections).
 */
function blockConfig(
  config: ResolvedConfig,
  host: ResolvedConfig,
  sections: readonly string[]
): ResolvedConfig {
  const out: Record<string, unknown> = { ...config, theme: host.theme };
  for (const s of sections) {
    const own = (config as Readonly<Record<string, unknown>>)[s];
    out[s] = Object.freeze({ ...(own as object | undefined), useMaxWidth: false });
  }
  return Object.freeze(out) as ResolvedConfig;
}

/** A block's host, as `analyse` takes it: the host's config and the block config rules. */
export function blockHost(host: ResolvedConfig): BlockHost {
  return {
    config: host,
    layers: blockLayers,
    resolve: (config, sections) => blockConfig(config, host, sections),
  };
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

/** What one host draw gives its blocks: its id prefix, and where their warnings go. */
interface Into {
  readonly prefix: string;
  readonly warn: (w: Warning) => void;
}

/** Draws the blocks of one host draw, by block id. */
export type DrawBlocks<E = EmbeddedDiagram> = (into: Into) => ReadonlyMap<string, DrawnBlock<E>>;

/** One draw's blocks: the render context's lookup, and the binders of the blocks it drew. */
export interface LazyBlocks<E = EmbeddedDiagram> {
  readonly embed: ((id: string) => E | undefined) | undefined;
  /** The binder maker of the draw (`mounter`), with the binders of the blocks it drew. */
  readonly mounter: <R extends { readonly svg: string }>(
    run: Mounting<R> | undefined
  ) => (result: R, host?: boolean) => Bind | undefined;
}

/** The render context's block lookup: the blocks are drawn at the first lookup. */
function lazyEmbed<E = EmbeddedDiagram>(
  blocks: DrawBlocks<E> | undefined,
  prefix: () => string,
  warn: (w: Warning) => void
): LazyBlocks<E> {
  let drawn: ReadonlyMap<string, DrawnBlock<E>> | undefined;
  return {
    embed: blocks && ((id) => (drawn ??= blocks({ prefix: prefix(), warn })).get(id)?.diagram),
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

/** The render options a block draw passes on. */
type Options = RenderOptions | undefined;

/** What the block pass uses of the API object. */
export interface BlockDeps {
  /** Detects `text`'s type (as `detect`, throwing `UNSUPPORTED_DIAGRAM` when none is found). */
  detect(text: string, s: Snapshot): Detection;
  /** Parses `text` with `plugin`, as a block of `host`. */
  analyse(
    text: string,
    s: Snapshot,
    found: Detection,
    plugin: AnyPlugin,
    host: BlockHost
  ): Analysis;
  load(id: string): Promise<AnyPlugin | undefined>;
  loaded(id: string): AnyPlugin | undefined;
  /** Loads what `a` draws with in `format` (layout, themes, extension resources, text entry). */
  resources(a: Analysis, format: PluginFormat): Promise<unknown>;
  /** Draws `a`, its ids prefixed `id`, with `blocks` for its own blocks. */
  draw(
    text: string,
    s: Snapshot,
    options: Options,
    a: Analysis,
    id: string,
    blocks: DrawBlocks | undefined
  ): BlockDrawn;
  /**
   * Draws block `b` (parsed as `a`) as text, its ids prefixed `id`, with `blocks` for its own
   * blocks; a type without text output is a stand-in and one warning.
   */
  drawText(
    b: EmbeddedBlock,
    s: Snapshot,
    options: Options,
    a: Analysis,
    id: string,
    blocks: DrawBlocks<EmbeddedText> | undefined
  ): BlockText;
}

/** What a block draw said about it, besides what it drew. */
interface BlockWarnings {
  readonly warnings: readonly Warning[];
}

/**
 * Where a block's body is: the whole text, the offset of the body as written in it, and (for
 * a block, D633) where each offset of its parsed body is; without `pos`, `at` plus the offset.
 */
interface Place {
  readonly root: string;
  readonly at: number;
  readonly pos?: Pos;
}

/** `p`'s offset map into the whole text. */
const posOf = (p: Place): Pos => p.pos ?? ((o) => p.at + o);

/**
 * A host whose blocks a walk reads: where its text starts in the whole text, its analysis and
 * the config snapshot.
 */
export interface HostAt extends Place {
  readonly a: Analysis;
  readonly s: Snapshot;
}

/** Where the body of `h`'s block `b` is. */
function placeOf(h: Place, b: EmbeddedBlock): Place {
  const host = posOf(h);
  const body = bodyOf(b);
  return { root: h.root, at: host(b.offset), pos: (o) => host(b.offset + body.outer(o)) };
}

/**
 * The types of `host`'s folded blocks by id (#670), each detected from its type line alone: the
 * rest of the body is never read. A line no detector knows is shown as its first word.
 */
const folds =
  (deps: Pick<BlockDeps, 'detect'>) =>
  (host: Analysis, s: Snapshot): ((id: string) => string | undefined) | undefined => {
    const folded = embedsOf(host.prepared.parse).filter((b) => b.folded);
    if (folded.length === 0) return undefined;
    const typeOf = (b: EmbeddedBlock): string => {
      const { start, end } = typeRange(b);
      const line = bodyOf(b).text.slice(start, end);
      try {
        const { detected } = deps.detect(line, s);
        return detected.id ?? detected.type;
      } catch {
        return /^[^\s{[(;:]*/.exec(line)![0];
      }
    };
    let types: Map<string, string> | undefined;
    return (id) => (types ??= new Map(folded.map((b) => [b.id, typeOf(b)]))).get(id);
  };

/** The blocks of `host` to parse and draw: a folded one never is (#670). */
const unfolded = (host: Analysis): EmbeddedBlock[] =>
  embedsOf(host.prepared.parse).filter((b) => !b.folded);

/** A block whose type this `mermaid` cannot draw: where its body is (`pos`), its type. */
interface Missing {
  readonly b: EmbeddedBlock;
  readonly pos: Pos;
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
      range: typeRange(m.b, m.pos),
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
  if (depth > MAX_BLOCK_DEPTH) throw errorFromDiagnostics(root, [tooDeep(root, b.id, at)])!;
}

/** Adds parsed block `a`'s edges to the whole text's count. */
function countEdges({ root, at }: Place, b: EmbeddedBlock, a: Analysis, count: Count): void {
  count.used += edgesOf(a.prepared.parse);
  if (count.used <= count.max) return;
  throw blockError(
    root,
    LIMIT_CODES.maxEdges,
    `Edge limit exceeded: with the \`mermaid ${b.id}\` block, the text asks for ${count.used} edges, but the limit is ${count.max}.`,
    openerRange(root, at)
  );
}

/** Detects block `b`, its body placed in `root` (the whole text) by `place`, its errors there. */
function detectBlock(
  deps: Pick<BlockDeps, 'detect'>,
  place: Place,
  b: EmbeddedBlock,
  s: Snapshot
): Detection {
  try {
    return deps.detect(bodyOf(b).text, s);
  } catch (e) {
    if (e instanceof MermaidError && e.code === 'UNSUPPORTED_DIAGRAM')
      throw noDiagramType(place.root, b, posOf(place));
    throw inOuterText(e, place.root, posOf(place));
  }
}

/** The count for a walk from the top-level host `h`, against the integrator's `maxEdges`. */
const countFrom = ({ a, s }: HostAt): Count => ({
  used: edgesOf(a.prepared.parse),
  max: s.limits.maxEdges,
});

export interface BlockPass {
  /**
   * Loads and parses `h`'s blocks and theirs, and with `resources` what each one draws with in
   * that format.
   */
  prepare(h: HostAt, resources: PluginFormat | undefined): Promise<void>;
  /** `h`'s blocks drawn for its lookup (undefined when it has none). */
  draw(h: HostAt, options: Options): DrawBlocks | undefined;
  /** The types of `host`'s folded blocks by id (undefined when it has none), #670. */
  foldedType(host: Analysis, s: Snapshot): ((id: string) => string | undefined) | undefined;
  /** `h`'s blocks drawn as text for its lookup (undefined when it has none). */
  drawText(h: HostAt, options: Options): DrawBlocks<EmbeddedText> | undefined;
  /** The render context's block lookup and binder maker of one draw ({@link lazyEmbed}). */
  readonly lazy: typeof lazyEmbed;
}

/**
 * The block pass of one API object: `prepare` walks the block tree before a draw, loading
 * each block's plugin; `draw` renders a host's blocks, deepest first, for its lookup. Block
 * analyses are kept with their host's, so a cached host keeps its blocks. Both walks check
 * the nesting depth and count the edges of the whole text against `maxEdges`. A folded
 * block is never walked: `foldedType` detects its type alone (#670).
 */
export function blockPass(deps: BlockDeps): BlockPass {
  return { ...walks(deps), foldedType: folds(deps), lazy: lazyEmbed };
}

/**
 * The block analyses of {@link blockPass}, kept with their host's, so a cached host keeps its
 * blocks: `prepared` loads a block's plugin, `loaded` takes it as loaded. Each gives undefined,
 * and adds the block to `missing`, when its type cannot be drawn.
 */
function analysesOf(deps: BlockDeps) {
  const analyses = new WeakMap<Analysis, Map<string, Analysis>>();

  /** Block `b` of `h` (detected as `f`), parsed once, its errors placed in the whole text. */
  function blockOf(h: HostAt, b: EmbeddedBlock, f: Detection, plugin: AnyPlugin): Analysis {
    let a: Analysis;
    try {
      a = deps.analyse(bodyOf(b).text, h.s, f, plugin, blockHost(h.a.prepared.config));
    } catch (e) {
      const place = placeOf(h, b);
      throw inOuterText(e, place.root, posOf(place));
    }
    let map = analyses.get(h.a);
    if (!map) analyses.set(h.a, (map = new Map<string, Analysis>()));
    map.set(b.id, a);
    return a;
  }

  /** Block `b` of `h`, cached or detected: the analysis, or what detection found. */
  function lookup(h: HostAt, b: EmbeddedBlock): Analysis | Detection {
    return analyses.get(h.a)?.get(b.id) ?? detectBlock(deps, placeOf(h, b), b, h.s);
  }

  const miss = (h: HostAt, b: EmbeddedBlock, f: Detection, missing: Missing[]): undefined =>
    void missing.push({ b, pos: posOf(placeOf(h, b)), type: f.detected.type });

  async function prepared(
    h: HostAt,
    b: EmbeddedBlock,
    missing: Missing[]
  ): Promise<Analysis | undefined> {
    const f = lookup(h, b);
    if ('prepared' in f) return f;
    const { id } = f.detected;
    const plugin = id === undefined ? undefined : await deps.load(id);
    return plugin ? blockOf(h, b, f, plugin) : miss(h, b, f, missing);
  }

  function loaded(h: HostAt, b: EmbeddedBlock, missing: Missing[] = []): Analysis | undefined {
    const f = lookup(h, b);
    if ('prepared' in f) return f;
    const { id } = f.detected;
    if (id === undefined) return miss(h, b, f, missing);
    const plugin = deps.loaded(id);
    // renderSync draws only what prepare loaded (R-API-2).
    if (!plugin) throw new NotLoadedError([{ kind: 'diagram', name: id }]);
    return blockOf(h, b, f, plugin);
  }

  return { prepared, loaded };
}

/** One walk over the block tree: the whole text's edge count and the blocks it cannot draw. */
interface Walk {
  readonly count: Count;
  readonly missing: Missing[];
}

/** A walk from the top-level host `h`. */
const walkFrom = (h: HostAt): Walk => ({ count: countFrom(h), missing: [] });

/** The walks of {@link blockPass}: prepare, draw and drawText. */
function walks(deps: BlockDeps): Omit<BlockPass, 'foldedType' | 'lazy'> {
  const { prepared, loaded } = analysesOf(deps);

  /**
   * Block `b` of `h` as a host, its edges counted, given its analysis; undefined for a block
   * whose type cannot be drawn.
   */
  function counted(
    h: HostAt,
    b: EmbeddedBlock,
    walk: Walk,
    inner: Analysis | undefined
  ): HostAt | undefined {
    if (!inner) return undefined;
    const place = placeOf(h, b);
    countEdges(place, b, inner, walk.count);
    return { ...place, a: inner, s: h.s };
  }

  /** Prepares `h`'s blocks and theirs, nested `depth` levels down. */
  async function prepareLevel(
    h: HostAt,
    walk: Walk & { readonly resources: PluginFormat | undefined },
    depth: number
  ): Promise<void> {
    for (const b of unfolded(h.a)) {
      checkDepth(placeOf(h, b), b, depth);
      const inner = counted(h, b, walk, await prepared(h, b, walk.missing));
      if (!inner) continue;
      if (walk.resources) await deps.resources(inner.a, walk.resources);
      await prepareLevel(inner, walk, depth + 1);
    }
  }

  async function prepare(h: HostAt, resources: PluginFormat | undefined): Promise<void> {
    const walk = { ...walkFrom(h), resources };
    await prepareLevel(h, walk, 1);
    checkMissing(h.root, walk.missing);
  }

  /** Parses `h`'s blocks and theirs for a draw, checking depth and edges. */
  function check(h: HostAt, walk: Walk, depth: number): void {
    for (const b of unfolded(h.a)) {
      checkDepth(placeOf(h, b), b, depth);
      const inner = counted(h, b, walk, loaded(h, b, walk.missing));
      if (inner) check(inner, walk, depth + 1);
    }
  }

  /**
   * `h`'s blocks drawn by `one` for its lookup, each with its own blocks drawn first (`one`
   * gets the block as a host and its id prefix). SVG and text share it.
   */
  function drawAll<E>(
    h: HostAt,
    one: (b: EmbeddedBlock, inner: HostAt, prefix: string) => DrawnBlock<E> & BlockWarnings
  ): DrawBlocks<E> | undefined {
    if (embedsOf(h.a.prepared.parse).length === 0) return undefined;
    return ({ prefix, warn }) => {
      const out = new Map<string, DrawnBlock<E>>();
      for (const b of unfolded(h.a)) {
        // Checked before the draw: every block is loaded.
        const inner = { ...placeOf(h, b), a: loaded(h, b)!, s: h.s };
        const { warnings, ...drawn } = one(b, inner, blockPrefix(prefix, b.id));
        for (const w of warnings) warn(w);
        out.set(b.id, drawn);
      }
      return out;
    };
  }

  /** `h`'s blocks drawn as SVG for its lookup, each with its own blocks drawn first. */
  function drawLevel(h: HostAt, options: Options): DrawBlocks | undefined {
    return drawAll<EmbeddedDiagram>(h, (b, inner, id) => {
      const deeper = drawLevel(inner, options);
      const drawn = deps.draw(bodyOf(b).text, h.s, options, inner.a, id, deeper);
      const { securityLevel, linkSchemes } = drawn;
      const diagram: EmbeddedDiagram = {
        width: drawn.width,
        height: drawn.height,
        svg: embeddedSvg(drawn.svg, { securityLevel, linkSchemes }),
      };
      return { diagram, bind: drawn.bind, warnings: drawn.warnings };
    });
  }

  /** `h`'s blocks drawn as text for its lookup, each with its own blocks drawn first. */
  function textLevel(h: HostAt, options: Options): DrawBlocks<EmbeddedText> | undefined {
    return drawAll<EmbeddedText>(h, (b, inner, id) => {
      const deeper = textLevel(inner, options);
      const body = { ...b, text: bodyOf(b).text };
      const { warnings, ...diagram } = deps.drawText(body, h.s, options, inner.a, id, deeper);
      return { diagram, warnings };
    });
  }

  /** A top-level draw (SVG or text): the whole block tree checked first, then `level`. */
  function checked<E>(level: (h: HostAt, options: Options) => DrawBlocks<E> | undefined) {
    return (h: HostAt, options: Options): DrawBlocks<E> | undefined => {
      if (embedsOf(h.a.prepared.parse).length === 0) return undefined;
      const walk = walkFrom(h);
      check(h, walk, 1);
      checkMissing(h.root, walk.missing);
      return level(h, options);
    };
  }

  return { prepare, draw: checked(drawLevel), drawText: checked(textLevel) };
}
