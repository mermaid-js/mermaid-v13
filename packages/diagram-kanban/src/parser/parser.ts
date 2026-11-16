// cspell:words LALR
/**
 * Kanban parser: recursive descent over the {@link lex} tokens (gated against v12's jison
 * lexer, #451), producing a {@link KanbanModel}, the typed AST, statement spans and diagnostics
 * (DESIGN §4.3).
 *
 * Symbols (D289): each item id is a `node` definition of its own (ids repeat and nothing refers
 * to one), recorded with the range of the id without the blanks around it; each word of a
 * `:::` line is a `class` reference; each `assigned` value is an `assignee` occurrence (the
 * first of a name its definition), so a rename spans cards. With a probe (R-LANG-7, D95) the
 * parser records what it would accept at the probed token: the header, a statement start, a
 * shape or shape data after an id, a shape's text and closer.
 *
 * The grammar is v12's `kanban.jison` (LALR), ported rule for rule; `grammar/kanban.ebnf` is
 * the normative form:
 *
 *     start     = [ SPACELINE ( SPACELINE | NL )* ] KANBAN [ NL ] ( statement stop )+
 *     stop      = ( NL | EOF | SPACELINE ) ( NL | EOF )*
 *     statement = SPACELIST [ item | ICON | CLASS ] | SPACELINE | item | ICON | CLASS
 *     item      = node [ SHAPE_DATA+ ]
 *     node      = NODE_ID [ shape ] | shape ;   shape = NODE_DSTART NODE_DESCR NODE_DEND
 *
 * So a blank or comment line is a statement where one may start, and a separator after one: an
 * item right after two of them in a row (or one right after `kanban`) is a syntax error, as in
 * v12. The parser reads the tokens jison returned; `:::`, `::icon(`, the `)` after an icon, the
 * quotes of a string and the `}` closing shape data, for which jison returns none, are skipped
 * like comments (they still give the ranges).
 *
 * v12's DB (`kanbanDb.ts`) adds errors, kept here as diagnostics after which the parse goes on
 * (R-PARSE-4): an item indented less than the first, once another item follows it; a
 * decoration before any item (a `TypeError` in v12); shape data that is not YAML, is empty
 * (`null`), or names a `shape` that is not a lower-case string. Unlike jison the parser does
 * not stop at the first error: it reports it, skips to the next line and carries on.
 */
import { inKindSet, Kind, kindSet } from '@mermaid-js/core/parser-kit';
import { STOP } from '@mermaid-js/shared/parser/support';
import type { ParseOptions, ParseResult, Range, StatementSpan } from '@mermaid-js/core/parser-kit';
import { holesIn, treeGrammar, TreeParser } from '@mermaid-js/shared/parser/tree';
import { isYamlMap, parseYaml, preprocess } from '@mermaid-js/core/preprocess';
import type {
  PreprocessResult,
  YamlMap,
  YamlOptions,
  YamlResult,
  YamlNode,
  YamlValue,
} from '@mermaid-js/core/preprocess';
import * as codes from '../codes.ts';
import type { KanbanItem, KanbanModel } from '../model.ts';
import type { KanbanData, KanbanDecoration, KanbanDocument, KanbanItemNode } from './ast.ts';
import { KINDS, lex } from './lexer.ts';
import { checkNodeLimit } from './limits.ts';
import type { Lexed } from './lexer.ts';
import { sourceOffset, wordIn } from './symbols.ts';
import { classWords, FIRST_LINE, isBlockData, isLineBreak } from './text.ts';
import { T } from './tokens.ts';

export interface KanbanParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** Item cap, columns and cards together (core `DEFAULT_LIMITS.maxNodes`, R-SEC-5). */
  maxNodes?: number;
}

export type KanbanParseResult = ParseResult<KanbanModel, KanbanDocument>;

