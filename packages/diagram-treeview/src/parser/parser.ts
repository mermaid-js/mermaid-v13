// cspell:words accdescr acctitle betax
/**
 * TreeView parser: recursive descent over the significant {@link lex} tokens (gated against v12's
 * Langium lexer, #571), producing a {@link TreeViewModel}, the typed AST, symbols, statement
 * spans and diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `treeView.langium`, ported rule for rule; `grammar/treeview.ebnf` is the
 * normative form:
 *
 *     TreeView: "treeView-beta" (ACC_DESCR | ACC_TITLE | TITLE)* TreeNode* EOF
 *     TreeNode: INDENTATION? (QUOTED_NAME | BARE_NAME)
 *               (CLASS_ANNOTATION | ICON_ANNOTATION | DESC_ANNOTATION)*
 *
 * Line breaks are skipped there (v12's `NL` is a skipped token), so they end nothing: a node
 * may start on the line of the node before it (`"q x" trailing` is two nodes), an annotation may
 * sit on the next line, and a blank at the end of a line is the indent of the next node. The
 * lexer still writes them, and the parser reads them only for its messages, its warnings and its
 * recovery. Unlike v12 the parser does not stop at the first error: it reports it, skips to the
 * next token that starts a line, and carries on (R-PARSE-4). Each of v12's syntax traps gets a
 * message that names its cause, and box-drawing errors are reported at their source line and
 * column (D486).
 */
import {
  DQUOTE,
  ExpectedTable,
  formatExpected,
  isBlank,
  Kind,
  LineIndex,
  ParseState,
  PERCENT,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type {
  AstId,
  Diagnostic,
  ParseOptions,
  ParseResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { TreeViewModel } from '../model.ts';
import type { TreeViewDocument, TreeViewNodeNode, TreeViewStatementNode } from './ast.ts';
import type { BoxError } from './box.ts';
import {
  accDescrValue,
  accTitleValue,
  bareValue,
  classValue,
  descValue,
  iconValue,
  indentValue,
  nodeIcon,
  nodeName,
  quotedValue,
  titleValue,
} from './convert.ts';
import { lex } from './lexer.ts';
import type { TreeViewLex } from './lexer.ts';
import { normalise } from './normalise.ts';
import { HEADER, T } from './tokens.ts';

export interface TreeViewParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}

export type TreeViewParseResult = ParseResult<TreeViewModel, TreeViewDocument>;

/** A node starts on the line of the node before it (v12 reads it as a node of its own). */
export const TREEVIEW_NODES_ON_ONE_LINE = 'TREEVIEW_NODES_ON_ONE_LINE';
/**
 * The blank at the end of a line, or a line of blanks, is the indent of the node on the next
 * line.
 */
export const TREEVIEW_TRAILING_BLANK = 'TREEVIEW_TRAILING_BLANK';
/** An annotation at the start of a line belongs to the node before it. */
export const TREEVIEW_ANNOTATION_NEXT_LINE = 'TREEVIEW_ANNOTATION_NEXT_LINE';
/** A first name that starts with `title` (`title.txt`) is read as a `title` and the rest. */
export const TREEVIEW_NAME_READ_AS_TITLE = 'TREEVIEW_NAME_READ_AS_TITLE';

const TEXT = [T.Title, T.AccTitle, T.AccDescr];
const NAME = [T.QuotedName, T.BareName];
const ANNOTATION = [T.ClassAnnotation, T.IconAnnotation, T.DescAnnotation];

/** Trivia of the parser's view: the lexer's trivia and the line breaks. */
const isTrivia = (k: number) =>
  k === Kind.Comment || k === Kind.Directive || k === Kind.Space || k === Kind.Newline;

/** Each text statement's AST type and keyword. */
const TEXT_STATEMENTS: Readonly<
  Record<number, { type: 'Title' | 'AccTitle' | 'AccDescr'; word: string }>
> = {
  [T.Title]: { type: 'Title', word: 'title' },
  [T.AccTitle]: { type: 'AccTitle', word: 'accTitle' },
  [T.AccDescr]: { type: 'AccDescr', word: 'accDescr' },
};

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`treeView-beta`', [T.TreeViewBeta]],
  ['a name (`index.js`, `src/` or `"my file"`)', NAME],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['the end of the text', [Kind.EOF]],
]);

