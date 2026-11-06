// cspell:words LALR
/**
 * Mindmap parser: recursive descent over the {@link lex} tokens (gated against v12's jison
 * lexer, #383), producing a {@link MindmapModel}, the typed AST, statement spans and diagnostics
 * (DESIGN §4.3). Symbols are the language facet's (T6).
 *
 * The grammar is v12's `mindmap.jison` (LALR), ported rule for rule; `grammar/mindmap.ebnf` is
 * the normative form:
 *
 *     start     = [ SPACELINE ( SPACELINE | NL )* ] MINDMAP [ NL ] ( statement stop )+
 *     stop      = ( NL | EOF | SPACELINE ) ( NL | EOF )*
 *     statement = SPACELIST [ node | ICON | CLASS ] | SPACELINE | node | ICON | CLASS
 *     node      = NODE_ID [ shape ] | shape ;   shape = NODE_DSTART NODE_DESCR NODE_DEND
 *
 * So a blank or comment line is a statement where one may start, and a separator after one: a
 * node right after two of them in a row (or one right after `mindmap`) is a syntax error, as in
 * v12. The parser reads the tokens jison returned; `:::`, `::icon(`, the `)` after an icon and
 * the quotes of a string, for which jison returns none, are skipped like comments (they still
 * give the ranges).
 *
 * v12's DB (`mindmapDb.ts`) adds two errors, kept here as diagnostics after which the parse goes
 * on (R-PARSE-4): a second root (a node with no parent: an indent no deeper than the first
 * node's), and a decoration before any node (a `TypeError` in v12). Parents come from a stack of
 * open nodes, which finds the same parent as v12's backward scan in linear time (pitfall 19).
 * Unlike jison the parser does not stop at the first error: it reports it, skips to the next
 * line and carries on.
 */
import {
  cook,
  inKindSet,
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  sourceView,
  TokenCursor,
} from '@mermaid-js/core/parser-kit';
import type {
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  StatementSpan,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { mindmapSections } from '../model.ts';
import type {
  MindmapColorBy,
  MindmapIcon,
  MindmapModel,
  MindmapNode,
  MindmapShape,
} from '../model.ts';
import type { MindmapDecoration, MindmapDocument, MindmapNodeNode } from './ast.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

export interface MindmapParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** How sections are assigned (`mindmap.colorBy`); `'branch'` when absent. */
  colorBy?: MindmapColorBy;
}

export type MindmapParseResult = ParseResult<MindmapModel, MindmapDocument>;

/**
 * Comments, and the text jison matched without returning a token: `:::`, `::icon(`, the `)`
 * closing an icon, the line break after a bare `:::`, and the quotes of a string.
 */
const SKIPPED = kindSet(
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
  T.IconStart,
  T.IconEnd,
  T.ClassStart,
  T.ClassEnd,
  T.StringStart,
  T.StringEnd,
  T.MdStringStart,
  T.MdStringEnd
);

/** What a closer the opener reads best with is, for messages (any closer parses, as in v12). */
const CLOSERS: Readonly<Record<string, string>> = {
  '[': ']',
  '(': ')',
  '((': '))',
  ')': '(',
  '))': '((',
  '{{': '}}',
  '-)': '(-',
  '(-': '-)',
};

const HEADER = ['`mindmap`'];
const STATEMENT = ['a node such as `root` or `id[text]`', 'a `::icon(…)` or `:::class` line'];
const LINE_BREAK = ['a line break'];
const TEXT = ['the text of the node'];
const HEADER_HINT = 'a mindmap starts with `mindmap`';
const ONE_HEADER = '`mindmap` starts the diagram and comes only once';
const BRACE_HINT = 'a hexagon is written `{{text}}`';
const DECORATION_HINT = 'an `::icon(…)` or `:::class` goes on a line of its own, after its node';
const BARE_CLASS_HINT = 'a bare `:::` takes the line break after it';
const AFTER_BLANK_HINT =
  'remove a blank or comment line above it: a line may not follow two of them in a row, or one right after `mindmap`';

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** Parse a mindmap diagram. Never throws: problems are error diagnostics. */
export function parseMindmap(src: string, options: MindmapParseOptions = {}): MindmapParseResult {
  return new MindmapParser(src, options).parse();
}

