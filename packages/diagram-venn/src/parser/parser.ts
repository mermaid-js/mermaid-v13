// cspell:words LALR
/**
 * Venn parser: recursive descent over the significant {@link lex} tokens (gated against v12's
 * jison lexer, #486), producing a {@link VennModel}, the typed AST, symbols, statement spans and
 * diagnostics (DESIGN §4.2, spec #429).
 *
 * The grammar is v12's `venn.jison` (LALR), ported rule for rule; `grammar/venn.ebnf` is the
 * normative form:
 *
 *     diagram   = NEWLINE* VENN ( NEWLINE | statement )* EOF
 *     statement = TITLE
 *               | SET id [ label ] [ ":" NUMERIC ]
 *               | UNION ids [ label ] [ ":" NUMERIC ]
 *               | TEXT ids ( NUMERIC | id [ label ] )
 *               | INDENT_TEXT "text" ( NUMERIC | id [ label ] )
 *               | STYLE ids field ( "," field )*
 *     field     = IDENTIFIER ":" ( STRING | value+ )
 *     ids       = id ( "," id )* ;   id = IDENTIFIER | STRING
 *
 * Statements need no separator: one ends where its rule does, and the next token starts the
 * next statement or is a line break (`venn-beta set A` and `set A set B` parse, as in v12).
 * The lexer decides indent mode itself (`INDENT_TEXT` after a `set` or `union`), so the parser
 * needs no feedback.
 *
 * v12's DB throws two errors, kept here as diagnostics with v12's message, after which the
 * statement and the parse go on (R-PARSE-4): `union requires multiple identifiers` and
 * `unknown set identifier: <ids>` (a `union` naming a set no earlier `set` declared). Such a
 * union is not in the model, as in v12, and the indented `text` lines after it get no sets (they
 * are not in the model either). Unlike jison the parser does not stop at the first syntax
 * error: it reports it and skips to the next statement, at a statement keyword (`set`, `union`,
 * `text`, `style`, `title`) or a line break, so each statement gives at most one syntax
 * diagnostic and N bad statements give N. A keyword where a statement wanted something else
 * starts the next statement (`set A: set B` is one error).
 *
 * The four D417 warnings are `./warnings.ts`'s.
 *
 * With `probe` (R-LANG-7, D95, #498) the rules also record what they would accept at that offset,
 * at the same decision points as their `fail` lists, for completion; nothing else changes. The
 * probe's mode is jison's start condition there (`INITIAL`, `bol`), or `string`, `label` or
 * `title` inside a quoted id or value, a `[label]` or a title's text.
 *
 * Symbols (D418): a `set` statement defines its id (`set`; a repeat refers to the first), and the
 * ids in `union`, `text` and `style` refer to it; text-node ids are `text` symbols (the first of
 * a name defines it); a one-id `style` target is a set reference when a set has that id, else a
 * text reference when a text node has it, else a set reference. Ranges are the id tokens,
 * quotes included (D191).
 */
