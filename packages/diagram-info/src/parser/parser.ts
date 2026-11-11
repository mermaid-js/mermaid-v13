// cspell:words accdescr
/**
 * Info parser: recursive descent over the significant {@link lex} tokens (gated against v12's
 * Langium lexer), producing an {@link InfoModel}, the typed AST, statement spans and
 * diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `info.langium` (with `common.langium`), ported rule for rule;
 * `grammar/info.ebnf` is the normative form:
 *
 *     Info: NEWLINE* "info" NEWLINE* ("showInfo" NEWLINE*)? TitleAndAccessibilities?
 *     TitleAndAccessibilities: ((ACC_DESCR | ACC_TITLE | TITLE) EOL)+
 *     EOL: NEWLINE+ | EOF
 *
 * so it accepts and rejects what v12's parser does. Unlike v12 it does not stop at the first
 * error: it reports it, skips to the next line break and carries on (R-PARSE-4).
 */
import { ExpectedTable, Kind, STOP } from '@mermaid-js/core/parser-kit';
import {
  RuleParser,
  textProbeMode,
  textStatements,
  textValue,
  TITLE_STATEMENT,
  unreadAccessibility,
  withoutIndent,
} from '@mermaid-js/shared/parser/rule';
import type { ParseOptions, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import type { RuleGrammar, TextValues } from '@mermaid-js/shared/parser/rule';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { InfoModel } from '../model.ts';
import type { InfoDocument, InfoHeaderNode, InfoStatementNode } from './ast.ts';
import { lex } from './lexer.ts';
import { INFO_TRIVIA, T } from './tokens.ts';

export interface InfoParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type InfoParseResult = ParseResult<InfoModel, InfoDocument>;

const TEXT = [T.Title, T.AccTitle, T.AccDescr];
const DOC = [...TEXT, Kind.Newline, Kind.EOF];
const AFTER_INFO = [T.ShowInfo, ...DOC];
const LINE_END = [Kind.Newline, Kind.EOF];
const HEAD = [T.Info, Kind.Newline];

/** `title`, `accTitle` and `accDescr` by token kind. */
const TEXTS = /* @__PURE__ */ textStatements(T.Title, T.AccTitle, T.AccDescr);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`info`', [T.Info]],
  ['`showInfo`', [T.ShowInfo]],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
]);

const ONE_PER_LINE = 'put each statement on a line of its own';
const ONLY =
  'an info diagram holds `info`, an optional `showInfo`, and `title`, `accTitle:` or `accDescr` statements';

/** Parse an info diagram. Never throws: problems are error diagnostics. */
export function parseInfo(src: string, options: InfoParseOptions = {}): InfoParseResult {
  return new InfoParser(src, options).parse();
}

const GRAMMAR: RuleGrammar = {
  lex,
  trivia: INFO_TRIVIA,
  probeMode: /* @__PURE__ */ textProbeMode({ texts: TEXTS, accDescr: T.AccDescr }),
};

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class InfoParser extends RuleParser<PreprocessResult> {
  private readonly children: InfoStatementNode[] = [];
  private showInfo = false;
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private readonly texts: TextValues = { title: '', accTitle: '', accDescr: '' };

  constructor(
    src: string,
    private readonly options: InfoParseOptions
  ) {
    const given = options.preprocessed;
    super(src, given ?? preprocess(src), !given, GRAMMAR, options.probe);
  }

  parse(): InfoParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    // D218: the in-text title if non-empty, else the front-matter one (drawn nowhere).
    const title = this.texts.title || this.pre.frontMatter?.title;
    const model: InfoModel = Object.freeze({
      showInfo: this.showInfo,
      ...(title ? { title } : {}),
      accTitle: this.texts.accTitle,
      accDescr: this.texts.accDescr,
      warnings: Object.freeze(warnings),
    });
    const ast: InfoDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.options, this.probe);
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

  /** Text no token rule matched: an unclosed `accDescr {`, `accTitle` without `:`, or a word. */
  private badCharacters(where: Range): never {
    const { st } = this;
    const text = this.raw();
    const line = this.lineOf(where.start);
    if (unreadAccessibility(st.diagnostics, text, line, where)) throw STOP;
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    st.diagnostics.error('UNEXPECTED_CHARACTER', `Unexpected text \`${shown}\`; ${ONLY}.`, where);
    throw STOP;
  }

  private explain(): string | undefined {
    const k = this.kind();
    if (k === T.ShowInfo)
      return '`showInfo` goes once, after `info` and before any other statement';
    if (k === T.Info) return 'a diagram has one `info`, at its start';
    if (TEXT.includes(k)) return ONE_PER_LINE;
    return undefined;
  }

  // ---- rules --------------------------------------------------------------------------

  /** `NEWLINE* "info" NEWLINE* ("showInfo")?` (the `NEWLINE*` after it is the document's). */
  private header(): void {
    for (;;) {
      this.tested(HEAD);
      if (this.kind() !== Kind.Newline) break;
      this.i++;
    }
    const range = this.range(this.expect(T.Info));
    const node: InfoHeaderNode = { id: 'info', type: 'Header', range, showInfo: false };
    this.children.push(node);
    for (;;) {
      this.tested(AFTER_INFO);
      if (this.kind() !== Kind.Newline) break;
      this.i++;
    }
    if (this.kind() === T.ShowInfo) {
      range.end = this.range(this.i++).end;
      this.showInfo = node.showInfo = true;
    }
    this.st.statement('header', range);
  }

  /** `TitleAndAccessibilities? EOF`, with the line breaks between. */
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
        if (TEXT.includes(k)) this.text(k);
        else this.fail(DOC);
      });
    }
  }

  /** `EOL: NEWLINE+ | EOF` (the loop takes the line breaks after the first). */
  private eol(): void {
    this.tested(LINE_END);
    const k = this.kind();
    if (k === Kind.EOF) return;
    if (k !== Kind.Newline) this.fail(LINE_END, TEXT.includes(k) ? ONE_PER_LINE : undefined);
    this.i++;
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
