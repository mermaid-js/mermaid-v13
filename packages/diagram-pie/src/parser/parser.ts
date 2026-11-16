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
import { checkLimit } from '@mermaid-js/core/limits';
import { ExpectedTable, Kind, kindSet } from '@mermaid-js/core/parser-kit';
import { ID_CONTROL, ID_RESERVED, idEscaper, STOP } from '@mermaid-js/shared/parser/support';
import {
  RuleParser,
  textProbeMode,
  textStatements,
  textValue,
  TITLE_STATEMENT,
  unclosedLabel,
  unreadAccessibility,
  withoutIndent,
} from '@mermaid-js/shared/parser/rule';
import type { ParseOptions, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import type { RuleGrammar, TextValues } from '@mermaid-js/shared/parser/rule';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { PieModel, PieSection } from '../model.ts';
import type { PieDocument, PieSliceNode, PieStatementNode } from './ast.ts';
import { labelValue } from './convert.ts';
import { lex } from './lexer.ts';
import { PIE_TRIVIA, T } from './tokens.ts';

export interface PieParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** The integrator's cap on sections (core `DEFAULT_LIMITS.maxNodes` when absent, R-SEC-5). */
  maxNodes?: number;
}

export type PieParseResult = ParseResult<PieModel, PieDocument>;

const TEXT = [T.Title, T.AccTitle, T.AccDescr];
const STATEMENT = [T.String, ...TEXT];
const DOC = [...STATEMENT, Kind.Newline, Kind.EOF];
const AFTER_PIE = [T.ShowData, ...DOC];
const LINE_END = [Kind.Newline, Kind.EOF];
const HEAD = [T.Pie, Kind.Newline];

/**
 * Kinds a probe's cursor follows rather than extends: `:`, and a label, which its closing quote
 * ends (right after `"Dogs"` the parser expects `:`).
 */
const PROBE_FOLLOWS = kindSet(T.Colon, T.String);

/** `title`, `accTitle` and `accDescr` by token kind. */
const TEXTS = /* @__PURE__ */ textStatements(T.Title, T.AccTitle, T.AccDescr);

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

const ONE_PER_LINE = 'put each section and statement on a line of its own';

/**
 * `%`, `>`, `@` and `#` percent-encoded, as in every AST id (DESIGN §4.2), and so are the
 * characters XML 1.0 cannot hold (C0 controls but tab, LF and CR; DEL; lone surrogates; U+FFFE,
 * U+FFFF), which a label can carry through `\0`, `\b`, `\f`, `\v` or the source: the SVG
 * writer drops them, so `data-ast` would not be the id (#306). Two hex digits up to U+007F,
 * four above, so the encoding stays one-to-one.
 */
const esc = /* @__PURE__ */ idEscaper(`${ID_RESERVED}${ID_CONTROL}`);

/** Parse a pie chart. Never throws: problems are error diagnostics. */
export function parsePie(src: string, options: PieParseOptions = {}): PieParseResult {
  return new PieParser(src, options).parse();
}

const GRAMMAR: RuleGrammar = {
  lex,
  trivia: PIE_TRIVIA,
  probeFollows: PROBE_FOLLOWS,
  probeMode: /* @__PURE__ */ textProbeMode({
    texts: TEXTS,
    accDescr: T.AccDescr,
    string: T.String,
  }),
};

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class PieParser extends RuleParser<PreprocessResult> {
  private readonly children: PieStatementNode[] = [];
  /** The model's sections by label: the first non-negative occurrence (D226). */
  private readonly byLabel = new Map<string, PieSection>();
  private readonly sections: PieSection[] = [];
  private showData = false;
  /** The sections read so far, repeats included (the node cap counts them). */
  private slices = 0;
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private readonly texts: TextValues = { title: '', accTitle: '', accDescr: '' };

  constructor(
    src: string,
    private readonly options: PieParseOptions
  ) {
    const given = options.preprocessed;
    super(src, given ?? preprocess(src), !given, GRAMMAR, options.probe);
  }

  parse(): PieParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    // D218: the in-text title if non-empty, else the front-matter one.
    const title = this.texts.title || this.pre.frontMatter?.title;
    const model: PieModel = Object.freeze({
      showData: this.showData,
      sections: Object.freeze(this.sections),
      ...(title ? { title } : {}),
      accTitle: this.texts.accTitle,
      accDescr: this.texts.accDescr,
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

  /** Whether {@link id} handed out more than one id for `base`. */
  private repeated(base: string): boolean {
    return (this.mentions.get(base) ?? 0) > 1;
  }

  // ---- errors and recovery ------------------------------------------------------------

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected fail(want: readonly number[], hint?: string): never {
    const { st } = this;
    const where = this.range();
    if (this.kind() === Kind.Error) this.badCharacters(where);
    st.diagnostics.unexpected(
      'UNEXPECTED',
      where,
      EXPECTED.names(want),
      this.found(),
      undefined,
      hint ?? this.explain()
    );
    throw STOP;
  }

  /** Text no token rule matched: an unclosed string or `accDescr {`, or stray characters. */
  private badCharacters(where: Range): never {
    const { st } = this;
    const text = this.raw();
    const line = this.lineOf(where.start);
    if (unclosedLabel(st.diagnostics, text, line, where)) throw STOP;
    if (unreadAccessibility(st.diagnostics, text, line, where)) throw STOP;
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
    checkLimit(
      this.st.diagnostics,
      'maxNodes',
      ++this.slices,
      this.options.maxNodes,
      'sections',
      range
    );
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
    const { type, word } = TEXTS[k] ?? TITLE_STATEMENT;
    const range = withoutIndent(this.src, this.range(j));
    const text = (this.texts[word] = textValue(type, this.raw(j)));
    this.children.push({ id: this.id(word), type, range, text });
    this.st.statement(word, range);
    this.eol();
  }
}