import { checkLimit } from '@mermaid-js/core/limits';
import {
  DQUOTE,
  Kind,
  kindSet,
  LBRACKET,
  LineIndex,
  ParseState,
  Probe,
  significantTokens,
  skipTo,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import { STOP } from '@mermaid-js/shared/parser/support';
import type {
  ParseOptions,
  ParseResult,
  Range,
  StatementSpan,
  TokenStream,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { VENN_UNION_ONE_SET, VENN_UNKNOWN_SET } from '../codes.ts';
import type { VennModel, VennStyle, VennSubset, VennTextNode } from '../model.ts';
import type {
  VennDocument,
  VennName,
  VennSetNode,
  VennStatementNode,
  VennStyleField,
  VennStyleNode,
  VennTextStatementNode,
  VennTitleNode,
  VennUnionNode,
} from './ast.ts';
import { lex } from './lexer.ts';
import type { Lexed } from './lexer.ts';
import { esc, idText, normalizeText, titleText } from './text.ts';
import { T } from './tokens.ts';
import { warnVenn } from './warnings.ts';
import type { Sourced } from './warnings.ts';

export interface VennParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /**
   * The editor's diagnostics (the language facet, #498): `VENN_UNKNOWN_TARGET` once per id a
   * `text` or `style` names that nothing declares (once per statement naming an undeclared
   * overlap), at that id, instead of D417's one warning per parse for a render.
   */
  perOccurrence?: boolean;
  /**
   * The integrator's cap on sets, unions and text nodes together (core
   * `DEFAULT_LIMITS.maxNodes` when absent, R-SEC-5).
   */
  maxNodes?: number;
}

export type VennParseResult = ParseResult<VennModel, VennDocument>;

/** Trivia the parser skips: comments, directives and a dropped `;`. */
const TRIVIA = kindSet(Kind.Comment, Kind.Directive, Kind.Space);
const STATEMENT_KINDS = [T.Title, T.Set, T.Union, T.Text, T.IndentText, T.Style] as const;
/** Where recovery resumes (R-PARSE-4): a statement keyword, a line break or the end. */
const BOUNDARY = kindSet(...STATEMENT_KINDS, Kind.Newline, T.Eof, Kind.EOF);

// What each decision point accepts: the kinds its test reads, which the probe records
// (R-LANG-7); the sets the parser tests with are made from the same lists.
const P_HEAD = [T.Venn, Kind.Newline];
const P_STATEMENT = [...STATEMENT_KINDS, Kind.Newline, T.Eof];
/** Before any `venn-beta`: a later one is taken as the header. */
const P_STATEMENT_OR_HEAD = [T.Venn, ...P_STATEMENT];
/** The `text` after an indent: the keyword of the indented text statement. */
const P_INDENT_TEXT = [T.IndentTextKeyword];
const P_ID = [T.Identifier, T.String];
const ID_KINDS = kindSet(...P_ID);
const P_COMMA = [T.Comma];
const P_LABEL = [T.QuotedLabel, T.Label];
const LABEL_KINDS = kindSet(...P_LABEL);
const P_COLON = [T.Colon];
const P_SIZE = [T.Numeric];
const P_TEXT_ID = [T.Numeric, T.Identifier, T.String];
const P_KEY = [T.Identifier];
const P_VALUE_WORD = [T.Identifier, T.Numeric, T.HexColor, T.RgbColor, T.RgbaColor];
const VALUE_KINDS = kindSet(...P_VALUE_WORD);
const P_VALUE = [T.String, ...P_VALUE_WORD];
/**
 * Kinds a probe's cursor follows rather than extends: `,`, `:`, and a quoted id or value and a
 * label, which their closing quote or bracket ends.
 */
const PROBE_FOLLOWS = kindSet(T.Comma, T.Colon, T.String, T.QuotedLabel, T.Label);

/**
 * The probe's mode at `o` when it is inside a value: `string` in a quoted id or value (closed
 * or not), `label` in a `[label]` (closed or not), `title` in a title's text (past `title` and
 * its blank, to the line end); else undefined, and the lexer's start condition is the mode.
 */
function valueMode(src: string, tokens: TokenStream, o: number): string | undefined {
  for (let j = 0; j < tokens.length; j++) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (start >= o) break;
    const kind = tokens.kind[j] ?? Kind.EOF;
    if (kind === Kind.Error) {
      // An unclosed quote or bracket: one error token, then the line lexed as code.
      const c = src.charCodeAt(start);
      if ((c === DQUOTE || c === LBRACKET) && !/[\n\r]/.test(src.slice(start, o)))
        return c === DQUOTE ? 'string' : 'label';
      continue;
    }
    if (end < o) continue;
    if (kind === T.String && o < end) return 'string';
    if ((kind === T.QuotedLabel || kind === T.Label) && o < end) return 'label';
    if (kind === T.Title && o > start + 'title'.length) return 'title';
  }
  return undefined;
}

