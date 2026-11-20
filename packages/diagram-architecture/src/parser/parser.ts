// cspell:words ackend
/**
 * Architecture parser: recursive descent over the significant {@link lex} tokens (gated against
 * v12's Langium lexer, #594), producing an {@link ArchitectureModel}, the typed AST, symbols,
 * statement spans and diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `architecture.langium` (with `arch.langium` and `common.langium`), ported
 * rule for rule; `grammar/architecture.ebnf` is the normative form:
 *
 *     Architecture: NEWLINE* "architecture-beta" (NEWLINE | TitleAndAccessibilities | Statement)*
 *     Group:     "group" ID ARCH_ICON? ARCH_TITLE? ("in" ID)? EOL
 *     Service:   "service" ID (STRING | ARCH_ICON)? ARCH_TITLE? ("in" ID)? EOL
 *     Junction:  "junction" ID ("in" ID)? EOL
 *     Edge:      ID ARROW_GROUP? ":" ARROW_DIRECTION ARROW_INTO? ("--" | "-" ARCH_TITLE "-")
 *                ARROW_INTO? ARROW_DIRECTION ":" ID ARROW_GROUP? EOL
 *     Alignment: "align" ("row" | "column") ID ID+ EOL
 *     TitleAndAccessibilities: ((ACC_DESCR | ACC_TITLE | TITLE) EOL)+     EOL: NEWLINE+ | EOF
 *
 * so it accepts and rejects what v12's parser does. The model is then built as v12's DB built
 * it ({@link normalise}); v12's DB throws are semantic errors with its messages (R-PARSE-4).
 * Unlike v12 the parser does not stop at the first error: it reports it, skips to the next line
 * break and carries on. Every statement is one line (a multi-line label or text icon, or a
 * block `accDescr`, is one token), so a line break always ends the statement an error is in.
 */
import {
  APOSTROPHE,
  ASCII_MAX,
  DQUOTE,
  ExpectedTable,
  formatExpected,
  Kind,
  kindSet,
  LBRACKET,
} from '@mermaid-js/core/parser-kit';
import type {
  AstId,
  ParseOptions,
  ParseResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import {
  accessibilityAsName,
  RuleParser,
  TITLE_STATEMENT,
  textValue,
  withoutIndent,
} from '@mermaid-js/shared/parser/rule';
import type { RuleGrammar, TextValues } from '@mermaid-js/shared/parser/rule';
import { STOP } from '@mermaid-js/shared/parser/support';
import type { ArchitectureModel, ArchitectureSide } from '../model.ts';
import type {
  ArchitectureAlignmentNode,
  ArchitectureDocument,
  ArchitectureEdgeEnd,
  ArchitectureEdgeNode,
  ArchitectureGroupNode,
  ArchitectureJunctionNode,
  ArchitectureName,
  ArchitectureServiceNode,
  ArchitectureStatementNode,
  ArchitectureText,
} from './ast.ts';
import { iconValue, labelValue, stringValue } from './convert.ts';
import { lex } from './lexer.ts';
import { checkLimits } from './limits.ts';
import type { ArchitectureLimitOptions } from './limits.ts';
import { normalise } from './normalise.ts';
import type { Registered } from './normalise.ts';
import { ARCHITECTURE_TRIVIA, T, TEXT_STATEMENTS } from './tokens.ts';

export interface ArchitectureParseOptions extends ParseOptions, ArchitectureLimitOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type ArchitectureParseResult = ParseResult<ArchitectureModel, ArchitectureDocument>;

/** A kind no token has: "an edge" in messages, where the parser tests for an `ID`. */
const EDGE = -100;

const TEXT = [T.Title, T.AccTitle, T.AccDescr];
const KEYWORD_STARTS = [T.Service, T.Group, T.Junction, T.Align];
/** What the parser tests at the start of a statement, and how messages name it. */
const DOC = [...KEYWORD_STARTS, T.Id, ...TEXT, Kind.Newline, Kind.EOF];
const DOC_NAMES = [...KEYWORD_STARTS, EDGE, ...TEXT, Kind.Newline, Kind.EOF];
const HEAD = [T.ArchitectureBeta, Kind.Newline];
const LINE_END = [Kind.Newline, Kind.EOF];
const AFTER_GROUP_ID = [T.Icon, T.Label, T.In, ...LINE_END];
const AFTER_SERVICE_ID = [T.String, T.Icon, T.Label, T.In, ...LINE_END];
const AFTER_ICON = [T.Label, T.In, ...LINE_END];
const AFTER_LABEL = [T.In, ...LINE_END];
const AFTER_LHS_ID = [T.ArrowGroup, T.Colon];
const AFTER_LHS_SIDE = [T.ArrowInto, T.DashDash, T.Dash];
const AFTER_ARROW = [T.ArrowInto, T.Direction];
const AFTER_RHS_ID = [T.ArrowGroup, ...LINE_END];
const AFTER_MEMBER = [T.Id, ...LINE_END];
const SIDES: ReadonlySet<string> = new Set(['L', 'R', 'T', 'B']);

/** Word keywords: none of them can be an id (a longer word can). */
const KEYWORD_KINDS = kindSet(
  T.ArchitectureBeta,
  T.Junction,
  T.Service,
  T.Column,
  T.Group,
  T.Align,
  T.Row,
  T.In
);

/**
 * Kinds a probe's cursor follows rather than extends: punctuation, and the tokens their closing
 * character ends (an icon, a label, a text icon).
 */
const PROBE_FOLLOWS = kindSet(
  T.Colon,
  T.ArrowGroup,
  T.ArrowInto,
  T.DashDash,
  T.Dash,
  T.Icon,
  T.Label,
  T.String
);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`architecture-beta`', [T.ArchitectureBeta]],
  ['`service`, `group`, `junction` or `align`', KEYWORD_STARTS],
  ['an edge such as `a:R -- L:b`', [EDGE]],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['an id such as `db`', [T.Id]],
  ['an icon such as `(database)`', [T.Icon]],
  ['a text icon such as `"API"`', [T.String]],
  ['a label such as `[Database]`', [T.Label]],
  ['`in` and a group', [T.In]],
  ['`row` or `column`', [T.Row, T.Column]],
  ['`{group}`', [T.ArrowGroup]],
  ['`:`', [T.Colon]],
  ['a side, `L`, `R`, `T` or `B`', [T.Direction]],
  ['an arrowhead, `<` or `>`', [T.ArrowInto]],
  ['`--` or a label such as `-[label]-`', [T.DashDash]],
  ['`-`', [T.Dash]],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
]);

