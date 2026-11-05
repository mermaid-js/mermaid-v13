// cspell:words accdescr
/**
 * Pie parser: recursive descent over the significant {@link lex} tokens (gated against v12's
 * Langium lexer, #304), producing a {@link PieModel}, the typed AST, symbols, statement spans
 * and diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `pie.langium` (with `common.langium`), ported rule for rule;
 * `grammar/pie.ebnf` is the normative form:
 *
 *     Pie: NEWLINE* "pie" "showData"? (TitleAndAccessibilities | PieSection | NEWLINE)*
 *     PieSection: STRING ":" NUMBER_PIE EOL
 *     TitleAndAccessibilities: ((ACC_DESCR | ACC_TITLE | TITLE) EOL)+
 *     EOL: NEWLINE+ | EOF
 *
 * so it accepts and rejects what v12's parser does. Unlike v12 it does not stop at the first
 * error: it reports it, skips to the next line break and carries on (R-PARSE-4). A negative
 * value is a semantic error with v12's message, and the statement goes on.
 */
import {
  APOSTROPHE,
  cook,
  DQUOTE,
  ExpectedTable,
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  Probe,
  significantTokens,
  skipTo,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type {
  AstId,
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  TokenStream,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { PieModel, PieSection } from '../model.ts';
import type { PieDocument, PieSliceNode, PieStatementNode, PieTextNode } from './ast.ts';
import { accDescrValue, accTitleValue, labelValue, titleValue } from './convert.ts';
import { lex } from './lexer.ts';
import { PIE_TRIVIA, T } from './tokens.ts';

export interface PieParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type PieParseResult = ParseResult<PieModel, PieDocument>;

const TEXT = [T.Title, T.AccTitle, T.AccDescr];
const STATEMENT = [T.String, ...TEXT];
const DOC = [...STATEMENT, Kind.Newline, Kind.EOF];
const AFTER_PIE = [T.ShowData, ...DOC];
const LINE_END = [Kind.Newline, Kind.EOF];
const HEAD = [T.Pie, Kind.Newline];

/** Where recovery resumes (R-PARSE-4). */
const BOUNDARY = kindSet(Kind.Newline, Kind.EOF);
/**
 * Kinds a probe's cursor follows rather than extends: `:`, and a label, which its closing quote
 * ends (right after `"Dogs"` the parser expects `:`).
 */
const PROBE_FOLLOWS = kindSet(T.Colon, T.String);

/** The keyword of each statement-value token, also its probe mode ({@link probeMode}). */
const VALUE_WORDS: Readonly<Record<number, string>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

/**
 * The probe's mode at `o` (R-LANG-7). The lexer has no modes (Langium's has none), so the
 * mode names what the offset is in: `title`, `accTitle` or `accDescr` past the keyword of
 * that statement, `string` inside a label (closed or not), else `INITIAL` (code).
 */
function probeMode(src: string, tokens: TokenStream, o: number): string {
  for (let j = 0; j < tokens.length; j++) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (start >= o) break;
    if (end < o) continue;
    const kind = tokens.kind[j] ?? Kind.EOF;
    const c = src.charCodeAt(start);
    if (kind === T.String && o < end) return 'string';
    // An unclosed label is an error token from its quote to the line end.
    if (kind === Kind.Error && (c === DQUOTE || c === APOSTROPHE)) return 'string';
    const word = VALUE_WORDS[kind];
    if (!word) continue;
    let k = start;
    while (/[\t ]/.test(src.charAt(k))) k++;
    k += word.length;
    // A block `accDescr { … }` ends at its `}`; the other values run to the line end.
    const block = kind === T.AccDescr && /^\s*\{/.test(src.slice(k, end));
    if (o > k && (o < end || !block)) return word;
  }
  return 'INITIAL';
}

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`pie`', [T.Pie]],
  ['`showData`', [T.ShowData]],
  ['a section such as `"Dogs" : 42`', [T.String]],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['`:` and a value', [T.Colon]],
  ['a value such as `42` or `3.5`', [T.Number]],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
]);

