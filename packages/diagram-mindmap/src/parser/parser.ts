// cspell:words LALR
/**
 * Mindmap parser: recursive descent over the {@link lex} tokens (gated against v12's jison
 * lexer, #383), producing a {@link MindmapModel}, the typed AST, statement spans and diagnostics
 * (DESIGN §4.3).
 *
 * Symbols (D289): each node id is a `node` definition of its own (ids repeat and nothing refers
 * to one), recorded with the range of the id without the blanks around it; each word of a
 * `:::` line is a `class` reference. With a probe (R-LANG-7, D95) the parser records what it
 * would accept at the probed token: the header, a statement start, a shape after an id, a
 * shape's text and closer.
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
import { cook, CR, isSpace, Kind, kindSet, LF, SPACE, TAB } from '@mermaid-js/core/parser-kit';
import { STOP } from '@mermaid-js/shared/parser/support';
import type {
  ParseOptions,
  ParseResult,
  Range,
  StatementSpan,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { holesIn, treeGrammar, TreeParser } from '@mermaid-js/shared/parser/tree';
import { DEFAULT_LIMITS, LIMIT_CODES, checkLimit } from '@mermaid-js/core/limits';
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
import { KINDS, lex } from './lexer.ts';
import { T } from './tokens.ts';

export interface MindmapParseOptions extends ParseOptions {
  /** How sections are assigned (`mindmap.colorBy`); `'branch'` when absent. */
  colorBy?: MindmapColorBy;
  /** Node cap (core `DEFAULT_LIMITS.maxNodes`, R-SEC-5). */
  maxNodes?: number;
  /** Tree depth cap: how deep a node may sit under the root (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
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

/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset: blanks
 * and blank lines (the indent before a node), the shape delimiters, and a shape's text (after
 * it comes the closer).
 */
const PROBE_FOLLOWS = kindSet(T.SpaceList, T.SpaceLine, T.NodeDStart, T.NodeDescr, T.NodeDEnd);

/** A word of a `:::` line: the model splits it at these blanks (HTML class-attribute words). */
const CLASS_WORD = /[^\t\n\f\r ]+/g;
const CLASS_BLANK = /[\t\n\f\r ]/;

const ONE_HEADER = '`mindmap` starts the diagram and comes only once';
const BRACE_HINT = 'a hexagon is written `{{text}}`';

/** The lex as the shared parser holds it. */
interface Lexed {
  readonly tokens: TokenStream;
}

const GRAMMAR = /* @__PURE__ */ treeGrammar<Lexed>({
  lex: (src, from, view, probe) => ({ tokens: lex(src, from, view, probe) }),
  kinds: KINDS,
  skipped: SKIPPED,
  probeFollows: PROBE_FOLLOWS,
  header: ['`mindmap`'],
  headerHint: 'a mindmap starts with `mindmap`',
  statement: ['a node such as `root` or `id[text]`', 'a `::icon(…)` or `:::class` line'],
  shapeText: ['the text of the node'],
  decorationHint: 'an `::icon(…)` or `:::class` goes on a line of its own, after its node',
  oneNodeHint: 'each node goes on a line of its own',
  afterBlankHint:
    'remove a blank or comment line above it: a line may not follow two of them in a row, or one right after `mindmap`',
});

/** Parse a mindmap diagram. Never throws: problems are error diagnostics. */
export function parseMindmap(src: string, options: MindmapParseOptions = {}): MindmapParseResult {
  return new MindmapParser(src, options).parse();
}

/** A model node while the tree is built. */
interface OpenNode {
  ast: string;
  id: string;
  label: string;
  markdown?: true;
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
 * One parse: the shared rules down to a statement ({@link TreeParser}), and mindmap's node and
 * decoration rules. A rule that fails records a diagnostic and throws {@link STOP}, and the
 * statement loop recovers.
 */
class MindmapParser extends TreeParser<Lexed, PreprocessResult> {
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
  private readonly maxNodes: number;
  private readonly maxDepth: number;
  /** The node and depth limits were reported (each once per parse). */
  private tooDeep = false;

  constructor(
    src: string,
    private readonly options: MindmapParseOptions
  ) {
    const given = options.preprocessed;
    super(src, given ?? preprocess(src), !given, GRAMMAR, options.probe);
    this.maxNodes = options.maxNodes ?? DEFAULT_LIMITS.maxNodes;
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
  }