/**
 * The probe's mode at `o` (R-LANG-7). The lexer has no modes (Langium's has none), so the mode
 * names what the offset is in: `title`, `accTitle` or `accDescr` past the keyword of that
 * statement, `string` inside a text icon or a label (closed or not), else `INITIAL` (code).
 */
function probeMode(src: string, tokens: TokenStream, o: number): string {
  for (let j = 0; j < tokens.length; j++) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (start >= o) break;
    if (end < o) continue;
    const kind = tokens.kind[j] ?? Kind.EOF;
    const c = src.charCodeAt(start);
    if ((kind === T.String || kind === T.Label) && o < end) return 'string';
    // An unclosed text icon or label is an error token from its quote or bracket on.
    if (kind === Kind.Error && (c === DQUOTE || c === APOSTROPHE || c === LBRACKET)) {
      return 'string';
    }
    const word = TEXT_STATEMENTS[kind]?.word;
    if (!word) continue;
    const { from, block } = valueStart(src, start, end, kind, word);
    // A block `accDescr { … }` ends at its `}`; the other values run to the line end.
    if (o >= from && (o < end || !block)) return word;
  }
  return 'INITIAL';
}

/**
 * Where the value of a `title`, `accTitle` or `accDescr` token starts: after `title` and its
 * blank, after the `:`, or after the `{` of a block `accDescr`.
 */
function valueStart(
  src: string,
  start: number,
  end: number,
  kind: number,
  word: string
): { from: number; block: boolean } {
  let k = start;
  while (/[\t ]/.test(src.charAt(k))) k++;
  k += word.length;
  if (kind === T.Title) return { from: k + 1, block: false };
  while (k < end && /\s/.test(src.charAt(k))) k++;
  return { from: k + 1, block: src.charAt(k) === '{' };
}

const GRAMMAR: RuleGrammar = {
  lex,
  trivia: ARCHITECTURE_TRIVIA,
  probeFollows: PROBE_FOLLOWS,
  probeMode,
};

/** One id occurrence, resolved to a symbol once the model knows who registered each id. */
interface Mention {
  name: ArchitectureName;
  /** The AST id of the declaration it is in, or `undefined` for a reference. */
  declaredBy?: AstId;
}

