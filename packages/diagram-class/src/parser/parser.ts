/**
 * Class-diagram parser: recursive descent over the {@link lex} tokens, producing a
 * {@link ClassModel}, the typed AST, symbols, statement spans and diagnostics (DESIGN §4.3).
 *
 * The rules are v12's `classDiagram.jison` grammar (LALR(1), conflict-free), ported one to
 * one: each method names the jison rule it reads, and the builder gets the calls v12's rule
 * actions made, in the same order. Unlike jison it does not stop at the first error: it
 * reports it, skips to the next statement boundary and carries on (R-PARSE-4). A string or
 * other lexer mode that runs to the end of the text is reported at its opener, and lexing
 * restarts on the line after it.
 */
import {
  ExpectedTable,
  inKindSet,
  isLineEnd,
  isSpace,
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  Probe,
  significantTokens,
  skipTo,
  TRIVIA,
} from '@mermaid-js/core/parser-kit';
import type {
  AstCallback,
  AstId,
  KindSet,
  ParseOptions,
  ParseResult,
  Range,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type {
  ClassAnnotationStmt,
  ClassDocument,
  ClassMemberNode,
  ClassNamespaceStmt,
  ClassNoteStmt,
  ClassRefNode,
  ClassRelationStmt,
  ClassSimpleKind,
  ClassSimpleStmt,
  ClassStatementNode,
  ClassStmt,
  ClassTextNode,
} from './ast.ts';
import { lex } from './lexer.ts';
import type { ClassLex } from './lexer.ts';
import { S } from './rules.ts';
import { ClassBuilder, splitClassName } from './model.ts';
import type { ClassModel, RelationType } from './model.ts';
import { v12Text } from './source.ts';
import type { V12Text } from './source.ts';
import { T } from './tokens.ts';
import { tokenValue } from './tokens-api.ts';

export interface ClassParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** Relationship cap (core `DEFAULT_LIMITS.maxEdges`). */
  maxEdges?: number;
  /** Class cap (core `DEFAULT_LIMITS.maxNodes`). */
  maxNodes?: number;
  /** Namespace nesting cap (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
  /** Features claimed by extension plugins; `callbacks` silences `CALLBACK_IGNORED`. */
  claims?: readonly string[];
}

export type ClassParseResult = ParseResult<ClassModel, ClassDocument>;

/** jison `alphaNumToken`. */
const ALPHANUM = kindSet(T.UnicodeText, T.Num, T.Alpha, T.Minus);
/** What a `className` / `namespaceName` starts with. */
const NAME_START = [T.Alpha, T.Num, T.Minus, T.UnicodeText, T.BquoteStr];
const NAME_PART = kindSet(...NAME_START);
const NAME_NEXT = [T.Dot, T.GenericType, ...NAME_START];
const NS_NEXT = [T.Dot, ...NAME_START];
const GENERIC = [T.GenericType];
const ALPHANUM_KINDS = [T.Alpha, T.Num, T.Minus, T.UnicodeText];
const RELATION_TYPES: Readonly<Record<number, RelationType>> = {
  [T.Aggregation]: 'aggregation',
  [T.Extension]: 'extension',
  [T.Composition]: 'composition',
  [T.Dependency]: 'dependency',
  [T.Lollipop]: 'lollipop',
};
const RELATION_TYPE_KINDS = [T.Aggregation, T.Extension, T.Composition, T.Dependency, T.Lollipop];
const LINE_KINDS = [T.Line, T.DottedLine];
const RELATION_START = [...RELATION_TYPE_KINDS, ...LINE_KINDS];
const RELATION_START_SET = kindSet(...RELATION_START);
const AFTER_NAME = [T.Str, ...RELATION_START, T.Label];
const STR = [T.Str];
const SQE = [T.SQE];
const LABEL = [T.Label];
const AFTER_CLASS = [T.SQS, T.StyleSeparator, T.StructStart, T.AnnotationStart];
const AFTER_LABEL = [T.StyleSeparator, T.StructStart, T.AnnotationStart];
const STRUCT_START = [T.StructStart];
const BODY = [T.Member, T.StructStop];
const ANNOTATION_END = [T.AnnotationEnd];
const AFTER_NS_NAME = [T.SQS, T.StructStart];
const STYLE_PART_KINDS = [T.Alpha, T.Num, T.Colon, T.Space, T.Brkt, T.Style, T.Pct, T.Label];
const STYLE_PART = kindSet(...STYLE_PART_KINDS);
const COMMA = [T.Comma];
const ALPHA = [T.Alpha];
const CLICK_ACTION = [T.CallbackName, T.Href];
const CALLBACK_ARGS = [T.CallbackArgs];
const LINK_TARGET = [T.LinkTarget];
const AFTER_URL = [T.Str, T.LinkTarget];
const CLASS_DIAGRAM = [T.ClassDiagram];
const NEWLINE = [Kind.Newline];
const SEPARATOR = [Kind.Newline, T.Eof];
const NS_SEPARATOR = [Kind.Newline, T.StructStop];
const ACC_TITLE_VALUE = [T.AccTitleValue];
const ACC_DESCR_VALUE = [T.AccDescrValue];

const STATEMENT_KEYWORDS = [
  T.Class,
  T.Namespace,
  T.AnnotationStart,
  T.NoteFor,
  T.Note,
  T.Style,
  T.CssClass,
  T.ClassDef,
  T.Callback,
  T.Link,
  T.Click,
  T.DirectionTB,
  T.DirectionBT,
  T.DirectionRL,
  T.DirectionLR,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrMultilineValue,
];
/** What a statement starts with (jison `statement`). */
const STATEMENT_KINDS = [...NAME_START, ...STATEMENT_KEYWORDS, T.Member];
const DOC_KINDS = [...STATEMENT_KINDS, T.Eof];
/** jison `classStatements`: what a namespace body holds. */
const NS_ITEM_KINDS = [T.Class, T.NoteFor, T.Note, T.Namespace];
const NS_BODY_KINDS = [...NS_ITEM_KINDS, T.StructStop];
const NS_FIRST_KINDS = [...NS_BODY_KINDS, Kind.Newline];

const DIRECTIONS: Readonly<Record<number, string>> = {
  [T.DirectionTB]: 'TB',
  [T.DirectionBT]: 'BT',
  [T.DirectionRL]: 'RL',
  [T.DirectionLR]: 'LR',
};