/**
 * Comments, and the text jison matched without returning a token: `:::`, `::icon(`, the `)`
 * closing an icon, the line break after a bare `:::`, the quotes of a string and the `}`
 * closing shape data.
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
  T.MdStringEnd,
  T.ShapeDataEnd
);

// What the parser accepts after an id, for the probe (R-LANG-7, D95). A constant, so a parse
// without a probe allocates nothing for it.
/** What may follow an item's id. */
const AFTER_ID = [T.NodeDStart, T.ShapeDataStart];
/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset: blanks
 * and blank lines (the indent before an item), the shape delimiters, a shape's text (after it
 * comes the closer) and the `@{` of shape data.
 */
const PROBE_FOLLOWS = kindSet(
  T.SpaceList,
  T.SpaceLine,
  T.NodeDStart,
  T.NodeDescr,
  T.NodeDEnd,
  T.ShapeDataStart
);

/** The kinds jison names `SHAPE_DATA`. */
const SHAPE_DATA = kindSet(T.ShapeDataStart, T.ShapeData, T.ShapeDataQuote, T.ShapeDataStr);

const ONE_HEADER = '`kanban` starts the diagram and comes only once';
const BRACE_HINT = 'a `{` starts a shape only as `{{text}}`, and shape data as `@{ … }`';
const AT_HINT = 'an `@` starts shape data only as `@{ … }`';
const DATA_HINT = 'shape data goes right after an item, as in `id@{ ticket: T-1 }`';

const GRAMMAR = /* @__PURE__ */ treeGrammar<Lexed>({
  lex,
  kinds: KINDS,
  skipped: SKIPPED,
  probeFollows: PROBE_FOLLOWS,
  header: ['`kanban`'],
  headerHint: 'a kanban board starts with `kanban`',
  statement: ['an item such as `todo` or `id[text]`', 'a `::icon(…)` or `:::class` line'],
  shapeText: ['the text of the item'],
  decorationHint: 'an `::icon(…)` or `:::class` goes on a line of its own, after its item',
  oneNodeHint: 'each item goes on a line of its own',
  afterBlankHint:
    'remove a blank or comment line above it: a line may not follow two of them in a row, or one right after `kanban`',
});

