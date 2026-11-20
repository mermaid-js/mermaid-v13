/**
 * Parse output (DESIGN §4.2, R-PARSE-3): a full parse returns the model plus the AST,
 * diagnostics, symbol occurrences and statement spans; a lean parse, for drawing only, returns
 * the model and the diagnostics. `ParseState` collects them for one parse.
 */
import { AstIds } from './ast.ts';
import type { AstNode } from './ast.ts';
import { Diagnostics } from './diagnostics.ts';
import type { Diagnostic } from './diagnostics.ts';
import type { Range } from './positions.ts';
import type { Probe, ProbeResult } from './probe.ts';
import type { TokenStream } from './tokens.ts';

/** One occurrence of a user identifier: for definition, references and rename (R-PARSE-5). */
export interface SymbolOccurrence {
  name: string;
  /** What the name denotes, e.g. `node`, `class`, `subgraph`. */
  kind: string;
  range: Range;
  role: 'def' | 'ref';
}

/** A statement's source span, for folding and code↔diagram highlighting. */
export interface StatementSpan {
  kind: string;
  range: Range;
  /** Statements inside a block statement (e.g. a subgraph body). */
  children?: StatementSpan[];
}

export interface ParseOptions {
  /** Also return the token stream (`config.internal.keepTokens`; for editors). */
  keepTokens?: boolean;
  /** Record what the parser would accept at this UTF-16 offset (R-LANG-7, D95). */
  probe?: number;
  /** A full parse; {@link LeanParseOptions} ask for a lean one. */
  lean?: false;
}

/**
 * A lean parse: what `mermaid` asks for when only the drawing reads the result. The parser
 * accepts and rejects exactly as in a full parse and reports the same warnings, but builds no
 * AST and records no symbol occurrences or statement spans; it returns a
 * {@link LeanParseResult}. On an error it may stop early: the caller parses again in full for
 * the diagnostics.
 */
export interface LeanParseOptions {
  readonly lean: true;
  /**
   * Give the model its AST ids (`data-ast` is drawn). Without it, an id that only `data-ast`
   * reads may be `NO_AST_ID`.
   */
  readonly astIds?: boolean;
}

/**
 * A diagram embedded in a host diagram (ADR-15): `mermaid <id>["Title"] { … }`. The host lists
 * its blocks; `mermaid` renders each one and hands it back by id (`RenderContext.embed`).
 */
export interface EmbeddedBlock {
  /** The block's node id in the host. */
  readonly id: string;
  /** The title as written inside `["…"]`, unquoted; absent for an untitled block. */
  readonly title?: string;
  /** The body as written: another diagram's whole text. */
  readonly text: string;
  /** Where {@link text} starts in the host's text, to place errors inside it. */
  readonly offset: number;
  /**
   * Folded (`id@{ view: collapsed }`, #670): never parsed, laid out or drawn; `mermaid` detects
   * only its type, from its type line (`RenderContext.foldedType`).
   */
  readonly folded?: boolean;
}

/** What every parse returns, full or lean. */
export interface ParseOutput<M> {
  /** Plain, serialisable (structuredClone-able) diagram model. */
  model: M;
  /** Errors and warnings, ranges in the original source. */
  diagnostics: Diagnostic[];
  /** The diagrams embedded in this one, in source order (ADR-15); absent when there are none. */
  embeds?: readonly EmbeddedBlock[];
  /**
   * The edges the parse made, for `maxEdges` counted across a text with embedded diagrams
   * (ADR-15); absent for a type that does not count them.
   */
  edgeCount?: number;
}

/** A full parse (R-PARSE-3): the model with the AST, symbols and statement spans. */
export interface ParseResult<M, A extends AstNode = AstNode> extends ParseOutput<M> {
  /** Unset on a full result; `true` marks a {@link LeanParseResult}. */
  readonly lean?: false;
  ast: A;
  symbols: SymbolOccurrence[];
  statements: StatementSpan[];
  /** Only with {@link ParseOptions.keepTokens}. */
  tokens?: TokenStream;
  /** Only with {@link ParseOptions.probe}. */
  probe?: ProbeResult;
}

/**
 * A lean parse ({@link LeanParseOptions}): the model and every diagnostic, with no AST, symbols
 * or statements. A result with an error diagnostic may be incomplete: never draw it.
 */
export interface LeanParseResult<M> extends ParseOutput<M> {
  readonly lean: true;
}

/** The span `ParseState` hands out in a lean parse: frozen, so writing to it throws. */
const NO_SPAN: StatementSpan = Object.freeze({
  kind: '',
  range: Object.freeze({ start: 0, end: 0 }),
});

/**
 * Collects the side outputs of one parse. Create one per parse, with the parse's options.
 *
 * In a lean parse ({@link LeanParseOptions}) `symbol` and the statement methods record nothing
 * (the statement methods return a frozen span), and the parser builds no AST: it guards every
 * piece of work only the AST, the symbols or the statements read with {@link lean}, and the
 * model's AST ids with {@link astIds}.
 */
export class ParseState {
  readonly diagnostics = new Diagnostics();
  readonly symbols: SymbolOccurrence[] = [];
  readonly statements: StatementSpan[] = [];
  readonly ids = new AstIds();
  /** A lean parse: build no AST, record no symbols or statements. */
  readonly lean: boolean;
  /** Whether the model gets its AST ids: in a full parse always, in a lean one when asked. */
  readonly astIds: boolean;
  private readonly open: StatementSpan[] = [];

  constructor(options?: { readonly lean?: boolean; readonly astIds?: boolean }) {
    this.lean = options?.lean === true;
    this.astIds = !this.lean || options?.astIds === true;
  }

  /** Record an identifier occurrence. */
  symbol(name: string, kind: string, range: Range, role: 'def' | 'ref'): void {
    if (!this.lean) this.symbols.push({ name, kind, range, role });
  }

  private place(span: StatementSpan): StatementSpan {
    const parent = this.open[this.open.length - 1];
    if (parent) (parent.children ??= []).push(span);
    else this.statements.push(span);
    return span;
  }

  /** Record a complete statement, inside the innermost open block if any. */
  statement(kind: string, range: Range): StatementSpan {
    return this.lean ? NO_SPAN : this.place({ kind, range });
  }

  /** Open a block statement at `start`; statements recorded until its end nest under it. */
  beginStatement(kind: string, start: number): StatementSpan {
    if (this.lean) return NO_SPAN;
    const span = this.place({ kind, range: { start, end: start } });
    this.open.push(span);
    return span;
  }

  /** Close `span` (and any block left open inside it) at `end`. */
  endStatement(span: StatementSpan, end: number): void {
    const i = this.open.lastIndexOf(span);
    if (i < 0) return;
    for (const s of this.open.splice(i)) s.range.end = end;
  }

  /**
   * Assemble the {@link ParseResult}; the token stream is included only on request, the probe
   * result when the parse had a probe.
   */
  result<M, A extends AstNode>(
    model: M,
    ast: A,
    tokens: TokenStream,
    options?: Pick<ParseOptions, 'keepTokens'>,
    probe?: Probe
  ): ParseResult<M, A> {
    const out: ParseResult<M, A> = {
      model,
      ast,
      diagnostics: this.diagnostics.list,
      symbols: this.symbols,
      statements: this.statements,
    };
    if (options?.keepTokens) out.tokens = tokens;
    if (probe) out.probe = probe.result();
    return out;
  }

  /** Assemble the {@link LeanParseResult} of a lean parse. */
  leanResult<M>(model: M): LeanParseResult<M> {
    return { lean: true, model, diagnostics: this.diagnostics.list };
  }
}
