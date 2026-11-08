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
 * `unknown set identifier: <ids>` (a `union` naming a set no earlier `set` declared). Neither
 * union reaches the model, as in v12. Unlike jison the parser does not stop at the first
 * syntax error: it reports it, skips to the next line break and carries on, so each line gives
 * at most one syntax diagnostic (one error, one diagnostic: what follows a bad token on its line
 * is not reported again).
 *
 * Four warnings, one per parse each (D417): `VENN_DUPLICATE` (a repeated `set` or `union`),
 * `VENN_INVALID_SIZE` (a negative size), `VENN_UNKNOWN_TARGET` (a text node or style naming
 * nothing drawn) and `VENN_EMPTY` (no set, and no error).
 *
 * Symbols (D418): a `set` statement defines its id (`set`; a repeat refers to the first), and the
 * ids in `union`, `text` and `style` refer to it; text-node ids are `text` symbols (the first of
 * a name defines it); a one-id `style` target is a set reference when a set has that id, else a
 * text reference when a text node has it, else a set reference. Ranges are the id tokens,
 * quotes included (D191).
 */
import { Kind, kindSet, LineIndex, ParseState, sourceView } from '@mermaid-js/core/parser-kit';
import type {
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  StatementSpan,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import {
  VENN_DUPLICATE,
  VENN_EMPTY,
  VENN_INVALID_SIZE,
  VENN_UNION_ONE_SET,
  VENN_UNKNOWN_SET,
  VENN_UNKNOWN_TARGET,
} from '../codes.ts';
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
import { T } from './tokens.ts';

export interface VennParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type VennParseResult = ParseResult<VennModel, VennDocument>;

/** Trivia the parser skips: comments, directives and a dropped `;`. */
const TRIVIA = kindSet(Kind.Comment, Kind.Directive, Kind.Space);
const ID_KINDS = kindSet(T.Identifier, T.String);
const LABEL_KINDS = kindSet(T.QuotedLabel, T.Label);
const VALUE_KINDS = kindSet(T.Identifier, T.Numeric, T.HexColor, T.RgbColor, T.RgbaColor);

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

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/**
 * `%`, `>`, `@`, `#` and `+` percent-encoded (the separators of venn ids), and so are the
 * characters XML 1.0 cannot hold (C0 controls but tab, LF and CR; DEL; lone surrogates; U+FFFE,
 * U+FFFF). Two hex digits up to U+007F, four above, so the encoding stays one-to-one.
 */
const ESCAPED = '%>@#+\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udfff\\ufffe\\uffff';
const RE_NEEDS_ESC = new RegExp(`[${ESCAPED}]`, 'u');
const RE_ESC = new RegExp(`[${ESCAPED}]`, 'gu');
const TWO_DIGITS = 0x80;
function esc(name: string): string {
  return RE_NEEDS_ESC.test(name)
    ? name.replace(RE_ESC, (c) => {
        const n = c.charCodeAt(0);
        return `%${n
          .toString(16)
          .toUpperCase()
          .padStart(n < TWO_DIGITS ? 2 : 4, '0')}`;
      })
    : name;
}

/** Whether `text` is wrapped in one pair of `"` (after trimming). */
function quoted(trimmed: string): boolean {
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"');
}

/** v12's `normalizeText`: trimmed, then one pair of surrounding `"` removed. */
function normalizeText(text: string): string {
  const trimmed = text.trim();
  return quoted(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

/** D416: one pair of surrounding quotes removed; any other title as v12 kept it. */
function titleText(text: string): string {
  const trimmed = text.trim();
  return quoted(trimmed) ? trimmed.slice(1, -1) : text;
}

/** `a`, `a and b`, `a, b and c`. */
function listOf(parts: readonly string[]): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}

/** A key for a list of ids (they may hold any character but `"`). */
const keyOf = (ids: readonly string[]): string => JSON.stringify(ids);

/** A model entry with the statement it came from, for the warnings. */
interface Placed<V> {
  value: V;
  range: Range;
  /** What a warning shows of it. */
  shown: string;
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
  /** Indexes of the significant tokens into `lexed.tokens`. */
  private readonly sig: number[] = [];
  private i = 0;
  private readonly st = new ParseState();
  private lines: LineIndex | undefined;
  private readonly children: VennStatementNode[] = [];
  /** Mentions per id base, for the `@n` suffixes. */
  private readonly mentions = new Map<string, number>();
  private styleCount = 0;
  private readonly subsets: Placed<VennSubset>[] = [];
  private readonly textNodes: Placed<VennTextNode>[] = [];
  private readonly styles: Placed<VennStyle>[] = [];
  /** v12's `knownSets`: the ids of the `set` statements read so far. */
  private readonly knownSets = new Set<string>();
  /** v12's `currentSets`: the sorted ids of the last `set` or `union`. */
  private currentSets: string[] | undefined;
  /** The last in-text title (v12's `setDiagramTitle`: the last one wins). */
  private title: string | undefined;
  private headerSeen = false;
  /** The header is read or was reported missing. */
  private headerReported = false;
  private headerRange: Range | undefined;
  /** The open `set` or `union` span, which holds the indented `text` lines after it. */
  private block: StatementSpan | undefined;
  /**
   * The kind of the last statement read on this line, and whether its text id was a number (for
   * the hints of an error right after it).
   */
  private lastStatement = 0;
  private lastNumberId = false;
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
    const view: SourceView = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.lexed = lex(src, pre.bodyStart, view);
    const { tokens } = this.lexed;
    for (let j = 0; j < tokens.length; j++) {
      if (TRIVIA[tokens.kind[j] ?? Kind.EOF] !== 1) this.sig.push(j);
    }
  }

  parse(): VennParseResult {
    const { st, pre, src } = this;
    this.header();
    this.document();
    this.resolveStyleTargets();
    this.warn();
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
    return st.result(model, ast, this.lexed.tokens, this.options);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(i = this.i): number {
    const j = this.sig[i];
    return j === undefined ? Kind.EOF : (this.lexed.tokens.kind[j] ?? Kind.EOF);
  }

  private range(i = this.i): Range {
    const t = this.lexed.tokens;
    const j = this.sig[i] ?? t.length - 1;
    return { start: t.start[j] ?? 0, end: t.end[j] ?? 0 };
  }

  /** A token's text as v12's parser read it (`Lexed.text`). */
  private raw(i = this.i): string {
    const j = this.sig[i];
    return j === undefined ? '' : this.lexed.text(j);
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
    const d = this.st.diagnostics.unexpected('UNEXPECTED', this.range(), [...names], this.found());
    if (hint) d.message = `${d.message.slice(0, -1)}; ${hint}.`;
    throw STOP;
  }

  /** Why the current token cannot start a statement, where a likely cause shows (for `fail`). */
  private explain(): string | undefined {
    const k = this.kind();
    const prev = this.lastStatement;
    if (k === T.Venn) return ONE_HEADER;
    if (prev === T.Set && (k === T.Comma || this.is(ID_KINDS))) return ONE_SET;
    if (this.is(LABEL_KINDS)) {
      return prev === T.Text && this.lastNumberId ? NUMBER_LABEL : LABEL_HINT;
    }
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

  /** Skip to the next line break after an error (R-PARSE-4). */
  private recover(): void {
    while (!this.atEnd() && this.kind() !== Kind.Newline) this.i++;
  }

  /** Run one statement rule; on failure, recover. */
  private statement(rule: () => void): void {
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
  }

  // ---- rules --------------------------------------------------------------------------

  /** `NEWLINE* VENN`. Without it the rest is still read, and a later `venn-beta` is taken as it. */
  private header(): void {
    while (this.kind() === Kind.Newline && !this.atEnd()) this.i++;
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
    for (;;) {
      if (this.atEnd()) return;
      const k = this.kind();
      if (k === Kind.Newline) {
        // The hints read the statement before on the same line only.
        this.lastStatement = 0;
        this.i++;
        continue;
      }
      if (k === T.Venn && !this.headerSeen) {
        this.takeHeader();
        continue;
      }
      // The `set` or `union` span ends before any statement but an indented `text`.
      if (k !== T.IndentText) this.block = undefined;
      this.statement(() => {
        if (k === T.Title) this.titleStatement();
        else if (k === T.Set) this.setStatement();
        else if (k === T.Union) this.unionStatement();
        else if (k === T.Text) this.textStatement();
        else if (k === T.IndentText) this.indentedText();
        else if (k === T.Style) this.styleStatement();
        else if (this.headerSeen || this.headerReported) this.fail(STATEMENT, this.explain());
        else this.fail(HEADER, HEADER_HINT);
      });
    }
  }

  /** `id = IDENTIFIER | STRING` */
  private ident(names: readonly string[], hint?: string): VennName {
    if (!this.is(ID_KINDS)) this.fail(names, hint);
    return this.name(this.i++);
  }

  /** `ids = id ( "," id )*` */
  private ids(names: readonly string[], hint?: string): VennName[] {
    const out = [this.ident(names, hint)];
    while (this.kind() === T.Comma) {
      this.i++;
      out.push(this.ident(names, hint));
    }
    return out;
  }

  /** `[ label ]`: the label as v12's DB kept it (an empty one is none), and where it ends. */
  private label(): { label?: string; end?: number } {
    if (!this.is(LABEL_KINDS)) return {};
    const raw = this.raw();
    const end = this.range(this.i++).end;
    return raw ? { label: normalizeText(raw), end } : { end };
  }

  /** `[ ":" NUMERIC ]`: the size as v12 read it (`parseFloat`), and where it ends. */
  private size(): { size?: number; end?: number } {
    if (this.kind() !== T.Colon) return {};
    this.i++;
    if (this.kind() !== T.Numeric) this.fail(SIZE, SIZE_FORM);
    const size = Number.parseFloat(this.raw());
    return { size, end: this.range(this.i++).end };
  }

  /** `TITLE`: v12 keeps the text after `title` and one blank (`substr(6)`). */
  private titleStatement(): void {
    this.lastStatement = T.Title;
    const range = this.range();
    const text = this.raw(this.i++).slice(6);
    this.title = text;
    const node: VennTitleNode = { id: this.id('title'), type: 'Title', range, text };
    this.children.push(node);
    this.st.statement('title', range);
  }

  /** `SET id [ label ] [ ":" NUMERIC ]` */
  private setStatement(): void {
    this.lastStatement = T.Set;
    const start = this.range(this.i++).start;
    const name = this.ident(SET_ID);
    const { label, end: labelEnd } = this.label();
    const { size, end: sizeEnd } = this.size();
    const range = { start, end: sizeEnd ?? labelEnd ?? name.range.end };
    const node: VennSetNode = {
      id: this.id(`set:${esc(name.name)}`),
      type: 'Set',
      range,
      name,
      ...(label !== undefined ? { label } : {}),
      ...(size !== undefined ? { size } : {}),
    };
    this.children.push(node);
    this.symbol('set', name);
    this.knownSets.add(name.name);
    this.block = this.st.statement('set', { ...range });
    this.addSubset(node.id, [name.name], 1, label, size, range);
  }

  /** `UNION ids [ label ] [ ":" NUMERIC ]`, then v12's two checks. */
  private unionStatement(): void {
    this.lastStatement = T.Union;
    const start = this.range(this.i++).start;
    const members = this.ids(SET_ID);
    const { label, end: labelEnd } = this.label();
    const { size, end: sizeEnd } = this.size();
    const last = members[members.length - 1]?.range.end ?? start;
    const range = { start, end: sizeEnd ?? labelEnd ?? last };
    const sets = members.map((m) => m.name).sort();
    const node: VennUnionNode = {
      id: this.id(`union:${sets.map(esc).join('+')}`),
      type: 'Union',
      range,
      members,
      ...(label !== undefined ? { label } : {}),
      ...(size !== undefined ? { size } : {}),
    };
    this.children.push(node);
    for (const m of members) this.symbol('set', m, 'ref');
    this.currentSets = sets;
    this.block = this.st.statement('union', { ...range });
    const d = this.st.diagnostics;
    if (members.length < 2) {
      d.error(
        VENN_UNION_ONE_SET,
        'union requires multiple identifiers: a `union` is the overlap of two or more sets, as in `union A,B`.',
        range
      );
      return;
    }
    const unknown = members.filter((m) => !this.knownSets.has(m.name));
    const first = unknown[0];
    if (first) {
      const names = unknown.map((m) => m.name).join(', ');
      d.error(
        VENN_UNKNOWN_SET,
        `unknown set identifier: ${names}. A \`union\` names sets declared before it, as in \`set ${first.name}\`.`,
        first.range
      );
      return;
    }
    this.addSubset(node.id, sets, members.length, label, size, range);
  }

  /** `TEXT ids ( NUMERIC | id [ label ] )` */
  private textStatement(): void {
    this.lastStatement = T.Text;
    this.lastNumberId = false;
    const start = this.range(this.i++).start;
    const members = this.ids(SET_ID, TEXT_HINT);
    for (const m of members) this.symbol('set', m, 'ref');
    const sets = members.map((m) => m.name).sort();
    this.textTail(start, sets, members, false);
  }

  /** `INDENT_TEXT "text" ( NUMERIC | id [ label ] )`: the sets of the last `set` or `union`. */
  private indentedText(): void {
    this.lastStatement = T.Text;
    this.lastNumberId = false;
    this.i++;
    // The `text` after the indent (jison returns no token for it).
    const start = this.range().start;
    if (this.kind() === T.IndentTextKeyword) this.i++;
    this.textTail(start, this.currentSets, [], true);
  }

  private textTail(
    start: number,
    sets: readonly string[] | undefined,
    members: VennName[],
    indented: boolean
  ): void {
    const number = this.kind() === T.Numeric;
    if (!number && !this.is(ID_KINDS)) this.fail(TEXT_ID, indented ? undefined : TEXT_HINT);
    const name = this.name(this.i++);
    let label: string | undefined;
    let end = name.range.end;
    if (number) this.lastNumberId = true;
    else {
      const read = this.label();
      label = read.label;
      end = read.end ?? end;
    }
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
    if (sets === undefined) return;
    // The sets of an indented text are its `set` or `union`'s (shared, not copied: a wide
    // union with many text lines stays linear).
    const value: VennTextNode = {
      ast: node.id,
      sets,
      id: name.name,
      ...(label !== undefined ? { label } : {}),
    };
    this.textNodes.push({ value, range, shown: `the text node ${this.shown(name.range)}` });
  }

  /** `STYLE ids field ( "," field )*` */
  private styleStatement(): void {
    this.lastStatement = T.Style;
    const start = this.range(this.i++).start;
    const targets = this.ids(STYLE_TARGET);
    const fields = [this.field()];
    while (this.kind() === T.Comma) {
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
    this.styles.push({ value, range, shown: 'the style' });
  }

  /** `field = IDENTIFIER ":" ( STRING | value+ )`; values joined with a blank, as in v12. */
  private field(): VennStyleField {
    if (this.kind() !== T.Identifier) this.fail(STYLE_KEY, STYLE_HINT);
    const keyRange = this.range();
    const key = this.raw(this.i++);
    if (this.kind() !== T.Colon) this.fail(COLON, STYLE_HINT);
    this.i++;
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
    }
    return { key, keyRange, value: normalizeText(parts.join(' ')), valueRange: { start, end } };
  }

  // ---- model and symbols --------------------------------------------------------------

  /** v12's `addSubsetData`: sorted ids, the size or `10 / n²`, the last sets for `text`. */
  private addSubset(
    ast: string,
    sets: string[],
    written: number,
    label: string | undefined,
    size: number | undefined,
    range: Range
  ): void {
    this.currentSets = sets;
    const value: VennSubset = {
      ast,
      sets,
      size: size ?? 10 / Math.pow(written, 2),
      ...(label !== undefined ? { label } : {}),
    };
    this.subsets.push({ value, range, shown: this.shown(range) });
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

  // ---- warnings (D417) ----------------------------------------------------------------

  private warn(): void {
    this.warnDuplicates();
    this.warnSizes();
    this.warnUnknownTargets();
    const d = this.st.diagnostics;
    if (this.subsets.length === 0 && !d.hasErrors) {
      d.warning(
        VENN_EMPTY,
        'The diagram has no sets, so only its title is drawn. Add a set with `set A`.',
        this.headerRange ?? { start: this.pre.bodyStart, end: this.pre.bodyStart }
      );
    }
  }

  private at(p: Placed<unknown>): string {
    return `${p.shown} at line ${this.lineOf(p.range.start)}`;
  }

  /** One warning naming every `set` or `union` that repeats an earlier one. */
  private warnDuplicates(): void {
    const seen = new Set<string>();
    const repeats = this.subsets.filter((p) => {
      const key = keyOf(p.value.sets);
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
    const first = repeats[0];
    if (!first) return;
    const verb = repeats.length === 1 ? 'repeats an earlier one' : 'repeat earlier ones';
    this.st.diagnostics.warning(
      VENN_DUPLICATE,
      `A set or overlap is declared more than once: ${listOf(repeats.map((p) => this.at(p)))} ${verb}. Each copy is drawn, and the last size counts; declare each once.`,
      first.range
    );
  }

  /** One warning naming every negative size. */
  private warnSizes(): void {
    const bad = this.subsets.filter((p) => p.value.size < 0);
    const first = bad[0];
    if (!first) return;
    this.st.diagnostics.warning(
      VENN_INVALID_SIZE,
      `A size below 0 is laid out as 0: ${listOf(bad.map((p) => this.at(p)))}. Use a size of 0 or more.`,
      first.range
    );
  }

  /**
   * One warning naming every text node and style whose sets are not drawn: no `set` or `union`
   * has them (nor are they a pair of a three-or-more overlap, which v12 adds), and a one-id style
   * names no text node either.
   */
  private warnUnknownTargets(): void {
    // One key per sets array: indented texts share their union's.
    const keys = new Map<readonly string[], string>();
    const key = (ids: readonly string[]): string => {
      let k = keys.get(ids);
      if (k === undefined) keys.set(ids, (k = keyOf(ids)));
      return k;
    };
    const declared = new Set<string>();
    /** For each id, the three-or-more overlaps it is in (indexes), for the pairs v12 adds. */
    const wide = new Map<string, Set<number>>();
    this.subsets.forEach(({ value }, n) => {
      declared.add(key(value.sets));
      if (value.sets.length < 3) return;
      for (const id of value.sets) {
        let of = wide.get(id);
        if (!of) wide.set(id, (of = new Set()));
        of.add(n);
      }
    });
    const drawn = (ids: readonly string[]): boolean => {
      if (declared.has(key(ids))) return true;
      if (ids.length !== 2) return false;
      const a = wide.get(ids[0] ?? '');
      const b = wide.get(ids[1] ?? '');
      if (!a || !b) return false;
      const [few, many] = a.size < b.size ? [a, b] : [b, a];
      for (const n of few) if (many.has(n)) return true;
      return false;
    };
    const textIds = new Set(this.textNodes.map((t) => t.value.id));
    const named: Placed<unknown>[] = this.textNodes.filter((t) => !drawn(t.value.sets));
    for (const s of this.styles) {
      const { targets } = s.value;
      const one = targets.length === 1 ? targets[0] : undefined;
      if (!drawn(targets) && !(one !== undefined && textIds.has(one))) named.push(s);
    }
    named.sort((a, b) => a.range.start - b.range.start);
    const first = named[0];
    if (!first) return;
    const verb = named.length === 1 ? 'names' : 'name';
    this.st.diagnostics.warning(
      VENN_UNKNOWN_TARGET,
      `Not drawn: ${listOf(named.map((p) => this.at(p)))} ${verb} no declared set, overlap or text node. Declare it with \`set\` or \`union\`.`,
      first.range
    );
  }
}

/** U+007F: ids are ASCII. */
const LAST_ASCII = 0x7f;

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