/** A model node while the tree is built. */
interface OpenNode {
  ast: string;
  id: string;
  label: string;
  shape: MindmapShape;
  level: number;
  depth: number;
  parent?: number;
  children: number[];
  classes: string[];
  icon?: MindmapIcon;
  section?: number;
}

/** A node of the open-node stack: its model index and its statement span. */
interface Open {
  index: number;
  level: number;
  span: StatementSpan;
}

/**
 * One parse. Each grammar rule is a method; a rule that fails records a diagnostic and throws
 * {@link STOP}, and the statement loop recovers.
 */
class MindmapParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly st = new ParseState();
  private readonly c: TokenCursor;
  private readonly children: MindmapNodeNode[] = [];
  private readonly nodes: OpenNode[] = [];
  /** The chain of open nodes: the root, …, the last node added. */
  private readonly open: Open[] = [];
  /** The first node's indent; v12's `baseLevel`. */
  private base = 0;
  /** The model node the next decoration applies to: the last node added. */
  private last: OpenNode | undefined;
  /** The AST node of the last node statement, added or not. */
  private lastAst: MindmapNodeNode | undefined;
  /** The end of the last statement read, where an open node's span ends. */
  private lastEnd = 0;
  /** The last statement was a blank or comment line (for the message after it). */
  private afterBlank = false;
  /** The statement reported a missing separator already: the next one starts here. */
  private lineEnded = false;
  /** `mindmap` was read; a missing one was reported once, so a later one is the header. */
  private headerSeen = false;
  private lines: LineIndex | undefined;

  constructor(
    private readonly src: string,
    private readonly options: MindmapParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.c = new TokenCursor(lex(src, pre.bodyStart, this.view), SKIPPED);
  }

  parse(): MindmapParseResult {
    this.start();
    this.document();
    const root = this.open[0];
    if (root) this.st.endStatement(root.span, this.lastEnd);
    const { st, pre, src } = this;
    const colorBy = this.options.colorBy ?? 'branch';
    const sections = mindmapSections(this.nodes, colorBy);
    this.nodes.forEach((n, k) => {
      const s = sections[k];
      if (s !== undefined) n.section = s;
    });
    const model: MindmapModel = {
      nodes: this.nodes as MindmapNode[],
      colorBy,
      warnings: st.diagnostics.list.filter((d) => d.severity === 'warning'),
    };
    const ast: MindmapDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.c.tokens, this.options);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** A token's text as v12's parser read it (removed spans cut, entities decoded). */
  private raw(j = this.c.pos): string {
    const t = this.c.tokens;
    return cook(this.src, t.start[j] ?? 0, t.end[j] ?? 0, this.view);
  }

  private range(j: number): Range {
    const t = this.c.tokens;
    return { start: t.start[j] ?? 0, end: t.end[j] ?? 0 };
  }

  /** The kind of the token right before index `j` in the stream (trivia included). */
  private kindBefore(j: number): number {
    return this.c.tokens.kind[j - 1] ?? Kind.EOF;
  }

  /**
   * The index of the token of `kind` next to `j` in direction `step` (±1), past comments and
   * directives; -1 when the next other token is not of `kind`.
   */
  private beside(j: number, step: number, kind: number): number {
    const t = this.c.tokens;
    for (let i = j + step; i >= 0 && i < t.length; i += step) {
      const k = t.kind[i];
      if (k === kind) return i;
      if (k !== Kind.Comment && k !== Kind.Directive) return -1;
    }
    return -1;
  }

  private isStop(k: number): boolean {
    return k === Kind.Newline || k === T.Eof || k === T.SpaceLine;
  }

  private isNodeStart(k: number): boolean {
    return k === T.NodeId || k === T.NodeDStart;
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the current token (the one after it, for an indent). */
  private found(): string {
    const { c } = this;
    let j = c.pos;
    if (c.kind === T.SpaceList) {
      let next = j + 1;
      while (next < c.tokens.length - 1 && inKindSet(SKIPPED, c.tokens.kind[next] ?? 0)) next++;
      const after = c.tokens.kind[next] ?? Kind.EOF;
      if (!this.isStop(after) && after !== Kind.EOF) j = next;
    }
    const k = c.tokens.kind[j] ?? Kind.EOF;
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    const t = this.raw(j).trim();
    if (k === T.SpaceLine) return t.includes('%%') ? 'a comment' : 'a blank line';
    if (t === '') return 'blanks';
    const line = /^[^\n\r\u2028\u2029]*/.exec(t)?.[0] ?? '';
    const cut = line.length > 24 ? line.slice(0, 24) : line;
    return cut.length < t.length ? `\`${cut}…\`` : `\`${t}\``;
  }

  /** Report what was found where `names` were expected, then stop the statement. */
  private fail(names: string[], hint?: string, at: Range = this.c.range): never {
    this.report(names, hint, at);
    throw STOP;
  }

  /** Report what was found where `names` were expected, and go on. */
  private report(names: string[], hint?: string, at: Range = this.c.range): void {
    const d = this.st.diagnostics.unexpected('UNEXPECTED', at, names, this.found());
    if (hint) d.message = `${d.message.slice(0, -1)}; ${hint}.`;
  }

  /** Skip to the next separator after an error (R-PARSE-4), and past it. */
  private recover(): void {
    const { c } = this;
    c.recovering();
    while (c.kind !== Kind.EOF && !this.isStop(c.kind)) c.next();
    this.separator();
  }

  /** Run one rule; on failure, skip to the next statement. */
  private guarded(rule: () => void): void {
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
  }

  // ---- grammar ------------------------------------------------------------------------

  /**
   * `start`: blank and comment lines, then `mindmap` and an optional line break. Without the
   * header the rest is still read, and a later `mindmap` is taken as it.
   */
  private start(): void {
    const { c } = this;
    if (c.kind === T.SpaceLine) {
      // `spaceLines`.
      c.next();
      while (c.kind === T.SpaceLine || c.kind === Kind.Newline) c.next();
    }
    if (c.kind === T.Mindmap) this.header();
    else this.report(HEADER, HEADER_HINT);
  }

  private header(): void {
    const { c } = this;
    this.headerSeen = true;
    this.st.statement('header', c.range);
    c.next();
    c.eat(Kind.Newline);
  }

  /** `document`: statements, each followed by a separator, to the end. */
  private document(): void {
    const { c } = this;
    while (c.kind !== Kind.EOF) {
      // The missing header was reported; one error, one diagnostic.
      if (!this.headerSeen && c.kind === T.Mindmap) {
        this.header();
        continue;
      }
      this.guarded(() => {
        this.statement();
        this.stop();
      });
    }
  }

  /** `stop`: a line break, the end, or a blank or comment line; then line breaks. */
  private stop(): void {
    const { c } = this;
    if (this.lineEnded) {
      this.lineEnded = false;
      return;
    }
    if (this.isStop(c.kind)) {
      this.separator();
      return;
    }
    if (c.kind === Kind.EOF) this.endsOpen();
    const k = c.kind;
    // The line ended (inside a blank run or after a bare `:::`) where jison wanted a separator:
    // one error, and the line after it is still read.
    const bareClass = this.kindBefore(c.pos) === T.ClassEnd;
    if (this.afterBlank || bareClass) {
      this.report(LINE_BREAK, this.afterBlank ? AFTER_BLANK_HINT : BARE_CLASS_HINT);
      return;
    }
    let hint: string | undefined;
    if (k === T.SpaceList || k === T.Icon || k === T.Class) hint = DECORATION_HINT;
    else if (k === T.Mindmap) hint = ONE_HEADER;
    else if (k === Kind.Error) hint = BRACE_HINT;
    this.fail(LINE_BREAK, hint);
  }

  /** The separator tokens at the cursor: one of `stop`'s, then line breaks and the end. */
  private separator(): void {
    const { c } = this;
    if (c.kind === Kind.EOF) return;
    c.next();
    while (c.kind === Kind.Newline || c.kind === T.Eof) c.next();
  }

  /**
   * The text ended inside an icon, a shape or a string (jison's lexer returned no `EOF` there):
   * report what was left open.
   */
  private endsOpen(): never {
    const t = this.c.tokens;
    for (let j = t.length - 1; j >= 0; j--) {
      const k = t.kind[j] ?? 0;
      if (k === T.IconStart) return this.unclosed('UNCLOSED_ICON', 'icon', '::icon(', ')', j);
      if (k === T.StringStart) return this.unclosed('UNCLOSED_STRING', 'string', '"', '"', j);
      if (k === T.MdStringStart) return this.unclosed('UNCLOSED_STRING', 'string', '"`', '`"', j);
      if (k === T.NodeDStart) {
        const open = this.raw(j);
        return this.unclosed('UNCLOSED_SHAPE', 'shape', open, CLOSERS[open] ?? ')', j);
      }
      if (k === T.IconEnd || k === T.StringEnd || k === T.MdStringEnd || k === T.NodeDEnd) break;
    }
    this.fail(LINE_BREAK);
  }

  private unclosed(code: string, what: string, open: string, close: string, j: number): never {
    const at = this.range(j);
    this.st.diagnostics.error(
      code,
      `Unclosed ${what}: the \`${open}\` at line ${this.lineOf(at.start)} has no closing \`${close}\`. Add \`${close}\` after its text.`,
      at
    );
    throw STOP;
  }

  /** `statement`. */
  private statement(): void {
    const { c } = this;
    const k = c.kind;
    this.afterBlank = false;
    if (k === T.SpaceList) {
      const j = c.next();
      const indent = this.raw(j).length;
      const n = c.kind;
      if (this.isNodeStart(n)) this.node(indent);
      else if (n === T.Icon || n === T.Class) this.decoration();
      else if (n === T.SpaceList && this.kindBefore(c.pos) === T.ClassEnd) {
        // A bare `:::` took the line break: one error, and the next line is still read.
        this.report(LINE_BREAK, BARE_CLASS_HINT);
        this.lineEnded = true;
      } else if (!this.isStop(n) && n !== Kind.EOF) this.badStatement();
      return;
    }
    if (k === T.SpaceLine) {
      c.next();
      this.afterBlank = true;
      return;
    }
    if (this.isNodeStart(k)) this.node(0);
    else if (k === T.Icon || k === T.Class) this.decoration();
    else this.badStatement();
  }

  private badStatement(): never {
    const k = this.c.kind;
    let hint: string | undefined;
    if (k === T.Mindmap) hint = ONE_HEADER;
    else if (k === Kind.Error) hint = BRACE_HINT;
    this.fail(STATEMENT, hint);
  }

  /** `node`: `nodeWithId` (an id, then an optional shape) or `nodeWithoutId` (a shape). */
  private node(indent: number): void {
    const { c } = this;
    let nodeId: string | undefined;
    const first = c.pos;
    if (c.kind === T.NodeId) {
      nodeId = this.raw(c.next());
    }
    let label = nodeId ?? '';
    let shape: MindmapShape = 'default';
    let end = this.range(first).end;
    if (c.kind === T.NodeDStart) {
      const open = c.next();
      if (c.kind !== T.NodeDescr) {
        if (c.kind === Kind.EOF) this.endsOpen();
        this.fail(TEXT);
      }
      label = this.raw(c.next());
      if (c.kind !== T.NodeDEnd) {
        if (c.kind === Kind.EOF) this.endsOpen();
        const opener = this.raw(open);
        this.fail([`\`${CLOSERS[opener] ?? ')'}\``]);
      }
      const close = c.next();
      shape = shapeOf(this.raw(open), this.raw(close));
      end = this.range(close).end;
    }
    const range = { start: this.range(first).start, end };
    this.addNode({ nodeId, label, shape, indent, range });
  }

  /** v12 `addNode`: the node's place in the tree, or the second-root error. */
  private addNode(parts: NodeParts): void {
    const { nodeId, label, shape, indent, range } = parts;
    const id = nodeId ?? label;
    const node: MindmapNodeNode = {
      id: this.st.ids.node(id.trim()),
      type: 'Node',
      range,
      label,
      shape,
      indent,
      decorations: [],
    };
    if (nodeId !== undefined) node.nodeId = nodeId;
    this.children.push(node);
    this.lastAst = node;
    const before = this.lastEnd;
    this.lastEnd = range.end;
    const first = this.nodes.length === 0;
    if (first) this.base = indent;
    const level = first ? 0 : indent - this.base;
    if (!first && level <= 0) {
      // v12: no earlier node has a smaller level, and only the first node is the root.
      // Not in the tree, so no statement span either: it would nest in an unrelated node's.
      this.last = undefined;
      this.st.diagnostics.error(
        'MINDMAP_SECOND_ROOT',
        `There can be only one root. No parent could be found for ("${label}"). Indent it deeper than the first node, the root.`,
        range
      );
      return;
    }
    // The nearest open node with a smaller level: v12's backward scan finds the same one.
    const { open } = this;
    let top = open.length;
    while (top > 0 && (open[top - 1]?.level ?? 0) >= level) top--;
    const parentOpen = open[top - 1];
    const closing = open[top];
    if (closing) this.st.endStatement(closing.span, before);
    open.length = top;
    const index = this.nodes.length;
    const parent = parentOpen ? this.nodes[parentOpen.index] : undefined;
    const model: OpenNode = {
      ast: node.id,
      id,
      label,
      shape,
      level,
      depth: parent ? parent.depth + 1 : 0,
      children: [],
      classes: [],
    };
    if (parent && parentOpen) {
      model.parent = parentOpen.index;
      parent.children.push(index);
    }
    this.nodes.push(model);
    this.last = model;
    const span = this.st.beginStatement('node', range.start);
    span.range.end = range.end;
    open.push({ index, level, span });
  }

  /** `ICON` or `CLASS`: v12 `decorateNode`, on the last node in source order. */
  private decoration(): void {
    const { c } = this;
    const icon = c.kind === T.Icon;
    const j = c.next();
    const text = this.raw(j);
    const inner = this.range(j);
    // `::icon(` or `:::` before the text, and the `)` after an icon.
    const opener = this.beside(j, -1, icon ? T.IconStart : T.ClassStart);
    const closer = icon ? this.beside(j, 1, T.IconEnd) : -1;
    const start = opener < 0 ? inner.start : this.range(opener).start;
    const end = closer < 0 ? inner.end : this.range(closer).end;
    const range = { start, end };
    const target = this.lastAst;
    if (!target) {
      this.st.diagnostics.error(
        'MINDMAP_DECORATION_BEFORE_NODE',
        `${icon ? 'An `::icon(…)`' : 'A `:::class`'} line decorates the node before it, and there is none here. Write it on the line after its node.`,
        range
      );
      return;
    }
    this.st.statement(icon ? 'icon' : 'class', range);
    this.lastEnd = end;
    const decoration: MindmapDecoration = { type: icon ? 'Icon' : 'Class', text, range };
    target.decorations.push(decoration);
    const node = this.last;
    if (!node) return;
    if (icon) node.icon = { text, range: inner };
    else node.classes = text.split(/[\t\n\f\r ]+/).filter((w) => w !== '');
  }
}

/** The parts of a node statement (pitfall 10). */
interface NodeParts {
  nodeId: string | undefined;
  label: string;
  shape: MindmapShape;
  /** The indent width as written. */
  indent: number;
  range: Range;
}

/** v12 `getType`: the shape from the opener, `(` by its closer too. */
function shapeOf(open: string, close: string): MindmapShape {
  switch (open) {
    case '[':
      return 'rect';
    case '(':
      return close === ')' ? 'rounded' : 'cloud';
    case '((':
      return 'circle';
    case ')':
      return 'cloud';
    case '))':
      return 'bang';
    case '{{':
      return 'hexagon';
    default:
      return 'default';
  }
}