/** v12 `encodeEntities` placeholders, kept in YAML text so `#35;` reads as text, not a comment. */
const ENTITY = /&(#?)(\w+);/g;
const PLACEHOLDER = /ﬂ°°|ﬂ°|¶ß/g;
const PLACEHOLDER_TEXT: Readonly<Record<string, string>> = { 'ﬂ°°': '&#', 'ﬂ°': '&', '¶ß': ';' };

/** Parse a kanban diagram. Never throws: problems are error diagnostics. */
export function parseKanban(src: string, options: KanbanParseOptions = {}): KanbanParseResult {
  return new KanbanParser(src, options).parse();
}

/** A model item while the board is built: the same fields, writable. */
type OpenItem = { -readonly [K in keyof KanbanItem]: KanbanItem[K] };

/** How an item's data is read as YAML, and what the ranges of the read point into. */
interface YamlRead {
  /** The text `parseYaml` reads: the source (in place), or v12's wrapped data text. */
  text: string;
  options: YamlOptions;
  /** The read is of the source, so its ranges are source ranges. */
  inPlace: boolean;
  /** Entities were read as v12's placeholders, to be turned back into `&…;`. */
  placed: boolean;
  /** The data text v12 read (between `@{` and `}`), and the source range it came from. */
  data: string;
  inner: Range;
  /** Where the data text starts in {@link text} when the read is not in place (its wrapping). */
  shift: number;
}

/** Data read as a mapping, with the read it came from and its YAML tree (value ranges). */
interface ItemData {
  value: YamlMap;
  read: YamlRead;
  root: YamlNode | null;
}

/** The parts of an item statement (pitfall 10). */
interface ItemParts {
  nodeId: string | undefined;
  text: string;
  /** The indent width as written. */
  indent: number;
  range: Range;
  data?: KanbanData;
  /** The data's mapping, when it was read and is one. */
  value?: ItemData;
}

/**
 * One parse: the shared rules down to a statement ({@link TreeParser}), and kanban's item,
 * shape data and decoration rules. A rule that fails records a diagnostic and throws
 * {@link STOP}, and the statement loop recovers.
 */
class KanbanParser extends TreeParser<Lexed, PreprocessResult> {
  /** How many `assigned` values of each name were read: the first is the definition. */
  private readonly assignees = new Map<string, number>();
  private readonly children: KanbanItemNode[] = [];
  private readonly items: OpenItem[] = [];
  private readonly columns: { item: number; cards: number[] }[] = [];
  /**
   * The open column's statement span. It runs to the line before the next column (blank and
   * comment lines included, as a timeline section, D259), the last one to the end of the text.
   */
  private columnSpan: StatementSpan | undefined;
  /** Items indented less than the first, not reported yet: v12 throws at the next item. */
  private readonly shallow: { label: string; range: Range }[] = [];
  /** The first item's indent; v12's section level. */
  private base = 0;
  /** The model item the next decoration applies to: the last item added. */
  private last: OpenItem | undefined;
  /** The AST node of the last item statement. */
  private lastAst: KanbanItemNode | undefined;

  constructor(
    src: string,
    private readonly options: KanbanParseOptions
  ) {
    const given = options.preprocessed;
    super(src, given ?? preprocess(src), !given, GRAMMAR, options.probe);
  }

  parse(): KanbanParseResult {
    this.start();
    this.document();
    if (this.columnSpan) this.st.endStatement(this.columnSpan, this.src.length);
    // A misplaced indent is reported when the item after it is read: keep source order.
    this.st.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    const model = { items: this.items, columns: this.columns };
    return this.finish(model, this.children, this.options);
  }

  // ---- tokens -------------------------------------------------------------------------

  /** A token's text as v12's parser read it (`Lexed.text`). */
  protected raw(j = this.c.pos): string {
    return this.lexed.text(j);
  }

  /**
   * Each word of a `:::` line: a class reference; the words rename together (D289). Where the
   * source differs from v12's text (a directive or comment cut out of the line, an entity),
   * each word is looked up in the source in order; one not found there (and every one after
   * it) keeps the token's range, which the service drops.
   */
  private classSymbols(text: string, j: number): void {
    const r = this.range(j);
    const same = this.src.slice(r.start, r.end) === text;
    const holes = same ? [] : holesIn(this.view, r);
    let from = r.start;
    for (const { word: name, at: index } of classWords(text)) {
      let range = r;
      if (same) range = { start: r.start + index, end: r.start + index + name.length };
      else if (from >= 0) {
        // After a word not found (an entity in it), the rest keep the token's range: each
        // lookup then stays short, so the line is read in linear time.
        const at = wordIn(this.src, name, from, r, holes);
        if (at >= 0) range = { start: at, end: (from = at + name.length) };
        else from = -1;
      }
      this.st.symbol(name, 'class', range, 'ref');
    }
  }

  /**
   * The item's `assigned` value as an `assignee` occurrence named `name` (the model's text):
   * the value's range in the YAML tree (quotes included, which the service reads through),
   * mapped to the source; the whole data block, which the service drops, when it cannot be.
   */
  private assigneeSymbol(name: string, data: ItemData, block: Range): void {
    const { root, read } = data;
    const pair = root?.kind === 'map' ? root.pairs.find((p) => p.key === 'assigned') : undefined;
    const r = pair?.value?.range;
    const range = (r && this.sourceRangeOf(read, r)) ?? block;
    const n = (this.assignees.get(name) ?? 0) + 1;
    this.assignees.set(name, n);
    this.st.symbol(name, 'assignee', range, n === 1 ? 'def' : 'ref');
  }

  /**
   * The source range of `r`, a range of `read.text`: itself for a read in place; else through
   * v12's wrapping and its line-break normalisation, when the data text is the source's
   * otherwise (no entity, removed span or `<br/>` in it); else undefined.
   */
  private sourceRangeOf(read: YamlRead, r: Range): Range | undefined {
    if (read.inPlace) return r;
    if (read.placed || r.start < read.shift || r.end <= r.start) return undefined;
    const { src } = this;
    const { data, inner } = read;
    const start = sourceOffset(src, inner.start, inner.end, data, r.start - read.shift);
    const last = sourceOffset(src, inner.start, inner.end, data, r.end - read.shift - 1);
    return start < 0 || last < 0 ? undefined : { start, end: last + 1 };
  }

  private isData(k: number): boolean {
    return inKindSet(SHAPE_DATA, k);
  }

  // ---- errors and recovery ------------------------------------------------------------

  /** What a message about token `j` names: the decoration or data run it starts. */
  protected override namedRange(j: number): Range {
    const k = this.c.tokens.kind[j] ?? Kind.EOF;
    if (k === T.Icon || k === T.Class) return this.decorationRange(j);
    if (this.isData(k)) return { start: this.range(j).start, end: this.dataEnd(j) };
    return this.range(j);
  }

  /** The source text of the shape data run token `j` starts. */
  protected override runText(j: number, kind: number): string | undefined {
    if (!this.isData(kind)) return undefined;
    return this.src.slice(this.range(j).start, this.dataEnd(j));
  }

  /** The end of the shape data run from token `j`, past its closing `}`. */
  private dataEnd(j: number): number {
    const t = this.c.tokens;
    let end = this.range(j).end;
    for (let i = j; i < t.length; i++) {
      const k = t.kind[i] ?? Kind.EOF;
      if (!this.isData(k) && k !== T.ShapeDataEnd && k !== Kind.Comment && k !== Kind.Directive)
        break;
      end = t.end[i] ?? end;
    }
    return end;
  }

  /** The hint for an unexpected token of kind `k` where a statement or line break was due. */
  protected hintFor(k: number): string | undefined {
    if (k === T.Kanban) return ONE_HEADER;
    if (this.isData(k)) return DATA_HINT;
    if (k === Kind.Error) return this.src.charAt(this.c.start) === '@' ? AT_HINT : BRACE_HINT;
    return undefined;
  }

  // ---- grammar ------------------------------------------------------------------------

  /** `node [ shapeData ]`: `nodeWithId` (an id, then an optional shape) or `nodeWithoutId`. */
  protected node(indent: number): void {
    const { c } = this;
    const first = c.pos;
    const nodeId = this.nodeId(AFTER_ID);
    const parts: ItemParts = {
      nodeId,
      text: nodeId ?? '',
      indent,
      range: this.range(first),
    };
    // An item that fails inside its shape is still added, with the text read so far, so that
    // the decorations and cards after it see it: one error, one diagnostic.
    let failed = false;
    try {
      if (c.kind === T.NodeDStart) {
        this.shape(parts);
        c.tested(T.ShapeDataStart);
      }
      if (this.isData(c.kind)) this.shapeData(parts);
    } catch (error) {
      if (error !== STOP) throw error;
      failed = true;
    }
    this.addItem(parts);
    if (failed) throw STOP;
  }

  /** `NODE_DSTART NODE_DESCR NODE_DEND`, into `parts` as far as it gets. */
  private shape(parts: ItemParts): void {
    const { opener, text } = this.shapeOpen(parts);
    parts.text = this.raw(text);
    this.shapeClose(parts, opener, text);
  }

  /**
   * v12's `<NODE>.+` at a `}`: the rest of the line is text, and so is all after it up to a
   * closer, maybe the rest of the board.
   */
  protected override unclosedShape(closer: string, text: number): void {
    const { c } = this;
    if (this.raw(text).startsWith('}')) this.swallowed(closer, text);
    if (c.kind === T.NodeDescr && this.raw(c.pos).startsWith('}')) this.swallowed(closer, c.pos);
  }

  /**
   * A `}` in a shape's text at token `from` took the rest of its line, and the text ran on past
   * it (v12's tokens): report the shape as not closed, over all the text read into it, so the
   * author sees why the items there are missing.
   */
  private swallowed(closer: string, from: number): never {
    const t = this.c.tokens;
    let last = from;
    for (let j = this.nextSignificant(from); t.kind[j] === T.NodeDescr; j = this.nextSignificant(j))
      last = j;
    const range = { start: this.range(from).start, end: this.range(last).end };
    const lines = this.lineOf(range.end) - this.lineOf(range.start);
    const next = t.kind[this.nextSignificant(last)];
    let reach = 'the end of its line';
    if (lines > 0)
      reach =
        next === T.NodeDEnd
          ? `the closer on line ${this.lineOf(range.end)}, taking in the items before it`
          : 'the end of the board, taking in every item after it';
    const head = FIRST_LINE.exec(this.src.slice(range.start, range.end))?.[0] ?? '';
    const shown = head.length > 24 ? `${head.slice(0, 24)}…` : head;
    this.st.diagnostics.error(
      'UNEXPECTED',
      `Expected ${closer}, got \`${shown}\`: a \`}\` in an item's text takes the rest of its line into the text, as in mermaid@12, so the shape is not closed and its text runs on to ${reach}. Write the text in quotes, as \`["a}b"]\`, or close the shape before the \`}\`.`,
      range,
      { expected: [closer] }
    );
    throw STOP;
  }

  /**
   * `shapeData`: the `SHAPE_DATA` tokens joined, as v12's rule did (so back-to-back blocks are
   * one), then read as YAML the way `addNode` did. Bad YAML, empty data and a bad `shape` are
   * semantic errors: they are reported, the item keeps no data, and the statement goes on.
   */
  private shapeData(parts: ItemParts): void {
    const { c } = this;
    const opener = this.range(c.pos);
    let text = '';
    let end = opener.end;
    let closed = false;
    while (this.isData(c.kind)) {
      text += this.raw(c.pos);
      end = c.end;
      c.next();
      // The `}` jison returned no token for (skipped by the cursor), if the block was closed.
      const close = this.beside(c.pos, -1, T.ShapeDataEnd);
      closed = close >= 0;
      if (closed) end = this.range(close).end;
    }
    const range = { start: opener.start, end };
    parts.data = { text, range };
    parts.range = { start: parts.range.start, end };
    if (!closed) {
      if (c.kind === Kind.EOF) this.endsOpen();
      this.fail(['`}`']);
    }
    parts.value = this.readData(text, range);
  }

  /** v12 `addNode`'s YAML read of `text`, the data at `range`: the mapping, or undefined. */
  private readData(text: string, range: Range): ItemData | undefined {
    const read = this.yamlInput(text, range);
    // One read in editor mode gives the tree (value ranges) too, and reads valid YAML as the
    // default mode does; with an error, the default mode's diagnostics are v12's.
    const tree = parseYaml(read.text, { ...read.options, tree: true });
    const result = tree.diagnostics.some((d) => d.severity === 'error')
      ? parseYaml(read.text, read.options)
      : tree;
    if (this.yamlErrors(result, read, range)) return undefined;
    const value = read.placed ? fromPlaceholders(result.value) : result.value;
    if (value === null) {
      this.st.diagnostics.error(
        codes.KANBAN_DATA_EMPTY,
        'The `@{ … }` data is empty or `null`. Write `key: value` pairs in it, such as `ticket: T-1`, or remove it.',
        range
      );
      return undefined;
    }
    // v12 ignored a scalar or a list (only `null` made it throw).
    if (!isYamlMap(value) || !this.shapeOk(value.shape, range)) return undefined;
    return { value, read, root: tree.root };
  }

  /**
   * What `parseYaml` reads for the data `text` at `range`: the source in place when the text is
   * the source's, so diagnostic ranges are exact; else v12's wrapping of it (`{\n<data>\n}` on
   * one line, `<data>\n` over several), with `#name;` entities as v12's placeholders.
   */
  private yamlInput(text: string, range: Range): YamlRead {
    const { src } = this;
    const inner = { start: range.start + 2, end: range.end - 1 };
    const multiline = isBlockData(text);
    // v12 parsed `{\n<data>\n}`; a `#` comment reads differently without those newlines.
    if (src.slice(inner.start, inner.end) === text && !text.includes('#')) {
      const options = multiline ? inner : { start: range.start + 1, end: range.end };
      return { text: src, options, inPlace: true, placed: false, data: text, inner, shift: 0 };
    }
    // `#name;` entities read `&name;` (`cook`); v12 read its placeholders, which YAML takes as
    // plain text (no `#` comment, no `&` anchor).
    const placed = /#\w+;/.test(src.slice(range.start, range.end));
    const data = placed
      ? text.replace(ENTITY, (_m, num: string, name: string) =>
          num ? `ﬂ°°${name}¶ß` : `ﬂ°${name}¶ß`
        )
      : text;
    const wrapped = multiline ? data + '\n' : `{\n${data}\n}`;
    const shift = multiline ? 0 : 2;
    return { text: wrapped, options: {}, inPlace: false, placed, data: text, inner, shift };
  }

  /**
   * Record the YAML diagnostics of `result`: errors as `SHAPE_DATA` (over the whole block when
   * the read was not in place). Whether there was an error.
   */
  private yamlErrors(result: YamlResult, read: YamlRead, range: Range): boolean {
    let failed = false;
    for (const d of result.diagnostics) {
      const r = read.inPlace ? d.range : range;
      if (d.severity === 'error') {
        this.st.diagnostics.error('SHAPE_DATA', d.message, r);
        failed = true;
      } else this.st.diagnostics.warning(d.code, d.message, r);
    }
    return failed;
  }

  /** v12's shape check: a set `shape` must be a lower-case string with no `_`; else an error. */
  private shapeOk(shape: YamlValue | undefined, range: Range): boolean {
    if (shape === undefined || !truthy(shape)) return true;
    if (typeof shape === 'string' && shape === shape.toLowerCase() && !shape.includes('_'))
      return true;
    this.st.diagnostics.error(
      codes.KANBAN_SHAPE,
      `No such shape: ${jsString(shape)}. Shape names are lower case, with no \`_\`; a card's shape is ignored, so the \`shape\` key can be removed.`,
      range
    );
    return false;
  }

  /** The source text of the `priority` value in `data`, as the author wrote it. */
  private priorityText({ read, root }: ItemData): string {
    const pair = root?.kind === 'map' ? root.pairs.find((p) => p.key === 'priority') : undefined;
    const r = pair?.value?.range;
    if (!r) return '';
    const text = valueText(read.text, r.start, r.end);
    return read.placed ? entitiesBack(text) : text;
  }

  /** v12 `addNode`: the item's column, its data, and the misplaced-indent error. */
  private addItem(parts: ItemParts): void {
    const { nodeId, text, indent, range, data, value } = parts;
    const id = nodeId ?? text;
    const node: KanbanItemNode = {
      id: this.st.ids.node(id.trim()),
      type: 'Item',
      range,
      text,
      indent,
      decorations: [],
    };
    if (nodeId !== undefined) node.nodeId = nodeId;
    if (data) node.data = data;
    this.children.push(node);
    this.lastAst = node;
    const first = this.items.length === 0;
    if (first) this.base = indent;
    // v12's `getSection` throws at any item after one indented less than the first.
    for (const s of this.shallow.splice(0)) {
      this.st.diagnostics.error(
        codes.KANBAN_ITEM_WITHOUT_COLUMN,
        `Items without section detected, found section ("${s.label}"): it is indented less than the first column. Indent it as deep as the columns, or deeper for a card.`,
        s.range,
        { related: [{ message: 'mermaid@12 rejects the board from this item on', range }] }
      );
    }
    const isColumn = first || indent === this.base;
    const item: OpenItem = {
      ast: node.id,
      id,
      label: text,
      level: indent,
      isColumn,
      column: isColumn ? this.columns.length : this.columns.length - 1,
      classes: [],
    };
    if (value) {
      applyData(item, value.value, () => this.priorityText(value));
      if (item.assigned !== undefined && data)
        this.assigneeSymbol(item.assigned, value, data.range);
    }
    if (indent < this.base) this.shallow.push({ label: item.label, range });
    const index = this.items.length;
    this.items.push(item);
    this.last = item;
    checkNodeLimit(this.st, this.items.length, this.options.maxNodes, range);
    if (isColumn) {
      if (this.columnSpan) this.endColumn(this.columnSpan, range.start);
      this.columns.push({ item: index, cards: [] });
      const span = (this.columnSpan = this.st.beginStatement('column', range.start));
      span.range.end = range.end;
      return;
    }
    const column = this.columns[item.column];
    if (column) {
      item.parentId = this.items[column.item]?.id;
      column.cards.push(index);
    }
    this.st.statement('card', range);
  }

  /** End the column `span` at the start of the line holding `at`, the next column's start. */
  private endColumn(span: StatementSpan, at: number): void {
    let end = at;
    while (end > span.range.end && !isLineBreak(this.src.charCodeAt(end - 1))) end--;
    this.st.endStatement(span, Math.max(end, span.range.end));
  }

  /** `ICON` or `CLASS`: v12 `decorateNode`, on the last item in source order. */
  protected decoration(): void {
    const { c } = this;
    const icon = c.kind === T.Icon;
    const j = c.next();
    const text = this.raw(j);
    const range = this.decorationRange(j);
    if (!icon) this.classSymbols(text, j);
    const target = this.lastAst;
    const item = this.last;
    if (!target || !item) {
      this.st.diagnostics.error(
        codes.KANBAN_DECORATION_BEFORE_ITEM,
        `${icon ? 'An `::icon(…)`' : 'A `:::class`'} line decorates the item before it, and there is none here. Write it on the line after its item.`,
        range
      );
      return;
    }
    const decoration: KanbanDecoration = { type: icon ? 'Icon' : 'Class', text, range };
    target.decorations.push(decoration);
    this.st.statement(icon ? 'icon' : 'class', range);
    if (icon) item.icon = text;
    else item.classes = classWords(text).map((w) => w.word);
  }
}

/** JavaScript truthiness of a YAML value, as v12's `if (doc?.x)` tested it. */
const truthy = (v: YamlValue | undefined): boolean =>
  v !== undefined && v !== null && v !== false && v !== 0 && v !== '' && !Number.isNaN(v);

/** A YAML value as JavaScript's `String()` and `toString()` write it (`[x, y]` is `x,y`). */
function jsString(v: YamlValue): string {
  if (Array.isArray(v)) return v.map((x) => (x === null ? '' : jsString(x))).join(',');
  if (typeof v === 'object' && v !== null) return '[object Object]';
  return String(v);
}

/**
 * `addNode`'s reading of the data `doc` onto `item`. A priority that is not a string keeps its
 * source text, from `priorityText`.
 */
function applyData(item: OpenItem, doc: YamlMap, priorityText: () => string): void {
  if (truthy(doc.label)) item.label = jsString(doc.label ?? '');
  if (truthy(doc.icon)) item.icon = jsString(doc.icon ?? '');
  if (truthy(doc.assigned)) item.assigned = jsString(doc.assigned ?? '');
  if (truthy(doc.ticket)) item.ticket = jsString(doc.ticket ?? '');
  const priority = doc.priority;
  if (priority === undefined || !truthy(priority)) return;
  const text = typeof priority === 'string';
  item.priority = text ? priority : priorityText();
  item.priorityKind = text ? 'text' : 'other';
}

/**
 * The YAML text `src[start, end)` of one value, standing on its own: lines after the first
 * lose the indent they share with it.
 */
function valueText(src: string, start: number, end: number): string {
  const column = start - (src.lastIndexOf('\n', start - 1) + 1);
  const lines = (' '.repeat(column) + src.slice(start, end)).split('\n');
  const indents = lines.filter((l) => l.trim() !== '').map((l) => l.length - l.trimStart().length);
  const cut = Math.min(...indents);
  return lines.map((l) => l.slice(cut)).join('\n');
}

/** `s` with v12's entity placeholders turned back into `&…;`. */
const entitiesBack = (s: string): string => s.replace(PLACEHOLDER, (m) => PLACEHOLDER_TEXT[m] ?? m);

/** `value` with v12's entity placeholders in its strings and keys turned back into `&…;`. */
function fromPlaceholders(value: YamlValue): YamlValue {
  if (typeof value === 'string') return entitiesBack(value);
  if (Array.isArray(value)) return value.map(fromPlaceholders);
  if (typeof value !== 'object' || value === null) return value;
  const out: YamlMap = {};
  for (const [k, v] of Object.entries(value)) out[entitiesBack(k)] = fromPlaceholders(v);
  return out;
}