/** Tokens a lexer mode makes from text that may run to the end: reported at their opener. */
const MODE_KINDS = kindSet(
  T.Str,
  T.GenericType,
  T.CallbackName,
  T.CallbackArgs,
  T.AccDescrMultilineValue
);
const UNCLOSED: Readonly<Record<number, [what: string, closer: string]>> = {
  [T.Str]: ['string', 'quote `"`'],
  [T.GenericType]: ['generic type', '`~`'],
  [T.CallbackName]: ['callback', '`(`'],
  [T.CallbackArgs]: ['callback arguments', '`)`'],
  [T.AccDescrMultilineValue]: ['accessible description', '`}`'],
};

/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset:
 * relationship arrows, separators and brackets. Name kinds are absent, so `Fo` is a word.
 */
const PROBE_FOLLOWS = kindSet(
  ...RELATION_START,
  T.StyleSeparator,
  T.StructStart,
  T.StructStop,
  T.SQS,
  T.SQE,
  T.AnnotationStart,
  T.AnnotationEnd,
  T.Comma,
  T.Dot,
  T.Colon
);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`classDiagram`', [T.ClassDiagram]],
  ['a class name', NAME_START],
  ['a relationship such as `<|--` or `-->`', RELATION_START],
  ['a quoted string', [T.Str]],
  ['a member such as `: +name`', [T.Label]],
  ['`.`', [T.Dot]],
  ['a generic type such as `~T~`', [T.GenericType]],
  ['a label such as `["text"]`', [T.SQS]],
  ['`]`', [T.SQE]],
  ['`:::`', [T.StyleSeparator]],
  ['`{`', [T.StructStart]],
  ['`}`', [T.StructStop]],
  ['a member line', [T.Member]],
  ['an annotation such as `<<interface>>`', [T.AnnotationStart]],
  ['`>>`', [T.AnnotationEnd]],
  ['a callback such as `call fn()`', [T.CallbackName]],
  ['callback arguments', [T.CallbackArgs]],
  ['`href`', [T.Href]],
  ['a link target such as `_blank`', [T.LinkTarget]],
  ['`,`', [T.Comma]],
  ['text', [T.AccTitleValue, T.AccDescrValue]],
  [
    'a statement such as `class`, `namespace`, `note` or a relationship',
    STATEMENT_KEYWORDS,
  ],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF, T.Eof, T.EofInStruct]],
]);
/** The same for styles, whose parts are words, colons and labels. */
const STYLE_EXPECTED = new ExpectedTable([
  ['a style such as `fill:#f9f`', STYLE_PART_KINDS],
  ['`,`', [T.Comma]],
  ['a line break', [Kind.Newline]],
]);

/** How each statement is written, for errors inside it. */
const STATEMENT_HINTS: Readonly<Record<number, string>> = {
  [T.Class]: 'write it as `class Name`, with an optional `["label"]`, `:::style`, `<<annotation>>` or `{ members }`',
  [T.Namespace]: 'write it as `namespace Name {` with classes and notes inside, then `}`',
  [T.NoteFor]: 'write it as `note for Class "text"`',
  [T.Note]: 'write it as `note "text"`',
  [T.AnnotationStart]: 'write it as `<<annotation>> Class`, e.g. `<<interface>> Shape`',
  [T.Style]: 'write it as `style Class styles`, e.g. `style Shape fill:#f9f`',
  [T.CssClass]: 'write it as `cssClass "Class1,Class2" name`',
  [T.ClassDef]: 'write it as `classDef name styles`, e.g. `classDef hot fill:#f96`',
  [T.Callback]: 'write it as `callback Class "function"`',
  [T.Link]: 'write it as `link Class "url"`',
  [T.Click]:
    'write it as `click Class call fn()` or `click Class href "url"`, e.g. `click Shape href "https://example.com"`',
};

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** One open namespace body. */
interface Frame {
  /** Qualified id. */
  id: string;
  /** Whether it makes a namespace (false when the header had no name). */
  real: boolean;
  node: ClassNamespaceStmt;
  opener: Range;
  span: ReturnType<ParseState['beginStatement']>;
  /** Class names (as written) and note ids placed directly in it (jison `classStatements`). */
  classes: string[];
  notes: string[];
  items: number;
  /** A statement was just read: a line break or `}` comes next. */
  needSeparator: boolean;
  /** The line break straight after `{` was read. */
  leadingBreak: boolean;
}

/** A class name as `className` read it. */
interface Name {
  /** As written, generic type in `~…~` (jison's value). */
  raw: string;
  /** Without the generic type. */
  id: string;
  range: Range;
}

/** Parse a class diagram. Never throws: problems are error diagnostics. */
export function parseClass(src: string, options: ClassParseOptions = {}): ClassParseResult {
  return new ClassParser(src, options).parse();
}

/** `: text` → `text` (v12 `cleanupLabel`). */
const cleanupLabel = (label: string): string =>
  (label.startsWith(':') ? label.substring(1) : label).trim();

/**
 * One parse. Each grammar rule is a method; `i` indexes the significant tokens. A rule that
 * fails records a diagnostic and throws {@link STOP}; the statement loop catches it and
 * recovers.
 */
class ClassParser {
  private readonly pre: PreprocessResult;
  private readonly v12: V12Text;
  private readonly st = new ParseState();
  private readonly ids: ParseState['ids'];
  private readonly db: ClassBuilder;
  private readonly probe: Probe | undefined;
  private readonly fullTokens: ClassLex;
  private lexed: ClassLex;
  private tokens: TokenView;
  /** Index into {@link lexed} of each significant token. */
  private at: Int32Array;
  private i = 0;
  /** Source offset {@link tokens} was lexed from (after a restart, mid-document). */
  private viewFrom: number;
  private lines: LineIndex | undefined;
  private hint: string | undefined;
  private restartFrom = -1;
  private lastRestart = -1;
  private restarts = 0;
  private readonly children: ClassStatementNode[] = [];
  private readonly frames: Frame[] = [];
  private needSeparator = false;
  private statementCount = 0;
  private ended = false;
  private readonly maxEdges: number;
  private readonly maxNodes: number;
  private readonly maxDepth: number;

  constructor(
    private readonly src: string,
    private readonly options: ClassParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.ids = this.st.ids;
    const diagnostics = this.st.diagnostics;
    this.db = new ClassBuilder({
      error: (code, message, range) => {
        diagnostics.error(code, message, range);
      },
    });
    this.maxEdges = options.maxEdges ?? DEFAULT_LIMITS.maxEdges;
    this.maxNodes = options.maxNodes ?? DEFAULT_LIMITS.maxNodes;
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    this.v12 = v12Text(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    const probe =
      options.probe === undefined ? undefined : new Probe(src, options.probe, PROBE_FOLLOWS);
    this.probe = probe;
    this.viewFrom = pre.bodyStart;
    this.fullTokens = this.lexed = lex(src, this.v12, undefined, probe);
    this.tokens = significantTokens(this.lexed.tokens);
    this.at = significantIndex(this.lexed);
    if (probe) {
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.lexed.tokens);
    }
  }