const KIND_OF: Record<number, PieTextNode['type']> = {
  [T.Title]: 'Title',
  [T.AccTitle]: 'AccTitle',
  [T.AccDescr]: 'AccDescr',
};
const ID_OF: Record<PieTextNode['type'], string> = {
  Title: 'title',
  AccTitle: 'accTitle',
  AccDescr: 'accDescr',
};
const ONE_PER_LINE = 'put each section and statement on a line of its own';

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/**
 * `%`, `>`, `@` and `#` percent-encoded, as in every AST id (DESIGN §4.2), and so are the
 * characters XML 1.0 cannot hold (C0 controls but tab, LF and CR; DEL; lone surrogates; U+FFFE,
 * U+FFFF), which a label can carry through `\0`, `\b`, `\f`, `\v` or the source: the SVG
 * writer drops them, so `data-ast` would not be the id (#306). Two hex digits up to U+007F,
 * four above, so the encoding stays one-to-one.
 */
const ESCAPED = '%>@#\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udfff\\ufffe\\uffff';
const RE_NEEDS_ESC = new RegExp(`[${ESCAPED}]`, 'u');
const RE_ESC = new RegExp(`[${ESCAPED}]`, 'gu');
/** Code units below this take two hex digits (`%00`…`%7F`), the rest four (`%D800`, `%FFFF`). */
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