/** Parse an architecture diagram. Never throws: problems are error diagnostics. */
export function parseArchitecture(
  src: string,
  options: ArchitectureParseOptions = {}
): ArchitectureParseResult {
  return new ArchitectureParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails records
 * a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class ArchitectureParser extends RuleParser<PreprocessResult> {
  private readonly children: ArchitectureStatementNode[] = [];
  private readonly groups: ArchitectureGroupNode[] = [];
  private readonly services: ArchitectureServiceNode[] = [];
  private readonly junctions: ArchitectureJunctionNode[] = [];
  private readonly edges: ArchitectureEdgeNode[] = [];
  private readonly alignments: ArchitectureAlignmentNode[] = [];
  private readonly ids: Mention[] = [];
  /** The id the declaration being read declares, once read. */
  private declaring: string | undefined;
  /** The index of the token the current statement starts with. */
  private statementStart = 0;
  /** The kind of the token the current statement starts with. */
  private statementKind: number = Kind.EOF;
  /** Ids declared by a statement with a syntax error. */
  private readonly broken = new Set<string>();
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private readonly texts: TextValues = { title: '', accTitle: '', accDescr: '' };
  private titleAstId: AstId | undefined;

  constructor(
    src: string,
    private readonly opts: ArchitectureParseOptions
  ) {
    const given = opts.preprocessed;
    super(src, given ?? preprocess(src), !given, GRAMMAR, opts.probe);
  }

  parse(): ArchitectureParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    const model = this.model();
    const ast: ArchitectureDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.opts, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** Whether the current token is `kind` (tested with the rest of `want`); consume it if so. */
  private accept(kind: number, want: readonly number[]): number | undefined {
    this.tested(want);
    return this.kind() === kind ? this.i++ : undefined;
  }

  /** Consume a token of `kind` and return its index, or fail with `want` expected. */
  private expectOf(kind: number, want: readonly number[]): number {
    this.tested(want);
    if (this.kind() !== kind) this.fail(want);
    return this.i++;
  }

  // ---- errors and recovery ------------------------------------------------------------

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected override fail(want: readonly number[], hint?: string): never {
    const { st } = this;
    const where = this.range();
    if (this.kind() === Kind.Error) this.badCharacters(where);
    if (this.kind() === T.Id && this.i === this.statementStart) this.accessibilityName(where);
    const names = EXPECTED.names(want === DOC ? DOC_NAMES : want);
    const why = hint ?? this.explain(want);
    const message = `Expected ${formatExpected(names)}, got ${this.found()}${why ? `; ${why}` : ''}.`;
    st.diagnostics.error('UNEXPECTED', message, where, { expected: names });
    throw STOP;
  }

  /** Text no token rule matched: an unclosed text icon or label, or stray characters. */
  private badCharacters(where: Range): never {
    const { st, src } = this;
    const text = this.raw();
    const line = this.lineOf(where.start);
    const c = text[0] ?? '';
    if (c === '"' || c === "'") {
      st.diagnostics.error(
        'UNCLOSED_STRING',
        `Unclosed text icon: the \`${c}\` at line ${line} has no closing \`${c}\`. Add \`${c}\` after the text.`,
        where,
        { expected: [`\`${c}\``] }
      );
      throw STOP;
    }
    if (c === '[') {
      const rest = src.slice(where.start + 1).split(/[\n\r]/, 1)[0] ?? '';
      const close = rest.indexOf(']');
      const open = rest.indexOf('[');
      if (close === 0) {
        st.diagnostics.error(
          'UNEXPECTED_CHARACTER',
          'Unexpected `[]`; a label has text between its brackets, such as `[Database]`.',
          where
        );
        throw STOP;
      }
      if (close < 0) {
        st.diagnostics.error(
          'UNCLOSED_LABEL',
          `Unclosed label: the \`[\` at line ${line} has no closing \`]\` on its line. Add \`]\` after the label.`,
          where,
          { expected: ['`]`'] }
        );
        throw STOP;
      }
      if (open >= 0 && open < close) {
        st.diagnostics.error(
          'UNEXPECTED_CHARACTER',
          'Unexpected `[`; a label cannot hold `[` or `]` unless it is quoted, such as `["a [b] c"]`.',
          where
        );
        throw STOP;
      }
    }
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    let why = '';
    if (c === '(') {
      why =
        '; an icon is a name in parentheses, with no blanks, such as `(database)` or `(logos:aws)`';
    } else if (c === '{') {
      why = '; `{group}` is written as is, in lower case and with no blanks';
    } else if (c === ';') {
      why = '; `;` does not end a statement in an architecture diagram: start a new line';
    } else if (c === ']' || c === ')') {
      why = `; \`${c}\` closes a label or an icon that was not opened`;
    } else if (text.charCodeAt(0) > ASCII_MAX || c === '.') {
      why =
        '; an id is ASCII letters, digits, `_` and `-`: put other text in a label, such as `[Café]`';
    }
    st.diagnostics.error('UNEXPECTED_CHARACTER', `Unexpected character \`${shown}\`${why}.`, where);
    throw STOP;
  }

  /**
   * `accDescr` or `accTitle` read as an id: no `:` after it, or a `{` with no `}` (v12's lexer
   * then has no accessibility token).
   */
  private accessibilityName(where: Range): void {
    const word = this.raw();
    if (word !== 'accDescr' && word !== 'accTitle') return;
    const block = word === 'accDescr' && /^\s*\{/.test(this.src.slice(where.end));
    accessibilityAsName(this.st.diagnostics, word, block, this.lineOf(where.start), where);
    throw STOP;
  }

  /** Why the current token does not fit, when there is something to say. */
  private explain(want: readonly number[]): string | undefined {
    const k = this.kind();
    if (k === T.ArchitectureBeta) return 'a diagram has one `architecture-beta`, at its start';
    if (want === DOC) return k === T.Direction ? this.notAnId() : undefined;
    return (
      (want.includes(T.Id) ? this.notAnId() : undefined) ??
      this.explainEdge(want) ??
      this.explainDeclaration(want)
    );
  }

  /** {@link explain} inside an edge. */
  private explainEdge(want: readonly number[]): string | undefined {
    const k = this.kind();
    const prev = this.kind(this.i - 1);
    if (want.includes(T.Direction) && k === T.Id) return this.notASide(this.raw());
    if (k === T.Id && prev === T.Direction && this.glued(this.i - 1)) {
      return this.notASide(this.raw(this.i - 1) + this.raw());
    }
    if (want === AFTER_LHS_ID) {
      return 'a line that starts with an id is an edge, such as `a:R -- L:b`; other statements start with `service`, `group`, `junction` or `align`';
    }
    const arrow =
      want.includes(T.Dash) ||
      ((want.includes(T.Direction) || want.includes(T.Label)) && prev === T.Dash);
    if (arrow) {
      return 'an edge is `--` with optional arrowheads (`-->`, `<--`, `<-->`), or `-[label]-`';
    }
    if (k === T.Id && want === AFTER_RHS_ID) {
      return 'an edge joins two ids: write each edge on its own line';
    }
    return undefined;
  }

  /** {@link explain} inside a `service`, `junction` or `group` statement. */
  private explainDeclaration(want: readonly number[]): string | undefined {
    const k = this.kind();
    const statement = this.statementKind;
    if (statement === T.Junction && (k === T.Label || k === T.Icon || k === T.String)) {
      return 'a junction has no icon or label: it is drawn as nothing';
    }
    if (statement === T.Group && k === T.String) {
      return "a group's icon is a name in parentheses, such as `(cloud)`";
    }
    if (k === T.Id && this.kind(this.i - 1) === T.Id && this.kind(this.i - 2) === T.In) {
      return 'a service, junction or group is in one group';
    }
    if (k === T.Label && want.includes(T.In)) return 'the label comes before `in`';
    if (k === T.Icon && want.includes(T.Label)) return 'a service has one icon or text icon';
    if ((k === T.Icon || k === T.String) && want.includes(T.In)) {
      return 'the icon comes before the label and `in`';
    }
    if (k === T.Id && want.includes(T.In)) {
      return `to put it in a group, write \`in ${this.raw()}\``;
    }
    return undefined;
  }

  /** Why the current token (where an id is expected) is not one, or `undefined`. */
  private notAnId(): string | undefined {
    const k = this.kind();
    const word = this.raw().trim();
    if (k === T.Direction) {
      const whole =
        this.kind(this.i + 1) === T.Id && this.glued(this.i) ? word + this.raw(this.i + 1) : word;
      if (whole === word) return `\`${word}\` is a side, and an id cannot be one: rename it`;
      return `an id cannot start with a capital \`L\`, \`R\`, \`T\` or \`B\`, which reads as a side: rename \`${whole}\`, such as \`${whole.toLowerCase()}\``;
    }
    if (KEYWORD_KINDS[k] === 1) {
      return `\`${word}\` is a keyword, and an id cannot be one: rename it, such as \`${word}1\``;
    }
    if (k === T.Title) {
      const next = this.glued(this.i) && this.kind(this.i + 1) === T.Id ? this.raw(this.i + 1) : '';
      return `an id cannot start with \`title\`, which starts a title: rename \`title${next}\``;
    }
    return undefined;
  }

  /** Why `text` (read where a side is expected) is not one. */
  private notASide(text: string): string {
    if (text.length === 1 && SIDES.has(text.toUpperCase())) {
      return `sides are capitals: write \`${text.toUpperCase()}\``;
    }
    return 'a side is one capital letter, `L`, `R`, `T` or `B`, followed by `:` and the id';
  }

  /** Whether the token at `j` ends where the next one starts. */
  private glued(j: number): boolean {
    return (this.t.end[j] ?? 0) === (this.t.start[j + 1] ?? -1);
  }

  /** Skip to the line break that ends the statement after an error (R-PARSE-4). */
  protected override recover(): void {
    const id = this.declaring;
    if (id !== undefined) this.broken.add(id);
    super.recover();
  }

  /** Run one statement rule; on failure, recover. */
  protected override statement(rule: () => void): void {
    this.begin();
    super.statement(rule);
  }

  /** A statement starts at the cursor: no id declared yet. */
  private begin(): void {
    this.declaring = undefined;
    this.statementKind = this.kind();
    this.statementStart = this.i;
  }

  // ---- rules --------------------------------------------------------------------------

  /** `NEWLINE* "architecture-beta"` */
  private header(): void {
    while (this.accept(Kind.Newline, HEAD) !== undefined);
    if (this.kind() !== T.ArchitectureBeta) {
      this.fail([T.ArchitectureBeta], 'an architecture diagram starts with `architecture-beta`');
    }
    const range = this.range(this.i++);
    this.st.statement('header', range);
    this.children.push({ id: 'architecture', type: 'Header', range });
  }

  /** `(NEWLINE | TitleAndAccessibilities | Statement)* EOF` */
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
        else if (k === T.Group) this.group();
        else if (k === T.Service) this.service();
        else if (k === T.Junction) this.junction();
        else if (k === T.Align) this.alignment();
        else if (k === T.Id) this.edge();
        else this.fail(DOC);
      });
    }
  }

  /** `EOL: NEWLINE+ | EOF` (the loop takes the line breaks after the first); `want` names what else could come. */
  private eol(want: readonly number[] = LINE_END): void {
    this.tested(want);
    const k = this.kind();
    if (k === Kind.EOF) return;
    if (k !== Kind.Newline) this.fail(want);
    this.i++;
  }

  /** An `ID`, as a name. */
  private name(): ArchitectureName {
    const j = this.expect(T.Id);
    return { value: this.raw(j), range: this.range(j) };
  }

  /** A declaration's id: a name, recorded as the id being declared. */
  private declared(): ArchitectureName {
    const name = this.name();
    this.declaring = name.value;
    return name;
  }

  /** An optional `ARCH_ICON`, `ARCH_TITLE` or `STRING`, converted. */
  private optional(
    kind: number,
    want: readonly number[],
    convert: (image: string) => string
  ): ArchitectureText | undefined {
    const j = this.accept(kind, want);
    return j === undefined ? undefined : { value: convert(this.raw(j)), range: this.range(j) };
  }

  /** `("in" ID)?` */
  private parent(want: readonly number[]): ArchitectureName | undefined {
    if (this.accept(T.In, want) === undefined) return undefined;
    return this.name();
  }

  /** Where the statement that started at `start` ends: the token before the cursor. */
  private span(start: number): Range {
    return { start, end: this.range(this.i - 1).end };
  }

  /** `"group" ID ARCH_ICON? ARCH_TITLE? ("in" ID)? EOL` */
  private group(): void {
    const start = this.range(this.i++).start;
    const name = this.declared();
    // What may come next, as each optional part is read.
    let want = AFTER_GROUP_ID;
    const icon = this.optional(T.Icon, want, iconValue);
    if (icon) want = AFTER_ICON;
    const label = this.optional(T.Label, want, labelValue);
    if (label) want = AFTER_LABEL;
    const parent = this.parent(want);
    if (parent) want = LINE_END;
    const range = this.span(start);
    this.eol(want);
    const id = this.id(`group:${name.value}`);
    const node: ArchitectureGroupNode = { id, type: 'Group', range, name };
    if (icon) node.icon = icon;
    if (label) node.label = label;
    if (parent) node.parent = parent;
    this.declare(node, 'group');
    this.groups.push(node);
  }

  /** `"service" ID (STRING | ARCH_ICON)? ARCH_TITLE? ("in" ID)? EOL` */
  private service(): void {
    const start = this.range(this.i++).start;
    const name = this.declared();
    let want = AFTER_SERVICE_ID;
    const iconText = this.optional(T.String, want, stringValue);
    const icon = iconText ? undefined : this.optional(T.Icon, want, iconValue);
    if (iconText || icon) want = AFTER_ICON;
    const label = this.optional(T.Label, want, labelValue);
    if (label) want = AFTER_LABEL;
    const parent = this.parent(want);
    if (parent) want = LINE_END;
    const range = this.span(start);
    this.eol(want);
    const id = this.id(`service:${name.value}`);
    const node: ArchitectureServiceNode = { id, type: 'Service', range, name };
    if (iconText) node.iconText = iconText;
    if (icon) node.icon = icon;
    if (label) node.label = label;
    if (parent) node.parent = parent;
    this.declare(node, 'service');
    this.services.push(node);
  }

  /** `"junction" ID ("in" ID)? EOL` */
  private junction(): void {
    const start = this.range(this.i++).start;
    const name = this.declared();
    const want = [T.In, ...LINE_END];
    const parent = this.parent(want);
    const range = this.span(start);
    this.eol(parent ? LINE_END : want);
    const id = this.id(`junction:${name.value}`);
    const node: ArchitectureJunctionNode = { id, type: 'Junction', range, name };
    if (parent) node.parent = parent;
    this.declare(node, 'junction');
    this.junctions.push(node);
  }

  /** Record a declaration that parsed: its AST node, statement span and id mentions. */
  private declare(
    node: ArchitectureGroupNode | ArchitectureServiceNode | ArchitectureJunctionNode,
    kind: string
  ): void {
    this.children.push(node);
    this.st.statement(kind, node.range);
    this.ids.push({ name: node.name, declaredBy: node.id });
    if (node.parent) this.ids.push({ name: node.parent });
  }

  /**
   * Edge: ID ARROW_GROUP? ":" ARROW_DIRECTION ARROW_INTO? ("--" | "-" ARCH_TITLE "-")
   * ARROW_INTO? ARROW_DIRECTION ":" ID ARROW_GROUP? EOL
   */
  private edge(): void {
    // `accTitle` with no `:` or an unclosed `accDescr {` lexes as an id; followed by `{group}`
    // or `:` it is an edge's left id, as in v12 (`accTitle{group}:R -- L:b`).
    const next = this.kind(this.i + 1);
    if (next !== T.ArrowGroup && next !== T.Colon) this.accessibilityName(this.range());
    const lhsName = this.name();
    const lhsGroup = this.groupMark(AFTER_LHS_ID);
    this.expectOf(T.Colon, lhsGroup ? [T.Colon] : AFTER_LHS_ID);
    const lhsSide = this.side();
    const lhsInto = this.accept(T.ArrowInto, AFTER_LHS_SIDE) !== undefined;
    let label: ArchitectureText | undefined;
    if (this.accept(T.DashDash, lhsInto ? [T.DashDash, T.Dash] : AFTER_LHS_SIDE) === undefined) {
      this.expectOf(T.Dash, lhsInto ? [T.DashDash, T.Dash] : AFTER_LHS_SIDE);
      const j = this.expect(T.Label);
      label = { value: labelValue(this.raw(j)), range: this.range(j) };
      this.expect(T.Dash);
    }
    const rhsInto = this.accept(T.ArrowInto, AFTER_ARROW) !== undefined;
    const rhsSide = this.side(rhsInto ? [T.Direction] : AFTER_ARROW);
    this.expect(T.Colon);
    const rhsName = this.name();
    const rhsGroup = this.groupMark(AFTER_RHS_ID);
    const range = this.span(lhsName.range.start);
    this.eol(rhsGroup ? LINE_END : AFTER_RHS_ID);
    const end = (
      name: ArchitectureName,
      side: [ArchitectureSide, Range],
      into: boolean,
      group: Range | undefined
    ): ArchitectureEdgeEnd => {
      const e: ArchitectureEdgeEnd = { name, side: side[0], sideRange: side[1], into };
      if (group) e.group = group;
      return e;
    };
    const id = this.id(`edge:${lhsName.value}->${rhsName.value}`);
    const node: ArchitectureEdgeNode = {
      id,
      type: 'Edge',
      range,
      lhs: end(lhsName, lhsSide, lhsInto, lhsGroup),
      rhs: end(rhsName, rhsSide, rhsInto, rhsGroup),
    };
    if (label) node.label = label;
    this.ids.push({ name: lhsName }, { name: rhsName });
    this.children.push(node);
    this.edges.push(node);
    this.st.statement('edge', range);
  }

  /** `ARROW_GROUP?`: its range when written. */
  private groupMark(want: readonly number[]): Range | undefined {
    const j = this.accept(T.ArrowGroup, want);
    return j === undefined ? undefined : this.range(j);
  }

  /** `ARROW_DIRECTION` */
  private side(want: readonly number[] = [T.Direction]): [ArchitectureSide, Range] {
    const j = this.expectOf(T.Direction, want);
    return [this.raw(j) as ArchitectureSide, this.range(j)];
  }

  /** `"align" ("row" | "column") ID ID+ EOL` */
  private alignment(): void {
    const start = this.range(this.i++).start;
    this.tested([T.Row, T.Column]);
    const k = this.kind();
    if (k !== T.Row && k !== T.Column) this.fail([T.Row, T.Column]);
    this.i++;
    const members = [this.name(), this.name()];
    for (;;) {
      this.tested(AFTER_MEMBER);
      if (this.kind() !== T.Id) break;
      members.push(this.name());
    }
    const range = this.span(start);
    this.eol(AFTER_MEMBER);
    const node: ArchitectureAlignmentNode = {
      id: this.st.ids.statement('align'),
      type: 'Alignment',
      range,
      direction: k === T.Row ? 'row' : 'column',
      members,
    };
    for (const m of members) this.ids.push({ name: m });
    this.children.push(node);
    this.alignments.push(node);
    this.st.statement('align', range);
  }

  /** `(ACC_DESCR | ACC_TITLE | TITLE) EOL` */
  private text(k: number): void {
    const j = this.i++;
    const image = this.raw(j);
    const { type, word } = TEXT_STATEMENTS[k] ?? TITLE_STATEMENT;
    const range = withoutIndent(this.src, this.range(j));
    this.eol();
    const text = (this.texts[word] = textValue(type, image));
    const id = this.id(word);
    if (type === 'Title') this.titleAstId = id;
    this.children.push({ id, type, range, text });
    this.st.statement(word, range);
  }

  // ---- the model ----------------------------------------------------------------------

  private model(): ArchitectureModel {
    const { diagnostics } = this.st;
    const { model, registered } = normalise(
      {
        groups: this.groups,
        services: this.services,
        junctions: this.junctions,
        edges: this.edges,
        alignments: this.alignments,
        broken: this.broken,
        title: this.texts.title,
        titleAstId: this.titleAstId,
        accTitle: this.texts.accTitle,
        accDescr: this.texts.accDescr,
        frontMatterTitle: this.pre.frontMatter?.title,
      },
      diagnostics
    );
    this.symbols(registered);
    checkLimits(this.children, model, this.opts, diagnostics);
    // The model's diagnostics are found after the parse: keep the list in source order.
    diagnostics.list.sort((x, y) => x.range.start - y.range.start);
    const warnings = diagnostics.list.filter((d) => d.severity === 'warning');
    return Object.freeze({ ...model, warnings: Object.freeze(warnings) });
  }

  /**
   * D508: each id is a symbol of its kind (`service`, `junction` or `group`, from the
   * declaration that registered it), defined there and referenced from every other mention
   * (another declaration of the id, `in`, edges, `align`). A name no declaration registered has
   * no symbol (no definition, references or rename; the error says why). Run after the parse,
   * so that a mention before the declaration resolves too.
   */
  private symbols(registered: Registered): void {
    for (const m of this.ids) {
      const r = registered.get(m.name.value);
      if (!r) continue;
      const role = m.declaredBy !== undefined && m.declaredBy === r.astId ? 'def' : 'ref';
      this.st.symbol(m.name.value, r.kind, m.name.range, role);
    }
    this.st.symbols.sort((a, b) => a.range.start - b.range.start);
  }
}