/** The annotation marks a name may not start with, and an example of each. */
const MARKS = [':::', '##', 'icon('] as const;
const MARK_EXAMPLE: Readonly<Record<(typeof MARKS)[number], string>> = {
  ':::': ':::highlight',
  '##': '## notes',
  'icon(': 'icon(file)',
};

/** The longest text an error message quotes. */
const EXCERPT = 24;

/** The first line of `text`, at most {@link EXCERPT} characters, with `…` when anything is cut. */
function excerpt(text: string): string {
  const line = text.split('\n', 1)[0] ?? '';
  return line.length > EXCERPT || line !== text ? `${line.slice(0, EXCERPT)}…` : line;
}

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** Parse a treeView. Never throws: problems are error diagnostics. */
export function parseTreeView(
  src: string,
  options: TreeViewParseOptions = {}
): TreeViewParseResult {
  return new TreeViewParser(src, options).parse();
}

/** The parser's tokens: the significant ones, where each is in the stream, and line starts. */
interface LineView {
  readonly kind: Uint16Array;
  readonly start: Uint32Array;
  readonly end: Uint32Array;
  /** The token's index in the lexer's stream (for its text). */
  readonly index: Uint32Array;
  /** 1 when a line break comes between the token and the significant one before it. */
  readonly lineStart: Uint8Array;
  readonly length: number;
}