  parse(): MindmapParseResult {
    this.start();
    this.document();
    this.closeOpen(0, this.lastEnd);
    const colorBy = this.options.colorBy ?? 'branch';
    const sections = mindmapSections(this.nodes, colorBy);
    this.nodes.forEach((n, k) => {
      const s = sections[k];
      if (s !== undefined) n.section = s;
    });
    const model = { nodes: this.nodes as MindmapNode[], colorBy };
    return this.finish(model, this.children, this.options);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** A token's text as v12's parser read it (removed spans cut, entities decoded). */
  protected raw(j = this.c.pos): string {
    const t = this.c.tokens;
    return cook(this.src, t.start[j] ?? 0, t.end[j] ?? 0, this.view);
  }

  /**
   * Each word of a `:::` line: a class reference; the words rename together (D289). The words
   * of v12's text are paired in order with the words of the source (blank-separated, removed
   * spans skipped): a word whose source differs from it (an encoded entity such as `#35;`, or a
   * word cut by a directive) keeps the token's range, which the service drops, and the others
   * keep their own. When the counts differ (an entity read as a blank), every word keeps it.
   */
  private classSymbols(text: string, j: number): void {
    const r = this.range(j);
    const spots = this.sourceWords(r);
    const words = [...text.matchAll(CLASS_WORD)];
    const paired = spots.length === words.length;
    words.forEach((m, k) => {
      const name = m[0];
      const spot = paired ? spots[k] : undefined;
      const exact = spot !== undefined && this.src.slice(spot.start, spot.end) === name;
      this.st.symbol(name, 'class', exact ? spot : r, 'ref');
    });
  }

  /**
   * The blank-separated words of the source in `r`, in order, with the removed spans skipped
   * (a word a removed span cuts in two is one, its range over the cut). Linear in `r`.
   */
  private sourceWords(r: Range): Range[] {
    const { src } = this;
    const holes = holesIn(this.view, r);
    const out: Range[] = [];
    let h = 0;
    let start = -1;
    let end = -1;
    for (let i = r.start; i < r.end; ) {
      const hole = holes[h];
      if (hole && i >= hole.start) {
        i = Math.max(i, hole.end);
        h++;
        continue;
      }
      if (CLASS_BLANK.test(src.charAt(i))) {
        if (start >= 0) out.push({ start, end });
        start = -1;
      } else {
        if (start < 0) start = i;
        end = i + 1;
      }
      i++;
    }
    if (start >= 0) out.push({ start, end });
    return out;
  }

  protected hintFor(kind: number): string | undefined {
    if (kind === T.Mindmap) return ONE_HEADER;
    return kind === Kind.Error ? BRACE_HINT : undefined;
  }

  // ---- grammar ------------------------------------------------------------------------

  /** `node`: `nodeWithId` (an id, then an optional shape) or `nodeWithoutId` (a shape). */
  protected node(indent: number): void {
    const { c } = this;
    const first = c.pos;
    const nodeId = this.nodeId(T.NodeDStart);
    const parts: NodeParts = {
      nodeId,
      label: nodeId ?? '',
      shape: 'default',
      indent,
      range: this.range(first),
    };
    // A node that fails inside its shape is still added, with the text read so far, so that
    // the decorations, children and roots after it see it: one error, one diagnostic.
    let failed = false;
    if (c.kind === T.NodeDStart) {
      try {
        this.shape(parts);
      } catch (error) {
        if (error !== STOP) throw error;
        failed = true;
      }
    }
    this.addNode(parts);
    if (failed) throw STOP;
  }

  /** `NODE_DSTART NODE_DESCR NODE_DEND`, into `parts` as far as it gets. */
  private shape(parts: NodeParts): void {
    // The shape as far as the opener tells, for a node whose shape is left open.
    parts.shape = shapeOf(this.raw(), '');
    const { opener, text } = this.shapeOpen(parts);
    parts.label = this.raw(text);
    if (this.c.tokens.kind[text - 1] === T.MdStringStart) parts.markdown = true;
    const close = this.shapeClose(parts, opener, text);
    parts.shape = shapeOf(opener, this.raw(close));
  }

  /** v12 `addNode`: the node's place in the tree, or the second-root error. */
  private addNode(parts: NodeParts): void {
    const { nodeId, label, shape, indent, range, markdown } = parts;
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
    const before = this.lastEnd;
    this.lastEnd = range.end;
    // The nearest open node with a smaller level: v12's backward scan finds the same one.
    const { open } = this;
    let top = open.length;
    while (top > 0 && (open[top - 1]?.level ?? 0) >= level) top--;
    const parentOpen = open[top - 1];
    this.closeOpen(top, before);
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
    if (markdown) model.markdown = true;
    if (parent && parentOpen) {
      model.parent = parentOpen.index;
      parent.children.push(index);
    }
    this.nodes.push(model);
    this.last = model;
    const span = this.st.beginStatement('node', range.start);
    span.range.end = range.end;
    open.push({ index, level, span });
    this.checkLimits(model, range);
  }

  /** The integrator's node and depth caps (R-SEC-5): each reported once, at the first breach. */
  private checkLimits(node: OpenNode, range: Range): void {
    const { maxNodes, maxDepth } = this;
    checkLimit(this.st.diagnostics, 'maxNodes', this.nodes.length, maxNodes, 'nodes', range);
    if (node.depth > maxDepth && !this.tooDeep) {
      this.tooDeep = true;
      this.st.diagnostics.error(
        LIMIT_CODES.maxDepth,
        `Nodes are nested ${node.depth} deep here, over the limit of ${maxDepth}. The limit is set by the page or app that renders the diagram.`,
        range
      );
    }
  }

  /**
   * End the spans of the open nodes from `from` on at `at`, innermost first, and drop them:
   * each also takes the comment lines right after `at` that are indented deeper than its node
   * (its subtree's trailing comments; blank lines between them stay out of the end), as a
   * timeline section keeps its trailing comment lines (D259). One scan of those lines for all.
   */
  private closeOpen(from: number, at: number): void {
    const { open } = this;
    if (from >= open.length) return;
    const comments = this.commentsAfter(at);
    let k = 0;
    let end = at;
    for (let i = open.length - 1; i >= from; i--) {
      const node = open[i]!;
      for (let c = comments[k]; c && c.level > node.level; c = comments[++k]) end = c.end;
      this.st.endStatement(node.span, end);
    }
    open.length = from;
  }

  /**
   * The `%%` comment lines after the line holding `at`, up to the first line that is neither
   * blank nor one: each with its indent less the root's and the end of its text.
   */
  private commentsAfter(at: number): { level: number; end: number }[] {
    const { src } = this;
    const n = src.length;
    const lineEnd = (i: number) => {
      let e = i;
      while (e < n && src.charCodeAt(e) !== LF && src.charCodeAt(e) !== CR) e++;
      return e;
    };
    const out: { level: number; end: number }[] = [];
    for (let i = lineEnd(at); i < n; ) {
      i += src.charCodeAt(i) === CR && src.charCodeAt(i + 1) === LF ? 2 : 1;
      let s = i;
      while (s < n && (src.charCodeAt(s) === SPACE || src.charCodeAt(s) === TAB)) s++;
      const e = lineEnd(s);
      if (s < e && src.startsWith('%%', s) && !src.startsWith('%%{', s)) {
        let t = e;
        while (t > s && isSpace(src.charCodeAt(t - 1))) t--;
        out.push({ level: s - i - this.base, end: t });
      } else if (s < e) break;
      i = e;
    }
    return out;
  }

  /** `ICON` or `CLASS`: v12 `decorateNode`, on the last node in source order. */
  protected decoration(): void {
    const { c } = this;
    const icon = c.kind === T.Icon;
    const j = c.next();
    const text = this.raw(j);
    const inner = this.range(j);
    const range = this.decorationRange(j);
    const { end } = range;
    if (!icon) this.classSymbols(text, j);
    const target = this.lastAst;
    if (!target) {
      this.st.diagnostics.error(
        'MINDMAP_DECORATION_BEFORE_NODE',
        `${icon ? 'An `::icon(…)`' : 'A `:::class`'} line decorates the node before it, and there is none here. Write it on the line after its node.`,
        range
      );
      return;
    }
    const decoration: MindmapDecoration = { type: icon ? 'Icon' : 'Class', text, range };
    target.decorations.push(decoration);
    const node = this.last;
    // On a rejected second root: its AST node only, with no span (it has none either).
    if (!node) return;
    this.st.statement(icon ? 'icon' : 'class', range);
    this.lastEnd = end;
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
  /** The label is a markdown string. */
  markdown?: true;
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
