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

/** Draws the blocks of one host draw, by block id, with the host's id prefix. */
export type DrawBlocks = (
  prefix: string,
  warn: (w: Warning) => void
) => ReadonlyMap<string, EmbeddedDiagram>;

/** The render context's block lookup: the blocks are drawn at the first lookup. */
export function lazyEmbed(
  blocks: DrawBlocks | undefined,
  prefix: () => string,
  warn: (w: Warning) => void
): RenderContext['embed'] {
  if (!blocks) return undefined;
  let drawn: ReadonlyMap<string, EmbeddedDiagram> | undefined;
  return (id) => (drawn ??= blocks(prefix(), warn)).get(id);
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
      const out = new Map<string, EmbeddedDiagram>();
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
        out.set(b.id, {
          width: drawn.width,
          height: drawn.height,
          svg: embeddedSvg(drawn.svg, { securityLevel, linkSchemes }),
        });
      }
      return out;
    };
  }

  return { prepare, draw };
}