function lineView(stream: TokenStream): LineView {
  let n = 0;
  for (let j = 0; j < stream.length; j++) if (!isTrivia(stream.kind[j] ?? Kind.EOF)) n++;
  const kind = new Uint16Array(n);
  const start = new Uint32Array(n);
  const end = new Uint32Array(n);
  const index = new Uint32Array(n);
  const lineStart = new Uint8Array(n);
  let o = 0;
  let line = 1;
  for (let j = 0; j < stream.length; j++) {
    const k = stream.kind[j] ?? Kind.EOF;
    if (k === Kind.Newline) line = 1;
    if (isTrivia(k)) continue;
    kind[o] = k;
    start[o] = stream.start[j] ?? 0;
    end[o] = stream.end[j] ?? 0;
    index[o] = j;
    lineStart[o] = line;
    line = 0;
    o++;
  }
  return { kind, start, end, index, lineStart, length: n };
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class TreeViewParser {
  private readonly pre: PreprocessResult;
  private readonly lexed: TreeViewLex;
  private readonly t: LineView;
  private i = 0;
  /** Where the statement that failed stopped. */
  private failedAt = 0;
  private readonly st = new ParseState();
  private readonly children: TreeViewStatementNode[] = [];
  private lines: LineIndex | undefined;
  /** Mentions per id base (`title`, …), for the `@n` suffixes. */
  private readonly mentions = new Map<string, number>();
  private readonly nodes: TreeViewNodeNode[] = [];
  /** Whether a node has started: `title`, `accTitle` and `accDescr` are allowed only before. */
  private started = false;
  /** Whether the statement before is a node. */
  private afterNode = false;
  /** The `TREEVIEW_NODES_ON_ONE_LINE` warning of the current line, if any. */
  private oneLine: Diagnostic | undefined;
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private title = '';
  private titleAstId: AstId | undefined;
  private accTitle = '';
  private accDescr = '';

  constructor(
    private readonly src: string,
    private readonly opts: TreeViewParseOptions
  ) {
    const pre = (this.pre = opts.preprocessed ?? preprocess(src));
    if (!opts.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    const view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.lexed = lex(src, pre.bodyStart, view);
    this.t = lineView(this.lexed.tokens);
  }

  parse(): TreeViewParseResult {
    const { st, src, lexed } = this;
    if (lexed.box.kind === 'error') for (const e of lexed.box.errors) this.boxError(e);
    this.statement(() => this.header());
    this.document();
    const model = this.model();
    const ast: TreeViewDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, lexed.tokens, this.opts);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(j = this.i): number {
    return this.t.kind[j] ?? Kind.EOF;
  }

  private range(j = this.i): Range {
    return { start: this.t.start[j] ?? 0, end: this.t.end[j] ?? 0 };
  }

  /** The range of the token at `j` without the blanks it starts or ends with. */
  private trimmed(j: number): Range {
    const r = this.range(j);
    while (r.start < r.end && isBlank(this.src.charCodeAt(r.start))) r.start++;
    while (r.end > r.start && isBlank(this.src.charCodeAt(r.end - 1))) r.end--;
    return r;
  }

  /** Whether a line break comes before the token at `j`. */
  private startsLine(j = this.i): boolean {
    return this.t.lineStart[j] === 1;
  }

  /** Whether the token at `j` ends where the next one starts. */
  private glued(j: number): boolean {
    return j >= 0 && (this.t.end[j] ?? 0) === (this.t.start[j + 1] ?? -1);
  }

  /** A token's text as v12's lexer read it (the box pass's on a rewritten line). */
  private text(j = this.i): string {
    return this.lexed.text(this.t.index[j] ?? this.lexed.tokens.length - 1);
  }

  /** `id`, then `id@2`, `id@3`, … */
  private id(base: string): AstId {
    const n = (this.mentions.get(base) ?? 0) + 1;
    this.mentions.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the token at `j`. */
  private found(j = this.i): string {
    const k = this.kind(j);
    if (k === Kind.EOF) return 'the end of the text';
    if (k === T.Indentation) return 'a blank';
    return `\`${excerpt(this.text(j).trim())}\``;
  }

  /** Record an error at `where` and stop the statement. */
  private stop(code: string, message: string, where: Range, expected?: string[]): never {
    this.st.diagnostics.error(code, message, where, expected ? { expected } : undefined);
    this.failedAt = this.i;
    throw STOP;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  private fail(want: readonly number[], hint?: string): never {
    if (this.kind() === Kind.Error) this.badCharacters();
    const names = EXPECTED.names(want);
    const message = `Expected ${formatExpected(names)}, got ${this.found()}${hint ? `; ${hint}` : ''}.`;
    this.stop('UNEXPECTED', message, this.range(), names);
  }

  /**
   * Text no token rule matched: an unclosed name, an annotation with no name before it on its
   * line, or an `icon(` that does not close.
   */
  private badCharacters(): never {
    const where = this.range();
    const { src } = this;
    const c = src.charCodeAt(where.start);
    const line = this.lineOf(where.start);
    if (c === DQUOTE || src.startsWith("'", where.start)) {
      const q = src.charAt(where.start);
      this.stop(
        'UNCLOSED_STRING',
        `Unclosed name: the \`${q}\` at line ${line} has no closing \`${q}\`. Add \`${q}\` after the name.`,
        where,
        [`\`${q}\``]
      );
    }
    const prev = this.i - 1;
    const atStart =
      this.startsLine() || (this.kind(prev) === T.Indentation && this.startsLine(prev));
    const mark = MARKS.find((m) => src.startsWith(m, where.start));
    let why = `\`${excerpt(this.text())}\` is not part of a name or an annotation`;
    if (mark !== undefined && atStart) {
      why = `\`${mark}\` annotates the name before it on its line, so a line cannot start with it: write the name first (\`index.js ${MARK_EXAMPLE[mark]}\`), or put a name that starts so in quotes`;
    } else if (mark !== undefined && this.kind(prev) === T.QuotedName && this.glued(prev)) {
      why = `\`${mark}\` after a quoted name needs a blank before it, as in \`"my file" ${MARK_EXAMPLE[mark]}\``;
    } else if (mark === 'icon(') {
      why =
        '`icon(` needs its `)`, and an icon name is letters, digits, `-` and `_`, with an optional `pack:` before it, as in `icon(logos:react)`';
    }
    this.stop('UNEXPECTED_CHARACTER', `Unexpected character at line ${line}: ${why}.`, where);
  }

  /** A box-drawing error (v12's box pass threw), at its line in the source (D486). */
  private boxError(e: BoxError): void {
    const { src, lexed } = this;
    const start = lexed.source(e.start);
    const end = e.end > e.start ? lexed.source(e.end - 1) + 1 : start;
    const line = this.lineOf(start);
    const text = src.slice(start, end);
    if (e.message.includes('Empty node')) {
      const at = text.search(/[└┗├┣]/);
      const where = { start: start + Math.max(at, 0), end };
      this.st.diagnostics.error(
        'BOX_EMPTY_NODE',
        `Empty node: line ${line} has a box-drawing prefix and no name after it. Write a name after the prefix, or remove the line.`,
        where,
        { expected: EXPECTED.names(NAME) }
      );
      return;
    }
    let b = 0;
    while (b < text.length && /\s/.test(text.charAt(b))) b++;
    this.st.diagnostics.error(
      'BOX_UNEXPECTED_INDENT',
      `Unexpected indentation: line ${line} starts with blanks but has no \`├──\` or \`└──\` prefix, and the diagram is drawn with box-drawing lines. Write the prefix before its name, or remove the blanks.`,
      { start, end: start + b }
    );
  }

  /**
   * After an error, skip to the next token that starts a line (R-PARSE-4): the token that
   * failed when it starts one and the statement read something before it, else the first after
   * it.
   */
  private recover(from: number): void {
    let j = this.failedAt > from ? this.failedAt : from + 1;
    while (j < this.t.length && this.kind(j) !== Kind.EOF && !this.startsLine(j)) j++;
    this.i = Math.min(j, Math.max(this.t.length - 1, 0));
    this.afterNode = false;
    this.oneLine = undefined;
  }

  /** Run one statement rule; on failure, recover. */
  private statement(rule: () => void): void {
    const from = this.i;
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover(from);
    }
  }

  // ---- rules --------------------------------------------------------------------------

  /** `"treeView-beta"` */
  private header(): void {
    if (this.kind() !== T.TreeViewBeta) {
      const text = this.text();
      let hint = 'a treeView starts with `treeView-beta`, alone on its line';
      if (this.kind() === T.BareName && text.startsWith(HEADER)) {
        hint = /^[\s%]/.test(text.slice(HEADER.length))
          ? 'nothing may follow `treeView-beta` on its line, not even blanks or a `%%` comment'
          : `\`${excerpt(text.trim())}\` is not a diagram type: write \`treeView-beta\``;
      }
      this.fail([T.TreeViewBeta], hint);
    }
    const range = this.range(this.i++);
    this.st.statement('header', range);
    this.children.push({ id: 'treeView', type: 'Header', range });
  }

  /** `(ACC_DESCR | ACC_TITLE | TITLE)* TreeNode* EOF` */
  private document(): void {
    for (;;) {
      const k = this.kind();
      if (k === Kind.EOF) return;
      this.statement(() => {
        if (TEXT.includes(k)) this.textStatement(k);
        else this.node();
      });
    }
  }

  /** `(ACC_DESCR | ACC_TITLE | TITLE)`: the last of each wins; only before the first node. */
  private textStatement(k: number): void {
    const { type, word } = TEXT_STATEMENTS[k] ?? { type: 'Title', word: 'title' };
    if (this.started) this.lateText(word);
    const j = this.i++;
    const image = this.text(j);
    const range = this.trimmed(j);
    let text: string;
    if (type === 'Title') text = this.title = titleValue(image);
    else if (type === 'AccTitle') text = this.accTitle = accTitleValue(image);
    else text = this.accDescr = accDescrValue(image);
    const id = this.id(word);
    if (type === 'Title') this.titleAstId = id;
    this.children.push({ id, type, range, text });
    this.st.statement(word, range);
    if (type === 'Title' && image.trim() === 'title') this.titleTrap(j);
    this.afterNode = false;
    this.oneLine = undefined;
  }

  /** The text statement at the cursor comes after a node (v12 allows them only before). */
  private lateText(word: string): never {
    const j = this.i;
    const glued = this.kind(j + 1) === T.BareName && this.glued(j);
    const name = glued ? `${this.text(j).trim()}${bareValue(this.text(j + 1))}` : '';
    const why = glued
      ? `the name \`${excerpt(name)}\` is read as \`${word}\`: put it in quotes, \`"${excerpt(name)}"\``
      : `\`title\`, \`accTitle\` and \`accDescr\` go before the first node`;
    this.fail([...NAME, Kind.EOF], why);
  }

  /** A `title` glued to a bare name: the first node `title.txt` is a title and `.txt`. */
  private titleTrap(j: number): void {
    if (this.kind(j + 1) !== T.BareName || !this.glued(j)) return;
    const name = `title${bareValue(this.text(j + 1))}`;
    this.st.diagnostics.warning(
      TREEVIEW_NAME_READ_AS_TITLE,
      `\`${excerpt(name)}\` is read as an empty \`title\` and a node \`${excerpt(name.slice(5))}\`. Put the name in quotes, \`"${excerpt(name)}"\`.`,
      { start: this.trimmed(j).start, end: this.trimmed(j + 1).end }
    );
  }

  /** `TreeNode: INDENTATION? (QUOTED_NAME | BARE_NAME) (annotation)*` */
  private node(): void {
    this.started = true;
    const blank = this.kind() === T.Indentation ? this.i++ : -1;
    const level = blank >= 0 ? indentValue(this.text(blank)) : 0;
    const k = this.kind();
    if (k !== T.QuotedName && k !== T.BareName) this.notName(blank);
    const head = this.i++;
    this.lineWarnings(blank, head);
    const image = this.text(head);
    const quoted = k === T.QuotedName;
    const { name, directory } = nodeName(quoted ? quotedValue(image) : bareValue(image));
    const nameRange = this.trimmed(head);
    if (quoted) nameRange.end = this.range(head).end;
    const node: TreeViewNodeNode = {
      id: '',
      type: 'Node',
      range: { start: nameRange.start, end: nameRange.end },
      name,
      nameRange,
      directory,
      level,
      depth: 0,
    };
    for (let a = this.kind(); ANNOTATION.includes(a); a = this.kind()) this.annotation(node, a);
    this.nodes.push(node);
    this.children.push(node);
    this.st.statement('node', { ...node.range });
    // D487: each node is a `node` symbol of its own; the range holds just the name.
    const symbol = { start: nameRange.start + (quoted ? 1 : 0), end: nameRange.end };
    if (quoted) symbol.end--;
    if (directory) symbol.end--;
    this.st.symbol(name, 'node', symbol, 'def');
    this.afterNode = true;
  }

  /** One annotation of `node`: the last of each kind wins. */
  private annotation(node: TreeViewNodeNode, kind: number): void {
    const j = this.i++;
    const image = this.text(j);
    const range = this.trimmed(j);
    node.range.end = range.end;
    if (this.startsLine(j)) {
      this.st.diagnostics.warning(
        TREEVIEW_ANNOTATION_NEXT_LINE,
        `\`${excerpt(image.trim())}\` starts a line, so it annotates \`${excerpt(node.name)}\`, the node before it. Write it after that name, on its line.`,
        range,
        { related: [{ message: 'the node it annotates', range: { ...node.nameRange } }] }
      );
    }
    if (kind === T.ClassAnnotation) {
      node.cssClass = classValue(image);
      node.classRange = range;
    } else if (kind === T.IconAnnotation) {
      node.icon = nodeIcon(iconValue(image));
      node.iconRange = range;
    } else {
      const text = descValue(image);
      if (text === '') delete node.description;
      else node.description = text;
      node.descriptionRange = range;
    }
  }

  /** The token after a node's indent (or where a node starts) is no name. */
  private notName(blank: number): never {
    const k = this.kind();
    if (blank >= 0 && (k === T.Indentation || k === Kind.EOF)) this.strayBlank(blank);
    if (k === T.TreeViewBeta) {
      this.fail(
        NAME,
        'a treeView has one `treeView-beta`, at its start: write `"treeView-beta"` for a node of that name'
      );
    }
    if (ANNOTATION.includes(k)) {
      this.fail(
        NAME,
        'an annotation follows the name it belongs to, as in `index.js :::highlight`'
      );
    }
    this.fail(NAME);
  }

  /**
   * A blank run with no name after it on its line: at the end of a line (after a quoted name
   * or an annotation), before an inline comment, or on a line of its own. v12 read it as the
   * indent of the next node, and the token after it is no name.
   */
  private strayBlank(blank: number): never {
    const where = this.range(blank);
    const line = this.lineOf(where.start);
    const comment = this.src.charCodeAt(where.end) === PERCENT;
    const own = this.startsLine(blank);
    let at = `there is a blank at the end of line ${line}`;
    if (own) at = `line ${line} holds only blanks`;
    else if (comment) at = `there is a blank before the \`%%\` comment on line ${line}`;
    const next =
      this.kind() === Kind.EOF
        ? 'and no node follows it'
        : 'and the next node has an indent of its own';
    this.st.diagnostics.error(
      'STRAY_BLANK',
      `Unexpected blank: ${at}, which a treeView reads as the indent of the next node, ${next}. Remove ${own ? 'the blanks' : 'it'}.`,
      where,
      {
        expected: EXPECTED.names(NAME),
        ...(this.kind() === Kind.EOF
          ? {}
          : { related: [{ message: 'the next node', range: this.range() }] }),
      }
    );
    // Recovery resumes at the next node's indent.
    this.failedAt = this.i;
    throw STOP;
  }

  /**
   * Warnings at a node's start: a second node on a line, and an indent that is a blank at the
   * end of the line before.
   */
  private lineWarnings(blank: number, head: number): void {
    const { diagnostics } = this.st;
    const sameLine = !this.startsLine(head) && (blank < 0 || !this.startsLine(blank));
    if (!sameLine) this.oneLine = undefined;
    if (sameLine && this.afterNode) {
      const range = this.range(head);
      const shown = this.found(head);
      if (this.oneLine) {
        (this.oneLine.related ??= []).push({ message: `${shown} starts another node`, range });
      } else {
        this.oneLine = diagnostics.warning(
          TREEVIEW_NODES_ON_ONE_LINE,
          `${shown} starts a second node on this line. It is read as a node of its own, indented by the blanks before it, so it may nest under the node before it. Put each node on its own line.`,
          range
        );
      }
    }
    if (blank >= 0 && this.startsLine(head)) {
      const where = this.range(blank);
      const line = this.lineOf(where.start);
      let cause = `the blank at the end of line ${line}`;
      if (this.startsLine(blank)) cause = `line ${line}, which holds only blanks`;
      else if (this.src.charCodeAt(where.end) === PERCENT) {
        cause = `the blank before the \`%%\` comment on line ${line}`;
      }
      diagnostics.warning(
        TREEVIEW_TRAILING_BLANK,
        `This node is indented by ${cause}: a treeView reads the blanks before a name as its indent, wherever they are. Remove the blank.`,
        where,
        { related: [{ message: 'the node it indents', range: this.range(head) }] }
      );
    }
  }

  // ---- the model ----------------------------------------------------------------------

  private model(): TreeViewModel {
    const { diagnostics } = this.st;
    const resolved = normalise({
      nodes: this.nodes,
      title: this.title,
      titleAstId: this.titleAstId,
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      frontMatterTitle: this.pre.frontMatter?.title,
    });
    // The box errors are found before the parse: keep the list in source order.
    diagnostics.list.sort((x, y) => x.range.start - y.range.start);
    const warnings = diagnostics.list.filter((d) => d.severity === 'warning');
    return Object.freeze({ ...resolved, warnings: Object.freeze(warnings) });
  }
}