// What the parser expects, in Mermaid terms (R-ERR-2, R-ERR-5).
const HEADER = ['`venn-beta`'];
const STATEMENT = ['`set`', '`union`', '`text`', '`style`', '`title`'];
const SET_ID = ['a set id such as `A` or `"A b"`'];
const SIZE = ['a size such as `10`'];
const TEXT_ID = ['the id of the text node, such as `t1`, `"t 1"` or `12`'];
const STYLE_TARGET = ['a set, overlap or text node id such as `A`'];
const STYLE_KEY = ['a style such as `fill: #f00`'];
const COLON = ['`:`'];
const STYLE_VALUE = ['a value such as `red`, `#f00`, `2px` or `"…"`'];

const HEADER_HINT = 'a venn diagram starts with `venn-beta`';
const ONE_HEADER = '`venn-beta` starts the diagram and comes only once';
const ONE_SET = 'a `set` names one set; write an overlap as `union A,B`';
const LABEL_HINT = 'a label goes right after its id, as in `set A["Alpha"]`';
const NUMBER_LABEL = 'a text node whose id is a number takes no label; quote the id, as in `"12"`';
const SIZE_FORM = 'a size is a number, as in `set A:10` or `set A:2.5`';
const SIZE_HINT = 'a size goes after the id or the label, as in `set A:10` or `set A["Alpha"]:10`';
const TEXT_HINT =
  '`text` names its sets first, as in `text A t1`; an indented `text t1` right under a `set` or `union` takes its sets';
const STYLE_HINT =
  'each style is `key: value`, and a `,` separates them, as in `fill: red, color: blue`';
const QUOTE_HINT =
  'an id is letters, digits, `_` and `-`, starting with a letter or `_`; quote any other id, as in `set "Ä b"`';

/** U+007F: ids are ASCII. */
const LAST_ASCII = 0x7f;

/** The optional `[label]` and `: size` after the ids of a `set` or `union`, and where they end. */
interface Tail {
  label?: string;
  size?: number;
  end: number;
}

/** What a `set` or `union` adds to the model (pitfall 10). */
interface SubsetParts {
  ast: string;
  sets: string[];
  /** How many ids were written (`union A,A` is two), for the default size. */
  written: number;
  tail: Tail;
  range: Range;
}

