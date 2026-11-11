/**
 * The flow family's completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds and
 * lexer mode mapped to items. Keywords are offered only when the parser tests their kind at the
 * cursor; the token before the cursor tells id kinds apart (a node after a link, a class after
 * `:::`). A diagram gives it its tables ({@link FlowCompletionDialect}): its keywords, arrows
 * and docs, what its `@{ … }` blocks take, and what it says of an id.
 *
 * Probe edges handled here (tickets/27.md): `flowchart |` at the end of the text probes as a
 * statement start (v12 lexes the blank as the header's line end), so the header line is
 * checked by position; `A --|` probes as edge text (mode `edgeText`), so the rest of the arrow
 * is offered from the link start token; shape data is one token, so the replacement range is
 * worked out from its text; label and string modes get nothing.
 *
 * And from #179: inside edge text the closing arrow is offered by how the link opened (the
 * probe may be in edge-text mode or past an unclosed `--`); an arrow glued to an id (`A-`,
 * `B <-`) lexes as part of the id or a tag, so it is found from the text.
 */
import { inKindSet, Kind } from '@mermaid-js/core/parser-kit';
import type {
  AstNode,
  CompletionItem,
  CompletionKind,
  DocumentView,
  KindSet,
  ProbeResult,
  Range,
  SymbolOccurrence,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import {
  afterDirection,
  CompletionList as Items,
  LINK_TARGETS,
  span,
  tokenBefore,
  wordRunRange,
} from './facet.ts';
import type { KeywordItem } from './facet.ts';
import { FLOW_CURVES, FLOW_DIRECTION_DOCS } from './flow-facet-tables.ts';
import type { FlowKinds } from './flow-kinds.ts';

/** What a diagram gives the family's completion. Built once a diagram, at module scope. */
export interface FlowCompletionDialect<M> {
  /** The diagram's token kinds. */
  readonly kinds: FlowKinds;
  /** Each kind's highlight category (`generated/categories.ts`). */
  readonly categories: Readonly<Record<number, string>>;
  /** Each keyword and operator kind's one-line doc (`generated/docs.ts`). */
  readonly docs: Readonly<Partial<Record<number, string>>>;
  /** What the parser reads past besides spaces (its tables' `READ_PAST`). */
  readonly readPast: KindSet;
  /** Statement and clause keywords, in the order they are offered. */
  readonly keywords: readonly KeywordItem[];
  /** Arrow forms offered where a link may start. */
  readonly arrows: readonly string[];
  /** The rest of an arrow inside edge text, by how the link was opened (`--`, `==`, `-.`). */
  readonly closers: Readonly<Record<string, readonly string[]>>;
  /** The characters an arrow's line is made of (`-=.`). */
  readonly arrowChars: string;
  /** Whether an arrow may start with `<`. */
  readonly arrowHead: boolean;
  /** The lexer modes of edge text. */
  readonly edgeTextModes: readonly string[];
  /** Kinds that end a statement besides a line break, `;`, the end and `end` (a comment token). */
  readonly separators: readonly number[];
  /** Keyword kinds after which a new id is written, so none is offered (`subgraph`). */
  readonly naming: readonly number[];
  /** What a link draws or means: `arrow`, closing edge text opened with `opened` if given. */
  linkDetail(arrow: string, opened?: string): string;
  /** The ids of the model's containers (subgraphs, flows). */
  containers(model: M): readonly string[];
  /** A used id's detail, by id. */
  idDetail(model: M): (name: string) => string | undefined;
  /** The forms offered right after the known id `word` in a chain (its bracket shapes). */
  idForms(items: Items, word: string): void;
  /**
   * What the `@{ … }` block after the id `name` (empty when none) in a statement that starts
   * with the kind `head` gives its keys to; `node` when it is a node's.
   */
  dataOwner(model: M, name: string, head: number): string;
  /** The keys a block of `owner` reads. */
  dataKeys(owner: string): readonly string[];
  /** The values to offer after `key:` in a block of `owner`. */
  dataValues(items: Items, owner: string, key: string): void;
}

/** The statement the cursor is in, up to the word being typed. */
interface Statement {
  /** Kind of its first significant token, or -1 at a statement start. */
  head: number;
  /** Kind of the last significant token before the word, or -1. */
  prev: number;
  /** Blank-separated groups after the head (`class A |` has one). */
  groups: number;
}

type IdContext = 'nodes' | 'classes' | 'none';

/** Modes in which a statement, a header or a `click` target is being written. */
const CODE_MODES: readonly string[] = /* @__PURE__ */ Object.freeze(['INITIAL', 'dir', 'click']);
const NODE_KINDS: readonly string[] = /* @__PURE__ */ Object.freeze(['node', 'subgraph']);
const CLASS_KINDS: readonly string[] = /* @__PURE__ */ Object.freeze(['class']);

/** Ids of `kinds` in first-mention order, leaving out the word being typed. */
function ids(
  items: Items,
  symbols: readonly SymbolOccurrence[],
  kinds: readonly string[],
  except: number,
  kindOf: (s: SymbolOccurrence) => CompletionKind,
  detailOf?: (name: string) => string | undefined
): void {
  for (const s of symbols) {
    if (!kinds.includes(s.kind) || s.range.start === except || s.name === '') continue;
    const detail = detailOf?.(s.name);
    items.add(s.name, kindOf(s), detail === undefined ? {} : { detail });
  }
}

/** Keys already written in `text[from, to)`, but for the one at `except`. */
function writtenKeys(text: string, from: number, to: number, except: number): Set<string> {
  const keys = new Set<string>();
  const re = /(^|[\s,{])([A-Za-z]+)[^\S\r\n]*:/g;
  const block = text.slice(from, to);
  for (let m = re.exec(block); m; m = re.exec(block)) {
    if (from + m.index + (m[1] ?? '').length !== except) keys.add(m[2] ?? '');
  }
  return keys;
}

/** One dialect's completion. */
class FlowCompletions<M> {
  private readonly T: FlowKinds;
  /** Kinds that make up an id word (the rest of the word after the cursor is replaced too). */
  private readonly idPart: ReadonlySet<number>;
  private readonly blank: ReadonlySet<number>;
  /** Where a statement ends; `end` closes a block and takes the line break after it. */
  private readonly statementEnd: ReadonlySet<number>;
  /** What may stand before the header keyword. */
  private readonly beforeHeader: ReadonlySet<number>;

  constructor(private readonly d: FlowCompletionDialect<M>) {
    const T = (this.T = d.kinds);
    this.idPart = new Set([T.NodeString, T.UnicodeText, T.Num, T.Minus, T.Down, T.Click]);
    this.blank = new Set([T.Space, Kind.Space]);
    this.statementEnd = new Set([Kind.Newline, T.Semi, T.Eof, Kind.EOF, T.End, ...d.separators]);
    this.beforeHeader = new Set([
      ...this.blank,
      Kind.Newline,
      Kind.Comment,
      Kind.Directive,
      ...d.separators,
    ]);
  }

  /** Ids, keywords and directions: a cursor inside one replaces all of it. */
  private readonly isWord = (kind: number): boolean =>
    this.idPart.has(kind) || ['Keyword', 'Constant'].includes(this.d.categories[kind] ?? '');

  private statementBefore(tokens: TokenStream, at: number): Statement {
    const { blank } = this;
    const kinds: number[] = [];
    for (let i = tokenBefore(tokens, at - 1); i >= 0; i--) {
      const k = tokens.kind[i] ?? Kind.EOF;
      if ((tokens.end[i] ?? 0) > at) continue;
      if (this.statementEnd.has(k)) break;
      // As the parser reads it: `click` heads no statement, the node id after it does.
      if (inKindSet(this.d.readPast, k)) continue;
      kinds.push(k);
    }
    kinds.reverse();
    const first = kinds.findIndex((k) => !blank.has(k));
    let groups = 0;
    for (let i = first + 1; first >= 0 && i < kinds.length; i++) {
      if (!blank.has(kinds[i] ?? -1) && blank.has(kinds[i - 1] ?? -1)) groups++;
    }
    let prev = -1;
    for (let i = kinds.length - 1; i >= 0 && prev < 0; i--) {
      const k = kinds[i] ?? -1;
      if (!blank.has(k)) prev = k;
    }
    return { head: first < 0 ? -1 : (kinds[first] ?? -1), prev, groups };
  }

  /** Whether `[from, to)` is blanks on the header line, right after the header keyword. */
  private onHeaderLine(text: string, tokens: TokenStream, from: number): boolean {
    for (let i = 0; i < tokens.length; i++) {
      const k = tokens.kind[i] ?? Kind.EOF;
      if (k === this.T.Graph) {
        const end = tokens.end[i] ?? 0;
        return end <= from && /^[^\S\r\n\u2028\u2029]*$/.test(text.slice(end, from));
      }
      if (!this.beforeHeader.has(k)) return false;
    }
    return false;
  }

  /** What an expected id is at this point of the statement. */
  private idContext(st: Statement): IdContext {
    const { T } = this;
    if (st.prev === T.StyleSeparator) return 'classes';
    if (this.d.naming.includes(st.head)) return 'none';
    switch (st.head) {
      case T.Class:
        return st.groups === 0 ? 'nodes' : 'classes';
      case T.ClassDef:
        return st.groups === 0 ? 'classes' : 'none';
      case T.Style:
        return st.groups === 0 ? 'nodes' : 'none';
      case T.LinkStyle:
      case T.Click:
        return 'none';
      default:
        return 'nodes';
    }
  }

  private arrowItem(items: Items, arrow: string, opened?: string): void {
    items.add(arrow, 'operator', {
      detail: this.d.linkDetail(arrow, opened),
      documentation: this.d.docs[this.T.Link],
    });
  }

  /** `A --|`: the rest of the arrow after a link start, replacing what was typed of it. */
  private arrowRest(text: string, tokens: TokenStream, o: number): CompletionItem[] {
    // The link start token takes the blanks after it, line breaks included: only what is typed
    // up to the cursor counts, and only when the cursor is right after it.
    const i = tokenBefore(tokens, o - 1);
    if (i < 0 || tokens.kind[i] !== this.T.StartLink || (tokens.end[i] ?? 0) < o) return [];
    const typed = text.slice(tokens.start[i], o).trimStart();
    if (typed === '' || typed !== typed.trimEnd()) return [];
    const range = span(o - typed.length, o);
    const items = new Items(typed, range);
    for (const a of this.d.arrows) if (a !== typed) this.arrowItem(items, a);
    return items.list;
  }

  /** Start of the run of arrow characters (`-`, `=`, `.`) that ends at `o`. */
  private arrowRunStart(text: string, o: number): number {
    let j = o;
    while (j > 0 && this.d.arrowChars.includes(text.charAt(j - 1))) j--;
    return j;
  }

  /**
   * `A -- text --|`, `A -. text .|`, `A -- text |`: the arrow that closes edge text, by how the
   * link was opened. Offered after a blank or a typed part of the closer, once some edge text
   * is written; undefined when the cursor is not in edge text.
   */
  private edgeTextClose(
    text: string,
    tokens: TokenStream,
    o: number
  ): CompletionItem[] | undefined {
    const { T } = this;
    let open = -1;
    for (let i = tokenBefore(tokens, o - 1); i >= 0; i--) {
      const k = tokens.kind[i] ?? Kind.EOF;
      if (k === T.StartLink) {
        open = i;
        break;
      }
      if (k === T.Link || this.statementEnd.has(k)) return undefined;
    }
    if (open < 0) return undefined;
    const opened = text.slice(tokens.start[open], tokens.end[open]).trim();
    const closers = this.d.closers[opened.slice(-2)];
    const j = this.arrowRunStart(text, o);
    const textFrom = tokens.end[open] ?? 0;
    if (!closers || j <= textFrom || text.slice(textFrom, j).trim() === '') return undefined;
    if (j === o && !/\s/.test(text.charAt(o - 1))) return [];
    const typed = text.slice(j, o);
    const items = new Items(typed, span(j, o));
    for (const c of closers) if (c !== typed) this.arrowItem(items, c, opened);
    return items.list;
  }

  /** `A-|`, `B <-|`: the arrows that start with what is typed right after an id. */
  private gluedArrow(text: string, o: number): CompletionItem[] {
    let j = this.arrowRunStart(text, o);
    if (this.d.arrowHead && text.charAt(j - 1) === '<') j--;
    if (j === o) return [];
    // Something on the line before it: the arrow's start node.
    let k = j;
    while (k > 0 && /[^\S\r\n]/.test(text.charAt(k - 1))) k--;
    if (k === 0 || /[\r\n;]/.test(text.charAt(k - 1))) return [];
    const typed = text.slice(j, o);
    const items = new Items(typed, span(j, o));
    for (const a of this.d.arrows) if (a !== typed) this.arrowItem(items, a);
    return items.list;
  }

  /**
   * Where the `@{ … }` around `o` opens (the end of its `@{`) and ends, and what it gives its
   * keys to; undefined when no `@{` token is found.
   */
  private dataBlock(
    text: string,
    tokens: TokenStream,
    model: M,
    o: number
  ): { from: number; to: number; owner: string } | undefined {
    const { T } = this;
    for (let i = tokenBefore(tokens, o - 1); i >= 0 && tokens.kind[i] === T.ShapeData; i--) {
      const start = tokens.start[i] ?? 0;
      if (!text.startsWith('@{', start)) continue;
      const id = tokenBefore(tokens, start - 1);
      const name = id >= 0 && tokens.end[id] === start ? text.slice(tokens.start[id], start) : '';
      let last = i;
      while (tokens.kind[last + 1] === T.ShapeData) last++;
      return {
        from: start + 2,
        to: tokens.end[last] ?? o,
        owner: this.d.dataOwner(model, name, this.statementBefore(tokens, start).head),
      };
    }
    return undefined;
  }

  /**
   * Inside `@{ … }`: keys at a key position, then the values of a key that takes known ones
   * (shape names after a node's `shape:`, an edge's `animate`, `animation` and `curve` values).
   */
  private shapeData(
    text: string,
    tokens: TokenStream,
    model: M,
    probe: ProbeResult
  ): CompletionItem[] {
    // Scanned back from the cursor by hand: a regex anchored at the end retries every blank of
    // a long run (pitfall 5).
    const o = probe.offset;
    const block = this.dataBlock(text, tokens, model, o);
    const from = block?.from ?? probe.prefix.start;
    const owner = block?.owner ?? 'node';
    const isSpace = (i: number) => /\s/.test(text.charAt(i));
    const back = (at: number, test: (j: number) => boolean) => {
      let i = at;
      while (i > from && test(i - 1)) i--;
      return i;
    };
    const rest = /^[\w-]*/.exec(text.slice(o, o + 64))?.[0].length ?? 0;
    // `key: va|`
    const name = back(o, (j) => /[\w-]/.test(text.charAt(j)));
    let k = back(name, isSpace);
    if (k > from && text.charAt(k - 1) === ':') {
      k = back(k - 1, isSpace);
      const at = back(k, (j) => /[A-Za-z]/.test(text.charAt(j)));
      if (at < k && (at === from || /[\s,{]/.test(text.charAt(at - 1)))) {
        const items = new Items(text.slice(name, o), span(name, o + rest));
        this.d.dataValues(items, owner, text.slice(at, k));
        return items.list;
      }
    }
    // A key: letters after the start, a `,`, a `{` or a line break (blanks between).
    const key = back(o, (j) => /[A-Za-z]/.test(text.charAt(j)));
    const blanks = back(key, isSpace);
    const atKey =
      blanks === from ||
      /[,{]/.test(text.charAt(blanks - 1)) ||
      /[\r\n]/.test(text.slice(blanks, key));
    if (!atKey) return [];
    const typed = text.slice(key, o);
    const items = new Items(typed, span(key, o + rest));
    // A key written twice is a YAML error: only the ones not in the block yet.
    const written = block ? writtenKeys(text, from, block.to, key) : new Set<string>();
    for (const k2 of this.d.dataKeys(owner)) {
      if (!written.has(k2)) items.add(k2, 'property', { insertText: `${k2}: ` });
    }
    return items.list;
  }

  /** Keywords, link targets and operators whose kind the parser tests at the cursor. */
  private byKind(items: Items, expected: ReadonlySet<number>): void {
    for (const k of this.d.keywords) {
      if (!expected.has(k.kind)) continue;
      items.keyword(k, this.d.docs[k.kind]);
    }
    if (expected.has(this.T.LinkTarget)) for (const t of LINK_TARGETS) items.add(t, 'constant');
  }

  private operators(items: Items, expected: ReadonlySet<number>): void {
    const { T } = this;
    const { docs } = this.d;
    if (expected.has(T.Link) || expected.has(T.StartLink)) {
      for (const a of this.d.arrows) this.arrowItem(items, a);
    }
    if (expected.has(T.Amp)) {
      items.add('&', 'operator', { documentation: docs[T.Amp] ?? '' });
    }
    if (expected.has(T.StyleSeparator)) {
      items.add(':::', 'operator', { documentation: docs[T.StyleSeparator] ?? '' });
    }
  }

  /** Whether `range` is non-empty and lexes as id parts only (not `end`, `style`, …). */
  private isId(tokens: TokenStream, range: Range): boolean {
    if (range.start === range.end) return false;
    for (let i = Math.max(0, tokenBefore(tokens, range.start)); i < tokens.length; i++) {
      const start = tokens.start[i] ?? 0;
      if (start >= range.end) break;
      if ((tokens.end[i] ?? 0) <= range.start) continue;
      if (!this.idPart.has(tokens.kind[i] ?? Kind.EOF)) return false;
    }
    return true;
  }

  /** Node and container ids, then the word's forms when it is a known node in a chain. */
  private nodes(
    items: Items,
    symbols: readonly SymbolOccurrence[],
    model: M,
    at: { st: Statement; word: string; typedAt: number },
    nodeKind: (s: SymbolOccurrence) => CompletionKind
  ): void {
    const { T } = this;
    const { st, word, typedAt } = at;
    ids(items, symbols, NODE_KINDS, typedAt, nodeKind, this.d.idDetail(model));
    // Right after an id in a chain (after a link or `&`, or an id used elsewhere): its forms,
    // with the id as the label. `word` is empty when it lexes as a keyword (`end`).
    if (st.head === T.Class || st.head === T.Style || word === '') return;
    const linked = st.prev === T.Link || st.prev === T.Amp || st.prev === T.Pipe;
    const known =
      linked ||
      symbols.some(
        (s) => NODE_KINDS.includes(s.kind) && s.name === word && s.range.start !== typedAt
      );
    if (!known) return;
    this.d.idForms(items, word);
  }

  complete(probe: ProbeResult, doc: DocumentView<AstNode>): CompletionItem[] {
    const { T, d } = this;
    const { text, result } = doc;
    const tokens = result.tokens;
    if (!tokens) return [];
    const model = result.model as M;
    if (probe.mode === 'shapeData') return this.shapeData(text, tokens, model, probe);
    const close = this.edgeTextClose(text, tokens, probe.offset);
    if (close) return close;
    // Right after `--`, `==` or `-.`: the rest of the arrow, whichever mode the probe ended in
    // (the link start token takes the line break after it, so the probe may be past it).
    const rest = this.arrowRest(text, tokens, probe.offset);
    if (rest.length > 0 || d.edgeTextModes.includes(probe.mode)) return rest;
    if (!CODE_MODES.includes(probe.mode)) return [];

    const word = wordRunRange(text, tokens, probe, this.isWord);
    // `A,B` is one word to the lexer: only what follows the last comma is replaced.
    const comma = text.slice(word.start, probe.offset).lastIndexOf(',');
    const range = comma >= 0 ? span(word.start + comma + 1, word.end) : word;
    const items = new Items(text.slice(range.start, probe.offset), range);
    const expected = new Set(probe.expected);
    // The header's direction: by kind, or by position at the end of the text (see above).
    if (
      expected.has(T.Dir) ||
      this.onHeaderLine(text, tokens, range.start) ||
      afterDirection(text, range.start)
    ) {
      for (const [dir, meaning] of FLOW_DIRECTION_DOCS) {
        items.add(dir, 'constant', { detail: meaning });
      }
      return items.list;
    }
    const containers = new Set(d.containers(model));
    const nodeKind = (s: SymbolOccurrence): CompletionKind =>
      containers.has(s.name) ? 'subgraph' : 'node';
    if (probe.mode === 'click') {
      ids(items, result.symbols, NODE_KINDS, word.start, nodeKind);
      return items.list;
    }
    const st = this.statementBefore(tokens, word.start);
    if (st.prev === T.Interpolate) {
      for (const curve of FLOW_CURVES) items.add(curve, 'constant');
      return items.list;
    }
    this.byKind(items, expected);
    const context = expected.has(T.NodeString) ? this.idContext(st) : 'none';
    if (context === 'classes') ids(items, result.symbols, CLASS_KINDS, word.start, () => 'class');
    else if (context === 'nodes') {
      const id = this.isId(tokens, range) ? text.slice(range.start, range.end) : '';
      this.nodes(items, result.symbols, model, { st, word: id, typedAt: word.start }, nodeKind);
    }
    this.operators(items, expected);
    // An arrow glued to the id (`A-`, `B <-`): the lexer reads it as part of the id or a tag.
    if (!expected.has(T.Graph) && st.head !== T.Graph && this.idContext(st) === 'nodes') {
      for (const item of this.gluedArrow(text, probe.offset)) {
        if (!items.list.some((x) => x.label === item.label)) items.list.push(item);
      }
    }
    return items.list;
  }
}

/** The completion function of the dialect `d`, for its language facet. */
export function flowCompletions<M>(
  d: FlowCompletionDialect<M>
): (probe: ProbeResult, doc: DocumentView<AstNode>) => CompletionItem[] {
  const completions = new FlowCompletions(d);
  return (probe, doc) => completions.complete(probe, doc);
}