/** Parse a pie chart. Never throws: problems are error diagnostics. */
export function parsePie(src: string, options: PieParseOptions = {}): PieParseResult {
  return new PieParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class PieParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly full: TokenStream;
  private readonly t: TokenView;
  private i = 0;
  private readonly st = new ParseState();
  private readonly probe: Probe | undefined;
  private readonly children: PieStatementNode[] = [];
  private lines: LineIndex | undefined;
  /** Mentions per id base (`slice:Dogs`, `title`, …), for the `@n` suffixes. */
  private readonly mentions = new Map<string, number>();
  /** The model's sections by label: the first non-negative occurrence (D226). */
  private readonly byLabel = new Map<string, PieSection>();
  private readonly sections: PieSection[] = [];
  private showData = false;
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private title = '';
  private accTitle = '';
  private accDescr = '';

  constructor(
    private readonly src: string,
    private readonly options: PieParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.full = lex(src, pre.bodyStart, this.view);
    this.t = significantTokens(this.full, PIE_TRIVIA);
    if (options.probe !== undefined) {
      const probe = (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.full);
      // Ignored when the offset is outside code.
      probe.lexed(probe.offset, probe.offset, probeMode(src, this.full, probe.offset));
    }
  }

  parse(): PieParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    // D218: the in-text title if non-empty, else the front-matter one.
    const title = this.title || this.pre.frontMatter?.title;
    const model: PieModel = Object.freeze({
      showData: this.showData,
      sections: Object.freeze(this.sections),
      ...(title ? { title } : {}),
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      warnings: Object.freeze(warnings),
    });
    const ast: PieDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(j = this.i): number {
    return this.t.kind[j] ?? Kind.EOF;
  }

  private range(j = this.i): Range {
    return { start: this.t.start[j] ?? 0, end: this.t.end[j] ?? 0 };
  }

  /** A token's text as v12's lexer read it (removed spans dropped, entities decoded). */
  private raw(j = this.i): string {
    const { start, end } = this.range(j);
    return cook(this.src, start, end, this.view);
  }

  /**
   * Probe hook: the parser tests the current token for `kinds` (a constant list), or would
   * accept them there. Records them when it is the probed token.
   */
  private tested(kinds: readonly number[]): void {
    const p = this.probe;
    if (p?.isAt(this.t, this.i, this.pre.bodyStart)) p.tested(kinds, this.range().start);
  }

  /** Consume a token of `kind` and return its index, or fail. */
  private expect(kind: number, hint?: string): number {
    this.tested([kind]);
    if (this.kind() !== kind) this.fail([kind], hint);
    return this.i++;
  }

  /** `id`, then `id@2`, `id@3`, … */
  private id(base: string): AstId {
    const n = (this.mentions.get(base) ?? 0) + 1;
    this.mentions.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }

  /** Whether {@link id} handed out more than one id for `base`. */
  private repeated(base: string): boolean {
    return (this.mentions.get(base) ?? 0) > 1;
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the current token. */
  private found(): string {
    const k = this.kind();
    if (k === Kind.EOF) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    const text = this.raw().trim();
    const line = text.split('\n', 1)[0] ?? '';
    return line.length > 24 || line !== text ? `\`${line.slice(0, 24)}…\`` : `\`${line}\``;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  private fail(want: readonly number[], hint?: string): never {
    const { st } = this;
    const where = this.range();
    if (this.kind() === Kind.Error) this.badCharacters(where);
    const d = st.diagnostics.unexpected('UNEXPECTED', where, EXPECTED.names(want), this.found());
    const why = hint ?? this.explain();
    if (why) d.message = `${d.message.slice(0, -1)}; ${why}.`;
    throw STOP;
  }

  /** Text no token rule matched: an unclosed string or `accDescr {`, or stray characters. */
  private badCharacters(where: Range): never {
    const { st } = this;
    const text = this.raw();
    const line = this.lineOf(where.start);
    if (text.startsWith('"') || text.startsWith("'")) {
      const q = text[0] ?? '"';
      st.diagnostics.error(
        'UNCLOSED_STRING',
        `Unclosed label: the \`${q}\` at line ${line} has no closing \`${q}\`. Add \`${q}\` after the label.`,
        where,
        { expected: [`\`${q}\``] }
      );
      throw STOP;
    }
    const word = /^[\t ]*(accDescr|accTitle)/.exec(text)?.[1];
    if (word === 'accDescr') {
      st.diagnostics.error(
        'UNCLOSED_ACC_DESCR',
        `Unclosed accessible description: the \`accDescr {\` at line ${line} has no closing \`}\`, and \`accDescr\` without \`{\` takes a \`:\`. Write \`accDescr: …\` or \`accDescr { … }\`.`,
        where
      );
      throw STOP;
    }
    if (word === 'accTitle') {
      st.diagnostics.error(
        'UNEXPECTED_CHARACTER',
        'Expected `:` after `accTitle`; write it as `accTitle: …`.',
        where,
        { expected: ['`:`'] }
      );
      throw STOP;
    }
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    let why = '';
    if (text === ';') why = `; \`;\` does not end a statement in a pie chart: ${ONE_PER_LINE}`;
    else if (/^[0-9]/.test(text)) {
      why = '; a value is a number such as `42` or `3.5`, with digits on both sides of a `.`';
    }
    st.diagnostics.error('UNEXPECTED_CHARACTER', `Unexpected character \`${shown}\`${why}.`, where);
    throw STOP;
  }

  private explain(): string | undefined {
    const k = this.kind();
    if (k === T.Number) return 'a value has no leading zeros, and only one per section';
    if (k === T.ShowData) return '`showData` goes on the `pie` line, right after `pie`';
    if (k === T.Pie) return 'a chart has one `pie`, at its start';
    if (STATEMENT.includes(k)) return ONE_PER_LINE;
    return undefined;
  }

  /** Skip to the next line break after an error (R-PARSE-4). */
  private recover(): void {
    this.probe?.freeze();
    this.i = skipTo(this.t, this.i, BOUNDARY);
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

  /** `NEWLINE* "pie" "showData"?` */
  private header(): void {
    for (;;) {
      this.tested(HEAD);
      if (this.kind() !== Kind.Newline) break;
      this.i++;
    }
    const pie = this.expect(T.Pie);
    const range = this.range(pie);
    this.tested(AFTER_PIE);
    if (this.kind() === T.ShowData) {
      range.end = this.range(this.i++).end;
      this.showData = true;
    }
    this.st.statement('header', range);
    this.children.push({ id: 'pie', type: 'Header', range, showData: this.showData });
  }

  /** `(TitleAndAccessibilities | PieSection | NEWLINE)* EOF` */
  private document(): void {
    for (;;) {
      this.tested(DOC);
      const k = this.kind();
      if (k === Kind.EOF) return;
      if (k === Kind.Newline) {
        this.i++;
        continue;
      }
      this.statement(() => {
        if (k === T.String) this.section();
        else if (TEXT.includes(k)) this.text(k);
        else this.fail(DOC);
      });
    }
  }

  /** `EOL: NEWLINE+ | EOF` (the loop takes the line breaks after the first). */
  private eol(): void {
    this.tested(LINE_END);
    const k = this.kind();
    if (k === Kind.EOF) return;
    if (k !== Kind.Newline) this.fail(LINE_END, STATEMENT.includes(k) ? ONE_PER_LINE : undefined);
    this.i++;
  }

  /** `PieSection: STRING ":" NUMBER_PIE EOL` */
  private section(): void {
    const s = this.i++;
    this.expect(T.Colon, 'write a section as `"label" : value`, e.g. `"Dogs" : 42`');
    const v = this.expect(T.Number);
    const labelRange = this.range(s);
    const valueRange = this.range(v);
    const label = labelValue(this.raw(s));
    const value = Number(this.raw(v));
    const range = { start: labelRange.start, end: valueRange.end };
    const base = `slice:${esc(label)}`;
    const id = this.id(base);
    const node: PieSliceNode = { id, type: 'Slice', range, label, labelRange, value, valueRange };
    this.children.push(node);
    this.st.statement('slice', range);
    // D229: each label is a `slice` symbol; a repeat refers to the first.
    this.st.symbol(label, 'slice', labelRange, this.repeated(base) ? 'ref' : 'def');
    const { diagnostics } = this.st;
    if (value < 0) {
      // v12's message (pieDb `addSection`); the section is left out.
      diagnostics.error(
        'PIE_NEGATIVE_VALUE',
        `"${label}" has invalid value: ${value}. Negative values are not allowed in pie charts. All slice values must be >= 0.`,
        valueRange
      );
    } else if (!Number.isFinite(value)) {
      // D226: v12 accepted it and drew NaN; the section is left out, with a warning.
      diagnostics.warning(
        'PIE_VALUE_TOO_LARGE',
        `"${label}" has a value too large to draw: the section is left out. Slice values must be below 1.8e308.`,
        valueRange
      );
    } else {
      const first = this.byLabel.get(label);
      if (first) {
        diagnostics.warning(
          'PIE_DUPLICATE_SLICE',
          `Section "${label}" is repeated: the value ${value} is ignored and the first value, ${first.value}, is kept. Give each section its own label.`,
          range
        );
      } else {
        const section: PieSection = Object.freeze({ label, value, astId: id });
        this.byLabel.set(label, section);
        this.sections.push(section);
      }
    }
    this.eol();
  }

  /** `(ACC_DESCR | ACC_TITLE | TITLE) EOL` */
  private text(k: number): void {
    const j = this.i++;
    const image = this.raw(j);
    const type = KIND_OF[k] ?? 'Title';
    const range = this.range(j);
    while (range.start < range.end && /[\t ]/.test(this.src[range.start] ?? '')) range.start++;
    let text: string;
    if (type === 'Title') text = this.title = titleValue(image);
    else if (type === 'AccTitle') text = this.accTitle = accTitleValue(image);
    else text = this.accDescr = accDescrValue(image);
    const kind = ID_OF[type];
    this.children.push({ id: this.id(kind), type, range, text });
    this.st.statement(kind, range);
    this.eol();
  }
}