/** Parse a venn diagram. Never throws: problems are error diagnostics. */
export function parseVenn(src: string, options: VennParseOptions = {}): VennParseResult {
  return new VennParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class VennParser {
  private readonly pre: PreprocessResult;
  private readonly lexed: Lexed;
  /** The significant tokens (pitfall 7). */
  private readonly t: TokenView;
  private i = 0;
  private readonly st = new ParseState();
  private readonly probe: Probe | undefined;
  private lines: LineIndex | undefined;
  private readonly children: VennStatementNode[] = [];
  /** Mentions per id base, for the `@n` suffixes. */
  private readonly mentions = new Map<string, number>();
  private styleCount = 0;
  private readonly subsets: Sourced<VennSubset>[] = [];
  private readonly textNodes: Sourced<VennTextNode>[] = [];
  private readonly styles: Sourced<VennStyle>[] = [];
  /** v12's `knownSets`: the ids of the `set` statements read so far. */
  private readonly knownSets = new Set<string>();
  /**
   * v12's `currentSets`: the sorted ids of the last `set` or `union`, for the indented `text`
   * lines after it; undefined after a `union` that failed v12's checks.
   */
  private currentSets: string[] | undefined;
  /** The last in-text title (v12's `setDiagramTitle`: the last one wins). */
  private title: string | undefined;
  private headerSeen = false;
  /** The header is read or was reported missing. */
  private headerReported = false;
  private headerRange: Range | undefined;
  /** The open `set` or `union` span, which holds the indented `text` lines after it. */
  private block: StatementSpan | undefined;
  /** Ids defined so far per symbol kind: the first occurrence defines (D418). */
  private readonly defined = { set: new Set<string>(), text: new Set<string>() };
  /** One-id style targets, resolved once every set and text id is known. */
  private readonly styleTargets: VennName[] = [];

  constructor(
    private readonly src: string,
    private readonly options: VennParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    const view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.lexed = lex(src, pre.bodyStart, view, options.probe);
    this.t = significantTokens(this.lexed.tokens, TRIVIA);
    if (options.probe !== undefined) {
      const probe = (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.lexed.tokens);
      // Ignored when the offset is outside code.
      const o = probe.offset;
      probe.lexed(o, o, valueMode(src, this.lexed.tokens, o) ?? this.lexed.mode ?? 'INITIAL');
    }
  }

  parse(): VennParseResult {
    const { st, pre, src } = this;
    this.header();
    this.document();
    this.resolveStyleTargets();
    warnVenn(st.diagnostics, {
      subsets: this.subsets,
      textNodes: this.textNodes,
      styles: this.styles,
      header: this.headerRange ?? { start: pre.bodyStart, end: pre.bodyStart },
      lineOf: (at) => this.lineOf(at),
      quote: (r) => this.shown(r),
      perOccurrence: this.options.perOccurrence === true,
    });
    st.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    // D218: the in-text title if non-empty, else the front-matter one; D416 for the quotes.
    const inText = this.title === undefined ? '' : titleText(this.title);
    const title = inText || pre.frontMatter?.title;
    const model: VennModel = {
      subsets: this.subsets.map((p) => p.value),
      textNodes: this.textNodes.map((p) => p.value),
      styles: this.styles.map((p) => p.value),
      ...(title ? { title } : {}),
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    const ast: VennDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.lexed.tokens, this.options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(i = this.i): number {
    return this.t.kind[i] ?? Kind.EOF;
  }

  private range(i = this.i): Range {
    const j = Math.min(i, this.t.length - 1);
    return { start: this.t.start[j] ?? 0, end: this.t.end[j] ?? 0 };
  }

  /** A token's text as v12's parser read it (`Lexed.textOf`). */
  private raw(i = this.i): string {
    if (i >= this.t.length) return '';
    return this.lexed.textOf(this.kind(i), this.t.start[i] ?? 0, this.t.end[i] ?? 0);
  }

  /**
   * Probe hook: the parser tests token `j` for `kinds` (a constant list), or would accept them
   * there. Records them when it is the probed token.
   */
  private tested(kinds: readonly number[], j = this.i): void {
    const p = this.probe;
    if (p?.isAt(this.t, j, this.pre.bodyStart)) p.tested(kinds, this.t.start[j] ?? 0);
  }

  private is(set: Uint8Array, i = this.i): boolean {
    return set[this.kind(i)] === 1;
  }

  /** Whether token `i` ends the text: the end, or v12's appended (zero-width) line break. */
  private atEnd(i = this.i): boolean {
    const k = this.kind(i);
    if (k === Kind.EOF || k === T.Eof) return true;
    const r = this.range(i);
    return k === Kind.Newline && r.start === r.end;
  }

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** `base`, then `base@2`, `base@3`, … */
  private id(base: string): string {
    const n = (this.mentions.get(base) ?? 0) + 1;
    this.mentions.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }

  /** An id token: its model value (v12's `normalizeText`) and range. */
  private name(i = this.i): VennName {
    return { name: normalizeText(this.raw(i)), range: this.range(i) };
  }

  /** The source text of `r` as a message shows it: its first line, at most 24 characters. */
  private shown(r: Range): string {
    const text = this.src.slice(r.start, r.end).trim();
    const line = text.split(/\r\n?|\n/, 1)[0] ?? '';
    return line.length > 24 || line !== text ? `\`${line.slice(0, 24)}…\`` : `\`${line}\``;
  }

  // ---- errors and recovery ------------------------------------------------------------

  /** How an error message names the current token. */
  private found(): string {
    if (this.atEnd()) return 'the end of the text';
    if (this.kind() === Kind.Newline) return 'a line break';
    return this.shown(this.range());
  }

  /** Report what was found where `names` were expected, then stop the statement. */
  private fail(names: readonly string[], hint?: string): never {
    if (this.kind() === Kind.Error) {
      this.badCharacters();
      throw STOP;
    }
    this.st.diagnostics.unexpected(
      'UNEXPECTED',
      this.range(),
      [...names],
      this.found(),
      undefined,
      hint
    );
    throw STOP;
  }

  /**
   * Why the current token cannot start a statement, where a likely cause shows: `prev` is the
   * statement right before it on the same line.
   */
  private explain(prev: VennStatementNode | undefined): string | undefined {
    const k = this.kind();
    if (k === T.Venn) return ONE_HEADER;
    if (prev?.type === 'Set' && (k === T.Comma || this.is(ID_KINDS))) return ONE_SET;
    // A text statement takes a label after an id or a string, so one it left was after a number.
    if (this.is(LABEL_KINDS)) return prev?.type === 'Text' ? NUMBER_LABEL : LABEL_HINT;
    if (k === T.Colon) return SIZE_HINT;
    return undefined;
  }

  /**
   * Report the run of characters no token rule matched from the current token (the lexer emits
   * one error token per code point): an unclosed string or label, or stray characters.
   */
  private badCharacters(): void {
    const at = this.range();
    let end = at.end;
    for (let i = this.i + 1; this.kind(i) === Kind.Error && this.range(i).start === end; i++) {
      end = this.range(i).end;
    }
    const { src } = this;
    const text = src.slice(at.start, end);
    const line = this.lineOf(at.start);
    const d = this.st.diagnostics;
    const first = text.charAt(0);
    if (first === '"') {
      d.error(
        'UNCLOSED_STRING',
        `Unclosed string: the \`"\` at line ${line} has no closing \`"\`. Add \`"\` after the text.`,
        at
      );
      return;
    }
    if (first === '[') {
      // What follows on the line (a label may span lines; the message reads this one only).
      let k = at.start + 1;
      while (k < src.length && src[k] !== ']' && src[k] !== '"' && src[k] !== '\n') k++;
      if (k === at.start + 1 && src[k] === ']') {
        d.error(
          'UNEXPECTED_CHARACTER',
          'Empty label `[]`: write its text between the brackets, or leave the label out.',
          { start: at.start, end: k + 1 }
        );
      } else if (src[k] === '"') {
        d.error(
          'UNEXPECTED_CHARACTER',
          'A label with a `"` in it is quoted whole, as in `["a label"]`, and holds no other `"`.',
          at
        );
      } else {
        d.error(
          'UNCLOSED_LABEL',
          `Unclosed label: the \`[\` at line ${line} has no closing \`]\`. Add \`]\` after the label.`,
          at
        );
      }
      return;
    }
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    const why = explainCharacters(text);
    d.error('UNEXPECTED_CHARACTER', `Unexpected character \`${shown}\`${why ? `; ${why}` : ''}.`, {
      start: at.start,
      end,
    });
  }

  /**
   * Skip to the next statement after an error in the statement that started at token `from`
   * (R-PARSE-4): a statement keyword or a line break. A keyword after the statement's first
   * token is where the next one starts.
   */
  private recover(from: number): void {
    this.probe?.freeze();
    const at = this.i > from && this.is(BOUNDARY) ? this.i : this.i + 1;
    this.i = skipTo(this.t, Math.min(at, this.t.length), BOUNDARY);
  }

  /** Run one statement rule; on failure, recover. Returns what the rule made. */
  private statement<R>(rule: () => R): R | undefined {
    const from = this.i;
    try {
      return rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover(from);
      return undefined;
    }
  }

  // ---- rules --------------------------------------------------------------------------

  /** `NEWLINE* VENN`. Without it the rest is still read, and a later `venn-beta` is taken as it. */
  private header(): void {
    for (;;) {
      this.tested(P_HEAD);
      if (this.kind() !== Kind.Newline || this.atEnd()) break;
      this.i++;
    }
    if (this.kind() === T.Venn) this.takeHeader();
    else this.statement(() => this.fail(HEADER, HEADER_HINT));
    // One error, one diagnostic: later statements are not told the header is missing again.
    this.headerReported = true;
  }

  private takeHeader(): void {
    const range = this.range(this.i++);
    this.headerSeen = true;
    this.headerRange = range;
    this.st.statement('header', range);
  }

  /** `( NEWLINE | statement )* EOF` */
  private document(): void {
    /** The statement before on this line, for the hints. */
    let prev: VennStatementNode | undefined;
    for (;;) {
      this.tested(this.headerSeen ? P_STATEMENT : P_STATEMENT_OR_HEAD);
      if (this.atEnd()) return;
      const k = this.kind();
      if (k === Kind.Newline) {
        prev = undefined;
        this.i++;
        continue;
      }
      if (k === T.Venn && !this.headerSeen) {
        this.takeHeader();
        continue;
      }
      // The `set` or `union` span ends before any statement but an indented `text`.
      if (k !== T.IndentText) this.block = undefined;
      const before = prev;
      prev = this.statement((): VennStatementNode => {
        if (k === T.Title) return this.titleStatement();
        if (k === T.Set) return this.setStatement();
        if (k === T.Union) return this.unionStatement();
        if (k === T.Text) return this.textStatement();
        if (k === T.IndentText) return this.indentedText();
        if (k === T.Style) return this.styleStatement();
        if (this.headerSeen || this.headerReported) this.fail(STATEMENT, this.explain(before));
        return this.fail(HEADER, HEADER_HINT);
      });
    }
  }

  /** `id = IDENTIFIER | STRING` */
  private ident(names: readonly string[], hint?: string): VennName {
    this.tested(P_ID);
    if (!this.is(ID_KINDS)) this.fail(names, hint);
    return this.name(this.i++);
  }

  /** `ids = id ( "," id )*` */
  private ids(names: readonly string[], hint?: string): VennName[] {
    const out = [this.ident(names, hint)];
    for (;;) {
      this.tested(P_COMMA);
      if (this.kind() !== T.Comma) break;
      this.i++;
      out.push(this.ident(names, hint));
    }
    return out;
  }

  /** `[ label ]`: the label as v12's DB kept it (an empty one is none), and where it ends. */
  private label(end: number): { label?: string; end: number } {
    this.tested(P_LABEL);
    if (!this.is(LABEL_KINDS)) return { end };
    const raw = this.raw();
    const at = this.range(this.i++).end;
    return raw ? { label: normalizeText(raw), end: at } : { end: at };
  }

  /** `[ label ] [ ":" NUMERIC ]` after the ids ending at `end`; the size as v12's `parseFloat`. */
  private tail(end: number): Tail {
    const tail: Tail = this.label(end);
    this.tested(P_COLON);
    if (this.kind() !== T.Colon) return tail;
    this.i++;
    this.tested(P_SIZE);
    if (this.kind() !== T.Numeric) this.fail(SIZE, SIZE_FORM);
    tail.size = Number.parseFloat(this.raw());
    tail.end = this.range(this.i++).end;
    return tail;
  }

  /** `TITLE`: v12 keeps the text after `title` and one blank (`substr(6)`). */
  private titleStatement(): VennTitleNode {
    const range = this.range();
    const text = this.raw(this.i++).slice(6);
    this.title = text;
    const node: VennTitleNode = { id: this.id('title'), type: 'Title', range, text };
    this.children.push(node);
    this.st.statement('title', range);
    return node;
  }

  /** `SET id [ label ] [ ":" NUMERIC ]` */
  private setStatement(): VennSetNode {
    const start = this.range(this.i++).start;
    const name = this.ident(SET_ID);
    const tail = this.tail(name.range.end);
    const range = { start, end: tail.end };
    const node: VennSetNode = {
      id: this.id(`set:${esc(name.name)}`),
      type: 'Set',
      range,
      name,
      ...optional(tail),
    };
    this.children.push(node);
    this.symbol('set', name);
    this.knownSets.add(name.name);
    this.block = this.st.statement('set', { ...range });
    this.addSubset({ ast: node.id, sets: [name.name], written: 1, tail, range });
    return node;
  }

  /** `UNION ids [ label ] [ ":" NUMERIC ]`, then v12's two checks. */
  private unionStatement(): VennUnionNode {
    const start = this.range(this.i++).start;
    const members = this.ids(SET_ID);
    const tail = this.tail(members[members.length - 1]?.range.end ?? start);
    const range = { start, end: tail.end };
    const sets = members.map((m) => m.name).sort();
    const node: VennUnionNode = {
      id: this.id(`union:${sets.map(esc).join('+')}`),
      type: 'Union',
      range,
      members,
      ...optional(tail),
    };
    this.children.push(node);
    for (const m of members) this.symbol('set', m, 'ref');
    this.block = this.st.statement('union', { ...range });
    // v12 threw before it added the union: the indented text lines after it get no sets.
    this.currentSets = undefined;
    const d = this.st.diagnostics;
    if (members.length < 2) {
      d.error(
        VENN_UNION_ONE_SET,
        'union requires multiple identifiers: a `union` is the overlap of two or more sets, as in `union A,B`.',
        range
      );
      return node;
    }
    const unknown = members.filter((m) => !this.knownSets.has(m.name));
    const first = unknown[0];
    if (first) {
      const names = unknown.map((m) => m.name).join(', ');
      d.error(
        VENN_UNKNOWN_SET,
        `unknown set identifier: ${names}. A \`union\` names sets declared before it, as in \`set ${idText(first.name)}\`.`,
        first.range
      );
      return node;
    }
    this.addSubset({ ast: node.id, sets, written: members.length, tail, range });
    return node;
  }

  /** `TEXT ids ( NUMERIC | id [ label ] )` */
  private textStatement(): VennTextStatementNode {
    const start = this.range(this.i++).start;
    const members = this.ids(SET_ID, TEXT_HINT);
    for (const m of members) this.symbol('set', m, 'ref');
    const sets = members.map((m) => m.name).sort();
    return this.textTail(start, sets, members, false);
  }

  /** `INDENT_TEXT "text" ( NUMERIC | id [ label ] )`: the sets of the last `set` or `union`. */
  private indentedText(): VennTextStatementNode {
    this.i++;
    // The `text` after the indent (jison returns no token for it).
    const start = this.range().start;
    this.tested(P_INDENT_TEXT);
    if (this.kind() === T.IndentTextKeyword) this.i++;
    return this.textTail(start, this.currentSets, [], true);
  }

  private textTail(
    start: number,
    sets: readonly string[] | undefined,
    members: VennName[],
    indented: boolean
  ): VennTextStatementNode {
    this.tested(P_TEXT_ID);
    const number = this.kind() === T.Numeric;
    if (!number && !this.is(ID_KINDS)) this.fail(TEXT_ID, indented ? undefined : TEXT_HINT);
    const name = this.name(this.i++);
    // A number id takes no label (v12's grammar).
    const { label, end } = number
      ? { label: undefined, end: name.range.end }
      : this.label(name.range.end);
    const range = { start, end };
    const node: VennTextStatementNode = {
      id: this.id(`text:${esc(name.name)}`),
      type: 'Text',
      range,
      indented,
      members,
      name,
      ...(label !== undefined ? { label } : {}),
    };
    this.children.push(node);
    this.symbol('text', name);
    if (indented && this.block) {
      // Under the open `set` or `union`, which now runs to this line (folding, R-LANG-3).
      (this.block.children ??= []).push({ kind: 'text', range });
      this.block.range.end = end;
    } else this.st.statement('text', range);
    if (sets === undefined) return node;
    // The sets of an indented text are its `set` or `union`'s (shared, not copied: a wide
    // union with many text lines stays linear).
    const value: VennTextNode = {
      ast: node.id,
      sets,
      id: name.name,
      ...(label !== undefined ? { label } : {}),
    };
    this.textNodes.push({ value, range, what: 'the text node', quote: name.range, ids: members });
    this.counted(range);
    return node;
  }

  /** `STYLE ids field ( "," field )*` */
  private styleStatement(): VennStyleNode {
    const start = this.range(this.i++).start;
    const targets = this.ids(STYLE_TARGET);
    const fields = [this.field()];
    for (;;) {
      this.tested(P_COMMA);
      if (this.kind() !== T.Comma) break;
      this.i++;
      fields.push(this.field());
    }
    const end = fields[fields.length - 1]?.valueRange.end ?? start;
    const range = { start, end };
    const node: VennStyleNode = {
      id: `style:${++this.styleCount}`,
      type: 'Style',
      range,
      targets,
      fields,
    };
    this.children.push(node);
    this.st.statement('style', range);
    const one = targets.length === 1 ? targets[0] : undefined;
    if (one) this.styleTargets.push(one);
    else for (const t of targets) this.symbol('set', t, 'ref');
    // v12 builds a plain object: a later key replaces an earlier one in place.
    const properties: Record<string, string> = {};
    for (const f of fields) properties[f.key] = f.value;
    const value: VennStyle = {
      ast: node.id,
      targets: targets.map((t) => t.name).sort(),
      properties,
    };
    this.styles.push({ value, range, what: 'the style', ids: targets });
    return node;
  }

  /** `field = IDENTIFIER ":" ( STRING | value+ )`; values joined with a blank, as in v12. */
  private field(): VennStyleField {
    this.tested(P_KEY);
    if (this.kind() !== T.Identifier) this.fail(STYLE_KEY, STYLE_HINT);
    const keyRange = this.range();
    const key = this.raw(this.i++);
    this.tested(P_COLON);
    if (this.kind() !== T.Colon) this.fail(COLON, STYLE_HINT);
    this.i++;
    this.tested(P_VALUE);
    if (this.kind() === T.String) {
      const valueRange = this.range();
      return { key, keyRange, value: normalizeText(this.raw(this.i++)), valueRange };
    }
    if (!this.is(VALUE_KINDS)) this.fail(STYLE_VALUE);
    const start = this.range().start;
    const parts: string[] = [];
    let end = start;
    while (this.is(VALUE_KINDS)) {
      parts.push(this.raw());
      end = this.range(this.i++).end;
      this.tested(P_VALUE_WORD);
    }
    return { key, keyRange, value: normalizeText(parts.join(' ')), valueRange: { start, end } };
  }

  // ---- model and symbols --------------------------------------------------------------

  /** v12's `addSubsetData`: sorted ids, the size or `10 / n²`, the last sets for `text`. */
  private addSubset({ ast, sets, written, tail, range }: SubsetParts): void {
    this.currentSets = sets;
    const value: VennSubset = {
      ast,
      sets,
      size: tail.size ?? 10 / Math.pow(written, 2),
      ...(tail.label !== undefined ? { label: tail.label } : {}),
    };
    this.subsets.push({ value, range, quote: range });
    this.counted(range);
  }

  /** The integrator's cap on what the chart draws (R-SEC-5, #721): one more, at `range`. */
  private counted(range: Range): void {
    const count = this.subsets.length + this.textNodes.length;
    const { maxNodes } = this.options;
    checkLimit(
      this.st.diagnostics,
      'maxNodes',
      count,
      maxNodes,
      'sets, unions and text nodes',
      range
    );
  }

  /** A `set` or `text` id occurrence; without a role, the first of a name defines it (D418). */
  private symbol(kind: 'set' | 'text', n: VennName, role?: 'def' | 'ref'): void {
    const seen = this.defined[kind];
    const r = role ?? (seen.has(n.name) ? 'ref' : 'def');
    if (r === 'def') seen.add(n.name);
    this.st.symbol(n.name, kind, n.range, r);
  }

  /** A one-id style target: a set when one has the id, else a text node when one has it. */
  private resolveStyleTargets(): void {
    for (const t of this.styleTargets) {
      const text = !this.defined.set.has(t.name) && this.defined.text.has(t.name);
      this.st.symbol(t.name, text ? 'text' : 'set', t.range, 'ref');
    }
  }
}

/** The label and size of a tail, as AST fields (absent when not written). */
function optional(tail: Tail): { label?: string; size?: number } {
  return {
    ...(tail.label !== undefined ? { label: tail.label } : {}),
    ...(tail.size !== undefined ? { size: tail.size } : {}),
  };
}

/** Why stray characters are not venn, where a likely cause shows. */
function explainCharacters(text: string): string | undefined {
  if (text === ';') return '`;` is not venn syntax: a statement ends at the line end';
  if (text.charCodeAt(0) > LAST_ASCII) return QUOTE_HINT;
  if (text.startsWith('.')) return 'a number has digits after its `.`, as in `1.5`';
  if (text.startsWith('{') || text.startsWith('(')) {
    return 'a venn statement takes no brackets but a `[label]`';
  }
  return undefined;
}