  parse(): ClassParseResult {
    const { st, db, options } = this;
    this.header();
    this.document();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    const model = db.model(warnings);
    if (model.callbacks.length > 0 && !options.claims?.includes('callbacks')) {
      const first = model.callbacks[0];
      model.warnings.push(
        st.diagnostics.warning(
          'CALLBACK_IGNORED',
          '`callback` and `click … call` are ignored: install the interactions plugin to run callbacks.',
          first?.range ?? { start: 0, end: 0 }
        )
      );
    }
    const ast: ClassDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: this.src.length },
      children: this.children,
    };
    return st.result(model, ast, this.fullTokens.tokens, options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(j = this.i): number {
    return this.tokens.kind[j] ?? Kind.EOF;
  }

  private start(j: number): number {
    return this.tokens.start[j] ?? this.src.length;
  }

  private end(j: number): number {
    return this.tokens.end[j] ?? this.src.length;
  }

  /** A token's text as v12's parser read it. */
  private val(j = this.i): string {
    const k = this.at[j];
    return k === undefined ? '' : tokenValue(this.lexed, k);
  }

  /** Probe hook: the parser tests the current token for `kinds` (a constant list). */
  private tested(kinds: readonly number[]): void {
    const p = this.probe;
    if (p?.isAt(this.tokens, this.i, this.viewFrom)) p.tested(kinds, this.start(this.i));
  }

  /** Source start of a token, with the text the lexer consumed without a token before it. */
  private tokStart(j: number): number {
    const { src } = this;
    const s = this.start(j);
    switch (this.kind(j)) {
      case T.Str:
        return src[s - 1] === '"' ? s - 1 : s;
      case T.GenericType:
        return src[s - 1] === '~' ? s - 1 : s;
      case T.BquoteStr:
        return src[s - 1] === '`' ? s - 1 : s;
      case T.CallbackArgs:
        return src[s - 1] === '(' ? s - 1 : s;
      case T.CallbackName: {
        let b = s;
        while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
        return src.startsWith('call', b - 4) ? b - 4 : s;
      }
      case T.AccDescrMultilineValue: {
        let b = s;
        while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
        if (src[b - 1] !== '{') return s;
        b--;
        while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
        return src.startsWith('accDescr', b - 8) ? b - 8 : s;
      }
      default:
        return s;
    }
  }

  private tokEnd(j: number): number {
    const { src } = this;
    const e = this.end(j);
    switch (this.kind(j)) {
      case T.Str:
        return src[e] === '"' ? e + 1 : e;
      case T.GenericType:
        return src[e] === '~' ? e + 1 : e;
      case T.BquoteStr:
        return src[e] === '`' ? e + 1 : e;
      case T.CallbackArgs:
        return src[e] === ')' ? e + 1 : e;
      case T.AccDescrMultilineValue:
        return src[e] === '}' ? e + 1 : e;
      default:
        return e;
    }
  }

  private range(a: number, b = a): Range {
    return { start: this.tokStart(a), end: this.tokEnd(b) };
  }

  /** From token `from` to the last one consumed. */
  private span(from: number): Range {
    const start = this.tokStart(from);
    return { start, end: this.i > from ? this.tokEnd(this.i - 1) : start };
  }

  /** The text of a token with its range (quotes included). */
  private textNode(j: number): ClassTextNode {
    return { text: this.val(j), range: this.range(j) };
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the token at `j`. */
  private found(j = this.i): string {
    const k = this.kind(j);
    if (k === Kind.EOF || k === T.Eof || k === T.EofInStruct) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    if (k === Kind.Error) return `the character \`${this.val(j)}\``;
    const r = this.range(j);
    const t = this.src.slice(r.start, r.end).trim();
    return t.length > 24 ? `\`${t.slice(0, 24)}…\`` : `\`${t}\``;
  }

  /** Offset of the line break ending the line that holds `at`. */
  private lineBreakAfter(at: number): number {
    const { src } = this;
    let e = at;
    while (e < src.length && !isLineEnd(src.charCodeAt(e))) e++;
    return e;
  }

  private restartAt(at: number): void {
    if (at > this.lastRestart && at <= this.src.length && this.restarts < 64) {
      this.restartFrom = at;
    }
  }

  /**
   * A token of a lexer mode (a string, a generic type, …) at or just before the error that
   * ran to the end of the text: the cause, reported at its opener.
   */
  private unclosedMode(): boolean {
    const { i, src } = this;
    // The empty value a mode gives at the end of the text may follow (`"abc` → `abc`, ``).
    for (let j = i; j >= 0 && j >= i - 2; j--) {
      if (!inKindSet(MODE_KINDS, this.kind(j))) continue;
      const s = this.start(j);
      const e = this.end(j);
      if (s === e || e < src.length || this.tokEnd(j) !== e) continue;
      const [what, closer] = UNCLOSED[this.kind(j)] ?? ['text', 'closer'];
      const opener = { start: this.tokStart(j), end: s };
      const written = src.slice(opener.start, opener.end).trim();
      this.st.diagnostics.error(
        this.kind(j) === T.Str ? 'UNCLOSED_STRING' : 'UNCLOSED',
        `Unclosed ${what}: the ${written ? `\`${written}\`` : 'text'} at line ${this.lineOf(s)} has no closing ${closer}. Add ${closer} to close it.`,
        opener.end > opener.start ? opener : { start: s, end: Math.min(s + 1, src.length) },
        { related: [{ message: 'The text ends here.', range: { start: src.length, end: src.length } }] }
      );
      this.restartAt(this.lineBreakAfter(s));
      return true;
    }
    return false;
  }

  /** Record what was found where one of `want` was expected. */
  private report(want: readonly number[], hint?: string, table = EXPECTED): void {
    this.tested(want);
    const { st } = this;
    if (this.unclosedMode()) return;
    const k = this.kind();
    const where = this.range(this.i);
    if (k === Kind.Error) {
      const why = hint ?? this.hint;
      st.diagnostics.error(
        'UNEXPECTED_CHARACTER',
        `Unexpected character \`${this.val()}\`${why ? `; ${why}` : ''}.`,
        where,
        { expected: table.names(want) }
      );
      return;
    }
    const d = st.diagnostics.unexpected('UNEXPECTED', where, table.names(want), this.found());
    const why = hint ?? this.hint;
    if (why) d.message = `${d.message.slice(0, -1)}; ${why}.`;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  private fail(want: readonly number[], hint?: string, table = EXPECTED): never {
    this.report(want, hint, table);
    throw STOP;
  }

  /** Skip to the next statement boundary after an error (R-PARSE-4). */
  private recover(): void {
    const { probe } = this;
    const frame = this.frames[this.frames.length - 1];
    if (frame) {
      frame.needSeparator = true;
      frame.items++;
    } else {
      this.needSeparator = true;
      this.statementCount++;
    }
    if (this.restartFrom < 0) {
      probe?.freeze();
      this.i = skipTo(this.tokens, this.i, frame ? NS_BOUNDARY : BOUNDARY);
      return;
    }
    const from = this.restartFrom;
    this.restartFrom = -1;
    this.lastRestart = from;
    this.restarts++;
    const lexedAgain = probe !== undefined && from < probe.offset ? probe : undefined;
    if (lexedAgain) lexedAgain.reset();
    else probe?.freeze(true);
    const stack: number[] = [];
    for (let f = 0; f < this.frames.length; f++) stack.push(S.namespace, S.namespaceBody);
    this.lexed = lex(this.src, this.v12, undefined, lexedAgain, from, stack);
    this.tokens = significantTokens(this.lexed.tokens);
    this.at = significantIndex(this.lexed);
    this.viewFrom = from;
    this.i = 0;
  }

  // ---- token rules --------------------------------------------------------------------

  private expect(k: number, want: readonly number[] = [k]): number {
    this.tested(want);
    if (this.kind() !== k) this.fail(want);
    return this.i++;
  }

  /** jison `className`: names joined by `.` or written together, an optional `~T~` last. */
  private className(): Name {
    const from = this.i;
    let raw = '';
    for (;;) {
      this.tested(NAME_START);
      const k = this.kind();
      if (inKindSet(ALPHANUM, k)) {
        raw += this.val(this.i++);
        this.tested(NAME_NEXT);
        const n = this.kind();
        if (n === T.Dot) {
          raw += '.';
          this.i++;
          continue;
        }
        if (n === T.GenericType) {
          raw += `~${this.val(this.i++)}~`;
          break;
        }
        if (inKindSet(NAME_PART, n)) continue;
        break;
      }
      if (k === T.BquoteStr) {
        raw += this.backtickName();
        this.tested(GENERIC);
        if (this.kind() === T.GenericType) raw += `~${this.val(this.i++)}~`;
        break;
      }
      this.fail(NAME_START);
    }
    return { raw, id: splitClassName(raw).id, range: this.span(from) };
  }

  /** jison `namespaceName`: like {@link className}, without a generic type. */
  private namespaceName(): [string, Range] {
    const from = this.i;
    let raw = '';
    for (;;) {
      this.tested(NAME_START);
      const k = this.kind();
      if (inKindSet(ALPHANUM, k)) {
        raw += this.val(this.i++);
        this.tested(NS_NEXT);
        const n = this.kind();
        if (n === T.Dot) {
          raw += '.';
          this.i++;
          continue;
        }
        if (inKindSet(NAME_PART, n)) continue;
        break;
      }
      if (k === T.BquoteStr) {
        raw += this.backtickName();
        break;
      }
      this.fail(NAME_START);
    }
    return [raw, this.span(from)];
  }

  /**
   * A `` `name` ``. Without its closing backtick it runs to the end of the text, which v12
   * accepted, with the line break it appended: kept so, with a warning.
   */
  private backtickName(): string {
    const j = this.i++;
    const k = this.at[j] ?? 0;
    const { textStart, textEnd, v12 } = this.lexed;
    const e = textEnd[k] ?? 0;
    if (e <= v12.length || this.src[this.end(j)] === '`') return this.val(j);
    const r = this.range(j);
    this.st.diagnostics.warning(
      'UNCLOSED_NAME',
      `Unclosed name: the backtick at line ${this.lineOf(r.start)} has no closing backtick, so the name runs to the end of the text. Add a backtick to close it.`,
      { start: r.start, end: Math.min(r.start + 1, this.src.length) }
    );
    return this.val(j) + v12.text.slice(Math.max(v12.length, textStart[k] ?? 0), e);
  }

  /** jison `alphaNumToken`: one token. */
  private alphaNumToken(): string {
    this.tested(ALPHANUM_KINDS);
    if (!inKindSet(ALPHANUM, this.kind())) this.fail(ALPHANUM_KINDS);
    return this.val(this.i++);
  }

  /** A `"…"` value (one Str token). */
  private str(): ClassTextNode {
    const j = this.expect(T.Str, STR);
    return this.textNode(j);
  }

  /** jison `classLabel`: `["text"]`. */
  private classLabel(): ClassTextNode {
    const from = this.i++;
    const text = this.str().text;
    this.expect(T.SQE, SQE);
    return { text, range: this.span(from) };
  }

  /** A mention of a class name: its AST node and symbol. */
  private ref(name: Name, created: boolean, ast: AstId): ClassRefNode {
    this.st.symbol(name.id, 'class', name.range, created ? 'def' : 'ref');
    return { id: ast, type: 'ClassRef', range: name.range, name: name.raw, classId: name.id };
  }

  /** `addClass` for a mention: whether it made the class. */
  private addClass(name: Name, ast: AstId): boolean {
    const made = this.db.addClass(name.raw, ast);
    if (made) this.checkNodes(name.range);
    return made;
  }

  private checkNodes(r: Range): void {
    if (this.db.classCount === this.maxNodes + 1) {
      this.st.diagnostics.error(
        LIMIT_CODES.maxNodes,
        `The diagram has more than ${this.maxNodes} classes, the limit. The limit is set by the page or app that renders the diagram.`,
        r
      );
    }
  }

  // ---- statements ---------------------------------------------------------------------

  /** A statement led by a class name: a relationship, `A : member`, or a bare name. */
  private nameStatement(out: ClassStatementNode[]): void {
    const { db, ids, st } = this;
    const from = this.i;
    const first = this.className();
    const firstAst = ids.node(first.id);
    this.tested(AFTER_NAME);
    const k = this.kind();
    if (k === T.Str || inKindSet(RELATION_START_SET, k)) {
      const startLabel = k === T.Str ? this.textNode(this.i++) : undefined;
      const arrowFrom = this.i;
      const [startType, line, endType] = this.relation();
      const arrowRange = this.span(arrowFrom);
      this.tested(STR);
      const endLabel = this.kind() === T.Str ? this.textNode(this.i++) : undefined;
      const second = this.className();
      const secondAst = ids.node(second.id);
      this.tested(LABEL);
      const label =
        this.kind() === T.Label
          ? { text: cleanupLabel(this.val(this.i)), range: this.range(this.i++) }
          : undefined;
      const ast = ids.edge(first.id, second.id);
      const had = [db.has(first.id), db.has(second.id)];
      db.addRelation({
        from: first.raw,
        to: second.raw,
        fromAst: firstAst,
        toAst: secondAst,
        ast,
        startType,
        endType,
        line,
        ...(startLabel ? { startLabel: startLabel.text } : {}),
        ...(endLabel ? { endLabel: endLabel.text } : {}),
        ...(label ? { label: label.text } : {}),
      });
      if (!had[0] && db.has(first.id)) this.checkNodes(first.range);
      if (!had[1] && db.has(second.id)) this.checkNodes(second.range);
      if (db.relationCount === this.maxEdges + 1) {
        st.diagnostics.error(
          LIMIT_CODES.maxEdges,
          `The diagram has more than ${this.maxEdges} relationships, the limit. The limit is set by the page or app that renders the diagram.`,
          this.span(from)
        );
      }
      const r = this.span(from);
      const node: ClassRelationStmt = {
        id: ast,
        type: 'Relation',
        range: r,
        children: [
          this.ref(first, !had[0] && db.getClass(first.id)?.ast === firstAst, firstAst),
          this.ref(second, !had[1] && db.getClass(second.id)?.ast === secondAst, secondAst),
        ],
        arrowRange,
      };
      if (startLabel) node.startLabel = startLabel;
      if (endLabel) node.endLabel = endLabel;
      if (label) node.label = label;
      st.statement('relation', r);
      out.push(node);
      return;
    }
    if (k === T.Label) {
      const j = this.i++;
      const text = cleanupLabel(this.val(j));
      const textRange = this.range(j);
      const had = db.has(first.id);
      const member = db.addMember(first.raw, text, textRange, firstAst);
      if (!had) this.checkNodes(first.range);
      const r = this.span(from);
      const owner = this.ref(first, !had, firstAst);
      st.statement('member', r);
      out.push({
        id: ids.statement('st'),
        type: 'MemberStatement',
        range: r,
        children: member
          ? [owner, { id: member.ast, type: 'Member', range: trimmed(this.src, textRange, 1), text }]
          : [owner],
      });
      return;
    }
    // jison `memberStatement: className`: a bare name, which v12 ignores.
    st.statement('classRef', first.range);
    out.push(this.ref(first, false, firstAst));
  }

  /** jison `relation`: `[relationType] lineType [relationType]`. */
  private relation(): [RelationType, 'solid' | 'dotted', RelationType] {
    this.tested(RELATION_START);
    let k = this.kind();
    let startType: RelationType = 'none';
    const first = RELATION_TYPES[k];
    if (first !== undefined) {
      startType = first;
      this.i++;
      this.tested(LINE_KINDS);
      k = this.kind();
    }
    if (k !== T.Line && k !== T.DottedLine) this.fail(startType === 'none' ? RELATION_START : LINE_KINDS);
    this.i++;
    const line = k === T.Line ? 'solid' : 'dotted';
    this.tested(RELATION_TYPE_KINDS);
    const et = RELATION_TYPES[this.kind()];
    if (et !== undefined) this.i++;
    return [startType, line, et ?? 'none'];
  }

  /** jison `classStatement`. Returns the class name as written. */
  private classStatement(out: ClassStatementNode[]): string {
    const { db, ids, st } = this;
    const from = this.i++;
    const name = this.className();
    const ast = ids.node(name.id);
    this.tested(AFTER_CLASS);
    const label = this.kind() === T.SQS ? this.classLabel() : undefined;
    const made = this.addClass(name, ast);
    if (label) db.setClassLabel(name.raw, label.text);
    const node: ClassStmt = {
      id: ast,
      type: 'Class',
      range: name.range,
      name: name.raw,
      classId: name.id,
      nameRange: name.range,
      children: [],
    };
    this.st.symbol(name.id, 'class', name.range, made ? 'def' : 'ref');
    if (label) node.label = label;
    this.tested(label ? AFTER_LABEL : AFTER_CLASS);
    const k = this.kind();
    try {
      if (k === T.StyleSeparator) {
        this.i++;
        const r = this.range(this.i);
        const cls = this.alphaNumToken();
        st.symbol(cls, 'cssClass', r, 'ref');
        node.cssClass = cls;
        db.setCssClass(name.raw, cls);
        this.tested(STRUCT_START);
        if (this.kind() === T.StructStart) this.body(name, node, true);
      } else if (k === T.StructStart) {
        this.body(name, node, false);
      } else if (k === T.AnnotationStart) {
        this.i++;
        const annotation = this.alphaNumToken();
        this.expect(T.AnnotationEnd, ANNOTATION_END);
        node.annotation = annotation;
        db.addAnnotation(name.raw, annotation, this.span(from));
        this.tested(STRUCT_START);
        if (this.kind() === T.StructStart) this.body(name, node, false);
      }
    } finally {
      node.range = this.span(from);
      st.statement('class', node.range);
      out.push(node);
    }
    return name.raw;
  }

  /** `{ MEMBER* }` (`members` must be non-empty after `:::name`). */
  private body(name: Name, node: ClassStmt, needMembers: boolean): void {
    const open = this.i++;
    const lines: number[] = [];
    let errors = 0;
    for (;;) {
      this.tested(BODY);
      const k = this.kind();
      if (k === T.Member) {
        lines.push(this.i++);
        continue;
      }
      if (k === T.StructStop) {
        if (needMembers && lines.length === 0 && errors === 0) {
          this.report(
            [T.Member],
            'a class with `:::style` and a body needs at least one member, or no braces'
          );
          errors++;
        }
        this.i++;
        break;
      }
      if (k === T.EofInStruct || k === Kind.EOF || k === T.Eof) {
        const r = this.range(open);
        this.st.diagnostics.error(
          'UNCLOSED_BODY',
          `Unclosed class body: the \`{\` of class \`${name.id}\` at line ${this.lineOf(r.start)} has no closing \`}\`. Add \`}\` to close it.`,
          r,
          { related: [{ message: 'The text ends here.', range: { start: this.src.length, end: this.src.length } }] }
        );
        this.addMembers(name, node, lines);
        node.bodyRange = { start: r.start, end: this.src.length };
        throw STOP;
      }
      // `{` or `[*]` inside a body: reported once each, then the body goes on.
      this.report(BODY, 'a class body holds one member per line; close it with `}`');
      errors++;
      this.i++;
    }
    this.addMembers(name, node, lines);
    node.bodyRange = this.span(open);
  }

  /** v12 `addMembers`: each member line in order. */
  private addMembers(name: Name, node: ClassStmt, lines: readonly number[]): void {
    for (const j of lines) {
      const text = this.val(j);
      const r = this.range(j);
      const member = this.db.addMember(name.raw, text, trimmed(this.src, r), node.id);
      if (member) {
        node.children.push({
          id: member.ast,
          type: 'Member',
          range: trimmed(this.src, r),
          text: text.trim(),
        });
      }
    }
  }

  /** `<<annotation>> Class`. */
  private annotationStatement(out: ClassStatementNode[]): void {
    const from = this.i++;
    const annotation = this.alphaNumToken();
    this.expect(T.AnnotationEnd, ANNOTATION_END);
    const name = this.className();
    const ast = this.ids.node(name.id);
    this.db.addAnnotation(name.raw, annotation, name.range);
    const r = this.span(from);
    this.st.statement('annotation', r);
    const node: ClassAnnotationStmt = {
      id: this.ids.statement('st'),
      type: 'Annotation',
      range: r,
      annotation,
      children: [this.ref(name, false, ast)],
    };
    out.push(node);
  }

  /** `note for Class "text"` / `note "text"`. Returns the note id. */
  private noteStatement(out: ClassStatementNode[]): string {
    const from = this.i;
    const forClass = this.kind() === T.NoteFor;
    this.i++;
    let ref: ClassRefNode | undefined;
    let raw: string | undefined;
    if (forClass) {
      const name = this.className();
      raw = name.raw;
      ref = this.ref(name, false, this.ids.node(name.id));
    }
    const text = this.str();
    const ast = this.ids.statement('note');
    const noteId = this.db.addNote(text.text, ast, raw);
    const r = this.span(from);
    this.st.statement('note', r);
    const node: ClassNoteStmt = {
      id: ast,
      type: 'Note',
      range: r,
      text,
      noteId,
      children: ref ? [ref] : [],
    };
    out.push(node);
    return noteId;
  }

  /** Comma-separated names in a string (`cssClass "A,B"`): symbols with their ranges. */
  private listRefs(list: string, r: Range, kindName: string, out: string[]): void {
    const exact = this.src.slice(r.start + 1, r.end - 1) === list;
    let at = r.start + 1;
    for (const part of list.split(',')) {
      const pr = exact ? { start: at, end: at + part.length } : r;
      this.st.symbol(splitClassName(part).id, kindName, pr, 'ref');
      out.push(part);
      at += part.length + 1;
    }
  }

  /** jison `stylesOpt`: styles separated by `,` (each the text of its parts, joined). */
  private stylesOpt(): string[] {
    const out: string[] = [];
    for (;;) {
      this.tested(STYLE_PART_KINDS);
      if (!inKindSet(STYLE_PART, this.kind())) this.fail(STYLE_PART_KINDS, undefined, STYLE_EXPECTED);
      let s = this.val(this.i++);
      for (;;) {
        this.tested(STYLE_PART_KINDS);
        if (!inKindSet(STYLE_PART, this.kind())) break;
        s += this.val(this.i++);
      }
      out.push(s);
      this.tested(COMMA);
      if (this.kind() !== T.Comma) return out;
      this.i++;
    }
  }

  /** `callback`, `link` and `click` statements. Returns the callback, for the AST. */
  private clickStatement(refs: string[]): AstCallback | undefined {
    const { db } = this;
    const from = this.i;
    const k = this.kind();
    this.i++;
    const name = this.className();
    this.st.symbol(name.id, 'class', name.range, 'ref');
    refs.push(name.raw);
    if (k === T.Callback) {
      const fn = this.str().text;
      this.tested(STR);
      const tip = this.kind() === T.Str ? this.val(this.i++) : undefined;
      db.setClickEvent(name.raw, fn, this.span(from));
      if (tip !== undefined) db.setTooltip(name.raw, tip);
      return { targets: [name.id], name: fn };
    }
    if (k === T.Link) {
      const url = this.str().text;
      this.link(name, url);
      return undefined;
    }
    this.tested(CLICK_ACTION);
    const a = this.kind();
    if (a === T.CallbackName) {
      const fn = this.val(this.i++);
      this.tested(CALLBACK_ARGS);
      const args = this.kind() === T.CallbackArgs ? this.val(this.i++) : undefined;
      this.tested(STR);
      const tip = this.kind() === T.Str ? this.val(this.i++) : undefined;
      db.setClickEvent(name.raw, fn, this.span(from), args);
      if (tip !== undefined) db.setTooltip(name.raw, tip);
      return args === undefined
        ? { targets: [name.id], name: fn }
        : { targets: [name.id], name: fn, args };
    }
    if (a !== T.Href) this.fail(CLICK_ACTION);
    this.i++;
    const url = this.str().text;
    this.link(name, url);
    return undefined;
  }

  /** After a link's URL: `[ "tooltip" ] [ target ]`. */
  private link(name: Name, url: string): void {
    this.tested(AFTER_URL);
    const tip = this.kind() === T.Str ? this.val(this.i++) : undefined;
    this.tested(LINK_TARGET);
    const target = this.kind() === T.LinkTarget ? this.val(this.i++) : undefined;
    this.db.setLink(name.raw, url, target);
    if (tip !== undefined) this.db.setTooltip(name.raw, tip);
  }

  private simple(kind: ClassSimpleKind, from: number, refs: string[]): ClassSimpleStmt {
    const r = this.span(from);
    this.st.statement(kind.charAt(0).toLowerCase() + kind.slice(1), r);
    return { id: this.ids.statement('st'), type: kind, range: r, refs };
  }

  /** One statement at the top level (jison `statement`). */
  private statement(out: ClassStatementNode[]): void {
    const { db, st } = this;
    this.tested(STATEMENT_KINDS);
    const t = this.kind();
    this.hint = STATEMENT_HINTS[t];
    const from = this.i;
    const refs: string[] = [];
    switch (t) {
      case T.Class:
        this.classStatement(out);
        return;
      case T.Namespace:
        this.namespaceHeader();
        return;
      case T.AnnotationStart:
        this.annotationStatement(out);
        return;
      case T.NoteFor:
      case T.Note:
        this.noteStatement(out);
        return;
      case T.Member:
        // jison `memberStatement: MEMBER`, which v12 ignores.
        this.i++;
        return;
      case T.Callback:
      case T.Link:
      case T.Click: {
        const callback = this.clickStatement(refs);
        const node = this.simple('Click', from, refs);
        if (callback) node.callback = callback;
        out.push(node);
        return;
      }
      case T.Style: {
        this.i++;
        const r = this.range(this.i);
        const id = this.val(this.expect(T.Alpha, ALPHA));
        st.symbol(id, 'class', r, 'ref');
        refs.push(id);
        db.setCssStyle(id, this.stylesOpt());
        out.push(this.simple('Style', from, refs));
        return;
      }
      case T.CssClass: {
        this.i++;
        const j = this.expect(T.Str, STR);
        const list = this.val(j);
        const r = this.range(this.i);
        const cls = this.val(this.expect(T.Alpha, ALPHA));
        this.listRefs(list, this.range(j), 'class', refs);
        st.symbol(cls, 'cssClass', r, 'ref');
        refs.push(cls);
        db.setCssClass(list, cls);
        out.push(this.simple('CssClass', from, refs));
        return;
      }
      case T.ClassDef: {
        this.i++;
        const ids: string[] = [];
        for (;;) {
          const r = this.range(this.i);
          const id = this.val(this.expect(T.Alpha, ALPHA));
          st.symbol(id, 'cssClass', r, 'def');
          ids.push(id);
          this.tested(COMMA);
          if (this.kind() !== T.Comma) break;
          this.i++;
        }
        refs.push(...ids);
        db.defineClass(ids, this.stylesOpt());
        out.push(this.simple('ClassDef', from, refs));
        return;
      }
      case T.DirectionTB:
      case T.DirectionBT:
      case T.DirectionRL:
      case T.DirectionLR:
        this.i++;
        db.setDirection(DIRECTIONS[t] ?? 'TB');
        out.push(this.simple('Direction', from, refs));
        return;
      case T.AccTitle:
        this.i++;
        db.setAccTitle(this.val(this.expect(T.AccTitleValue, ACC_TITLE_VALUE)).trim());
        out.push(this.simple('AccTitle', from, refs));
        return;
      case T.AccDescr:
        this.i++;
        db.setAccDescription(this.val(this.expect(T.AccDescrValue, ACC_DESCR_VALUE)).trim());
        out.push(this.simple('AccDescr', from, refs));
        return;
      case T.AccDescrMultilineValue:
        db.setAccDescription(this.val(this.i++).trim());
        out.push(this.simple('AccDescr', from, refs));
        return;
      default:
        if (inKindSet(NAME_PART, t)) {
          this.nameStatement(out);
          return;
        }
        this.fail(STATEMENT_KINDS);
    }
  }

  // ---- namespaces and the document ----------------------------------------------------

  /** jison `namespaceIdentifier STRUCT_START`: opens a namespace body. */
  private namespaceHeader(): void {
    const from = this.i;
    const opener = this.range(from);
    this.i++;
    let name: string | undefined;
    let nameRange: Range | undefined;
    let label: ClassTextNode | undefined;
    let failed = false;
    try {
      [name, nameRange] = this.namespaceName();
      this.tested(AFTER_NS_NAME);
      if (this.kind() === T.SQS) label = this.classLabel();
      this.tested(STRUCT_START);
      if (this.kind() !== T.StructStart) this.fail(label ? STRUCT_START : AFTER_NS_NAME);
    } catch (e) {
      if (e !== STOP) throw e;
      failed = true;
      // When the line opens a body anyway, the namespace is open, so its `}` closes it (one
      // error, one diagnostic); otherwise recovery skips the line.
      let j = this.i;
      for (; j < this.tokens.length; j++) {
        const k = this.kind(j);
        if (k === T.StructStart || k === Kind.Newline || k === T.Eof || k === Kind.EOF) break;
      }
      if (this.kind(j) !== T.StructStart) throw e;
      this.i = j;
      this.restartFrom = -1;
    }
    let outer: Frame | undefined;
    for (let f = this.frames.length - 1; f >= 0 && !outer; f--) {
      if (this.frames[f]?.real) outer = this.frames[f];
    }
    this.i++;
    if (name === undefined || nameRange === undefined) {
      // No name: the body is read, but makes no namespace.
      const node: ClassNamespaceStmt = {
        id: this.ids.statement('st'),
        type: 'Namespace',
        range: this.span(from),
        name: '',
        children: [],
      };
      this.openFrame(node, opener, from, false);
    } else {
      const qualified = outer ? `${outer.id}.${name}` : name;
      const ast = this.ids.subgraph(qualified);
      const role = this.db.namespaceExists(qualified) ? 'ref' : 'def';
      this.st.symbol(qualified, 'namespace', nameRange, role);
      this.db.addNamespace(name, ast, label?.text);
      const node: ClassNamespaceStmt = {
        id: ast,
        type: 'Namespace',
        range: this.span(from),
        name: qualified,
        children: [],
      };
      if (label) node.label = label;
      this.openFrame(node, opener, from, true);
    }
    // After a header error the body is still read (its diagnostic is recorded).
    void failed;
  }

  private openFrame(node: ClassNamespaceStmt, opener: Range, from: number, real: boolean): void {
    const frame: Frame = {
      id: node.name,
      real,
      node,
      opener,
      span: this.st.beginStatement('namespace', this.tokStart(from)),
      classes: [],
      notes: [],
      items: 0,
      needSeparator: false,
      leadingBreak: false,
    };
    this.frames.push(frame);
    if (this.frames.length === this.maxDepth + 1) {
      this.st.diagnostics.error(
        LIMIT_CODES.maxDepth,
        `Namespaces are nested ${this.frames.length} deep here, over the limit of ${this.maxDepth}. The limit is set by the page or app that renders the diagram.`,
        opener
      );
    }
  }

  /** `}` of the innermost namespace: v12's `addClassesToNamespace` and `popNamespace`. */
  private closeFrame(end: number): void {
    const frame = this.frames.pop();
    if (!frame) return;
    if (frame.real) {
      this.db.addClassesToNamespace(frame.id, frame.classes, frame.notes);
      this.db.popNamespace();
    }
    frame.node.range = { start: frame.node.range.start, end };
    this.st.endStatement(frame.span, end);
    const outer = this.frames[this.frames.length - 1];
    if (outer) {
      outer.node.children.push(frame.node);
      outer.items++;
      outer.needSeparator = true;
    } else {
      this.children.push(frame.node);
      this.statementCount++;
      this.needSeparator = true;
    }
  }

  /** One item of the innermost namespace body (jison `classStatements`). */
  private namespaceItem(frame: Frame): void {
    const k = this.kind();
    if (k === T.EofInStruct || k === T.Eof) {
      this.unclosedNamespaces();
      if (k === T.EofInStruct) this.i++;
      return;
    }
    if (frame.needSeparator) {
      this.tested(NS_SEPARATOR);
      if (k === Kind.Newline) {
        this.i++;
        frame.needSeparator = false;
        return;
      }
      if (k !== T.StructStop) this.fail(NS_SEPARATOR);
      frame.needSeparator = false;
    }
    this.tested(frame.items === 0 && !frame.leadingBreak ? NS_FIRST_KINDS : NS_BODY_KINDS);
    if (k === T.StructStop) {
      if (frame.items === 0) {
        this.hint = 'a namespace holds at least one class or note';
        this.fail(NS_ITEM_KINDS);
      }
      this.i++;
      this.closeFrame(this.tokEnd(this.i - 1));
      return;
    }
    if (k === Kind.Newline && frame.items === 0 && !frame.leadingBreak) {
      frame.leadingBreak = true;
      this.i++;
      return;
    }
    this.hint = STATEMENT_HINTS[k] ?? 'only classes, notes and namespaces go inside a namespace';
    const out = frame.node.children as ClassStatementNode[];
    if (k === T.Class) {
      frame.items++;
      frame.needSeparator = true;
      frame.classes.push(this.classStatement(out));
      return;
    }
    if (k === T.Note || k === T.NoteFor) {
      frame.items++;
      frame.needSeparator = true;
      frame.notes.push(this.noteStatement(out));
      return;
    }
    if (k === T.Namespace) {
      this.namespaceHeader();
      return;
    }
    this.fail(frame.items === 0 && !frame.leadingBreak ? NS_FIRST_KINDS : NS_BODY_KINDS);
  }

  /** The text ended inside namespace bodies: one error for the innermost, all closed. */
  private unclosedNamespaces(): void {
    const frame = this.frames[this.frames.length - 1];
    if (frame) {
      this.st.diagnostics.error(
        'UNCLOSED_NAMESPACE',
        `Unclosed namespace: the \`{\` of namespace \`${frame.id}\` at line ${this.lineOf(frame.opener.start)} has no closing \`}\`. Add \`}\` to close it.`,
        frame.opener,
        {
          related: [
            { message: 'The text ends here.', range: { start: this.src.length, end: this.src.length } },
          ],
        }
      );
    }
    while (this.frames.length > 0) this.closeFrame(this.src.length);
  }

  /** One step at the top level: a statement, or the separator after one. */
  private topItem(): void {
    const k = this.kind();
    if (this.needSeparator) {
      this.tested(SEPARATOR);
      if (k === Kind.Newline) {
        this.i++;
        this.needSeparator = false;
        return;
      }
      if (k !== T.Eof) {
        this.hint = inKindSet(NAME_PART, k)
          ? 'put each statement on its own line'
          : undefined;
        this.fail(SEPARATOR);
      }
      this.needSeparator = false;
    }
    this.tested(this.statementCount === 0 ? STATEMENT_KINDS : DOC_KINDS);
    if (k === T.Eof) {
      if (this.statementCount === 0) {
        this.fail(STATEMENT_KINDS, 'a class diagram needs at least one statement, e.g. `class A`');
      }
      this.i++;
      this.ended = true;
      return;
    }
    if (k !== T.Namespace) {
      this.statementCount++;
      this.needSeparator = true;
    }
    this.statement(this.children);
  }

  private document(): void {
    while (true) {
      const k = this.kind();
      if (k === Kind.EOF) break;
      const frame = this.frames[this.frames.length - 1];
      try {
        if (frame) this.namespaceItem(frame);
        else if (this.ended) {
          this.i++;
        } else this.topItem();
      } catch (e) {
        if (e !== STOP) throw e;
        this.recover();
      }
    }
    if (this.frames.length > 0) this.unclosedNamespaces();
    else if (!this.ended) {
      // The text ended in a lexer mode (an unclosed string, …): jison's end token never came.
      try {
        this.fail(this.needSeparator ? SEPARATOR : STATEMENT_KINDS);
      } catch (e) {
        if (e !== STOP) throw e;
      }
    }
  }

  /** `classDiagram` (or `classDiagram-v2`) and a line break. */
  private header(): void {
    const from = this.i;
    try {
      this.tested(CLASS_DIAGRAM);
      if (this.kind() !== T.ClassDiagram) {
        this.fail(CLASS_DIAGRAM, 'a class diagram starts with `classDiagram` on its own line');
      }
      this.i++;
      this.expect(Kind.Newline, NEWLINE);
      const r = this.range(from);
      this.st.statement('header', r);
      this.children.push({ id: this.ids.statement('st'), type: 'Header', range: r, refs: [] });
    } catch (e) {
      if (e !== STOP) throw e;
      this.recover();
    }
  }
}

/** Where recovery resumes at the top level and inside a namespace (R-PARSE-4). */
const BOUNDARY: KindSet = kindSet(Kind.EOF, T.Eof, Kind.Newline);
const NS_BOUNDARY: KindSet = kindSet(Kind.EOF, T.Eof, Kind.Newline, T.StructStop, T.EofInStruct);

/** Index into the lex of each significant token (the tokens {@link significantTokens} keeps). */
function significantIndex(l: ClassLex): Int32Array {
  const { kind, length } = l.tokens;
  const out = new Int32Array(length);
  let o = 0;
  for (let j = 0; j < length; j++) if (TRIVIA[kind[j] ?? Kind.EOF] !== 1) out[o++] = j;
  return out.subarray(0, o);
}

/** `r` without the blanks at its ends; with `skip`, also without its first `skip` characters. */
function trimmed(src: string, r: Range, skip = 0): Range {
  let s = Math.min(r.start + skip, r.end);
  let e = r.end;
  while (s < e && isSpace(src.charCodeAt(s))) s++;
  while (e > s && isSpace(src.charCodeAt(e - 1))) e--;
  return { start: s, end: e };
}
