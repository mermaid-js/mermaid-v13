/**
 * The block model as v12's DB (`blockDB.ts`) built it, statement by statement in source order,
 * with D442's, D443's and D445's fixes: the parser reads the syntax and hands each statement
 * here. Block lookups go through one map, so building is linear (pitfall 11).
 */
import { checkLimit } from '@mermaid-js/core/limits';
import type { Diagnostic, ParseState, Range } from '@mermaid-js/core/parser-kit';
import * as codes from '../codes.ts';
import type { Block, BlockEdge, BlockModel, BlockType } from '../model.ts';
import type { BlockTarget } from './ast.ts';
import {
  ALSO_HERE,
  SIZE_INVALID_MESSAGE,
  styledHere,
  styleUnknownMessage,
  truncatedMessage,
} from './messages.ts';
import { arrowEnd, arrowStart, classStyles, pattern, thickness } from './text.ts';

/** D445's caps (Pele's limits). */
export const MAX_SPAN = 1_000;
export const MAX_SPACE_CELLS = 100_000;

/** A model block while the tree is built: the same fields, writable. */
export type OpenBlock = { -readonly [K in keyof Block]: Block[K] } & {
  classes: string[];
  styles: string[];
  children: OpenBlock[];
};

/** A block statement as the model reads it. */
export interface Mention {
  ast: string;
  id: string;
  type: BlockType;
  /** The quoted label, if any. */
  label: string | undefined;
  /** Set when the label was a markdown string, given without its wrapper (#1401). */
  markdown?: true;
  /** The span to keep if the block is new (undefined: 1). */
  span: number | undefined;
  /** As v12's lexer read them (blanks kept). */
  directions: string[] | undefined;
}

/** Where a new block goes: the level's list, and the statement's range (for a limit error). */
export interface Place {
  into: OpenBlock[];
  range: Range;
}

/** A link as read: its (closing) link text and label. */
export interface LinkText {
  link: string;
  label?: string;
  /** Set when the label was a markdown string, given without its wrapper (#1401). */
  markdown?: true;
}

/** An edge as the model reads it. */
export interface EdgeParts extends LinkText {
  ast: string;
  /** The edge's number among those from `start` to `end` (1, 2, …): v12's id prefix. */
  count: number;
  start: string;
  end: string;
  range: Range;
}

/** One `style` statement, applied after every statement (D443). */
interface PendingStyle {
  targets: BlockTarget[];
  styles: string;
}

export interface BuilderLimits {
  maxNodes: number;
  maxEdges: number;
}

export class ModelBuilder {
  /** The top-level blocks. */
  readonly top: OpenBlock[] = [];
  private readonly byId = new Map<string, OpenBlock>();
  /** Classes named for ids not declared yet (D442). */
  private readonly pendingClasses = new Map<string, string[]>();
  private readonly classDefs = new Map<
    string,
    { id: string; styles: string[]; textStyles: string[] }
  >();
  private readonly styles: PendingStyle[] = [];
  private readonly edges: BlockEdge[] = [];
  /** D445 occurrences, each code reported once. */
  private readonly sizeInvalid: Range[] = [];
  private readonly truncated: Range[] = [];
  private columns = -1;
  private generated = 0;
  private nextColor = 0;
  private nodes = 0;

  constructor(
    private readonly st: ParseState,
    private readonly limits: BuilderLimits
  ) {}

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** The next generated id, `id-<n>` from 1 in source order (R-ARCH-6). */
  nextId(): string {
    return `id-${++this.generated}`;
  }

  /** A span as D445 reads it: `:0` is 1, over {@link MAX_SPAN} is the cap. */
  span(value: number, range: Range): number {
    if (value === 0) {
      this.sizeInvalid.push(range);
      return 1;
    }
    if (value > MAX_SPAN) {
      this.truncated.push(range);
      return MAX_SPAN;
    }
    return value;
  }

  /** A block mention: a new block, or v12's merge into the block of that id. */
  mention(m: Mention, place: Place): void {
    const label = m.label === undefined || m.label === '' ? m.id : m.label;
    const existing = this.byId.get(m.id);
    if (existing) this.merge(existing, m.type, label, m.markdown);
    else this.create({ ...m, label }, place);
  }

  /**
   * `block:id`: a new composite, or (D442) the block of that id made a composite; the children
   * then go to that block, after the ones it has.
   */
  composite(m: Mention, place: Place): OpenBlock {
    const label = m.label ?? '';
    const existing = this.byId.get(m.id);
    if (existing) {
      this.merge(existing, 'composite', label, m.markdown);
      existing.colorIndex ??= this.nextColor++;
      return existing;
    }
    const block = this.create({ ...m, type: 'composite', label }, place);
    block.colorIndex = this.nextColor++;
    return block;
  }

  /** An anonymous `block … end` with a generated id. */
  anonymous(ast: string, id: string, place: Place): OpenBlock {
    const m: Mention = {
      ast,
      id,
      type: 'composite',
      label: '',
      span: undefined,
      directions: undefined,
    };
    const block = this.create(m, place);
    block.colorIndex = this.nextColor++;
    block.anonymous = true;
    return block;
  }

  /** `space:n` with a generated id (D445: at most {@link MAX_SPACE_CELLS} cells). */
  space(ast: string, id: string, written: number, place: Place): void {
    let cells = written;
    if (cells > MAX_SPACE_CELLS) {
      this.truncated.push(place.range);
      cells = MAX_SPACE_CELLS;
    }
    const m: Mention = {
      ast,
      id,
      type: 'space',
      label: '',
      span: undefined,
      directions: undefined,
    };
    this.create(m, place).cells = cells;
  }

  /**
   * v12's merge into an existing block: a type other than `na`, a label other than the id. The
   * label's markdown mark goes with it (#1401).
   */
  private merge(
    existing: OpenBlock,
    type: BlockType,
    label: string,
    markdown: true | undefined
  ): void {
    if (type !== 'na') existing.type = type;
    if (label === existing.id) return;
    existing.label = label;
    if (markdown) existing.markdown = true;
    else delete existing.markdown;
  }

  /** A new block, with the classes named for it before (D442). */
  private create(m: Mention, { into, range }: Place): OpenBlock {
    const block: OpenBlock = {
      ast: m.ast,
      id: m.id,
      type: m.type,
      label: m.label ?? '',
      span: m.span ?? 1,
      classes: this.pendingClasses.get(m.id) ?? [],
      styles: [],
      children: [],
    };
    if (m.directions) block.directions = m.directions.map((d) => d.trim());
    if (m.markdown) block.markdown = true;
    this.pendingClasses.delete(m.id);
    into.push(block);
    this.byId.set(m.id, block);
    checkLimit(
      this.st.diagnostics,
      'maxNodes',
      ++this.nodes,
      this.limits.maxNodes,
      'blocks',
      range
    );
    return block;
  }

  /** An edge: v12's id (`<count>-<start>-<end>`) and arrowheads from the (closing) link. */
  edge(e: EdgeParts): void {
    this.edges.push({
      ast: e.ast,
      id: `${e.count}-${e.start}-${e.end}`,
      start: e.start,
      end: e.end,
      label: e.label ?? '',
      ...(e.markdown ? { markdown: true as const } : {}),
      arrowTypeStart: arrowStart(e.link),
      arrowTypeEnd: arrowEnd(e.link),
      thickness: thickness(e.link),
      pattern: pattern(e.link),
    });
    checkLimit(
      this.st.diagnostics,
      'maxEdges',
      this.edges.length,
      this.limits.maxEdges,
      'edges',
      e.range
    );
  }

  /**
   * `columns n` for `block`'s body, or the top level's when `block` is undefined and `top` is
   * set; the last one wins (D445: `columns 0` is auto).
   */
  setColumns(written: number, range: Range, block: OpenBlock | undefined, top: boolean): void {
    let columns = written;
    if (columns === 0) {
      this.sizeInvalid.push(range);
      columns = -1;
    }
    if (block) block.columns = columns;
    else if (top) this.columns = columns;
  }

  /** v12 `addStyleClass`: a repeat adds to the first. */
  classDef(name: string, css: string): void {
    let def = this.classDefs.get(name);
    if (!def) this.classDefs.set(name, (def = { id: name, styles: [], textStyles: [] }));
    const read = classStyles(css);
    def.styles.push(...read.styles);
    def.textStyles.push(...read.textStyles);
  }

  /** v12 `setCssClass`, on ids declared later too (D442). */
  classes(targets: readonly BlockTarget[], className: string): void {
    for (const { name } of targets) {
      const block = this.byId.get(name);
      if (block) block.classes.push(className);
      else {
        const pending = this.pendingClasses.get(name);
        if (pending) pending.push(className);
        else this.pendingClasses.set(name, [className]);
      }
    }
  }

  /** A `style` statement, applied after every statement (D443). */
  style(targets: BlockTarget[], styles: string): void {
    this.styles.push({ targets, styles });
  }

  /**
   * After the last statement: every `style` in order, each replacing its blocks' styles with its
   * text split at `,` (v12 `addStyle2Node`), with one `BLOCK_STYLE_UNKNOWN` warning for ids no
   * statement declares; then D445's warnings, one per code.
   */
  finish(): void {
    const unknown: BlockTarget[] = [];
    const named = new Set<string>();
    for (const { targets, styles } of this.styles) {
      for (const t of targets) {
        const block = this.byId.get(t.name);
        if (!block) {
          unknown.push(t);
          named.add(t.name);
        } else if (styles !== '') block.styles = styles.split(',');
      }
    }
    const [first, ...rest] = unknown;
    if (first) {
      const related = rest.map((t) => ({ message: styledHere(t.name), range: t.range }));
      this.st.diagnostics.warning(
        codes.BLOCK_STYLE_UNKNOWN,
        styleUnknownMessage([...named]),
        first.range,
        related.length > 0 ? { related } : undefined
      );
    }
    this.warnOnce(codes.BLOCK_SIZE_INVALID, this.sizeInvalid, SIZE_INVALID_MESSAGE);
    this.warnOnce(
      codes.BLOCK_TRUNCATED,
      this.truncated,
      truncatedMessage(MAX_SPAN, MAX_SPACE_CELLS)
    );
  }

  /** One warning of `code` for every range in `at`: the first, the others related. */
  private warnOnce(code: string, at: readonly Range[], message: string): void {
    const [first, ...rest] = at;
    if (!first) return;
    const related = rest.map((range) => ({ message: ALSO_HERE, range }));
    this.st.diagnostics.warning(code, message, first, related.length > 0 ? { related } : undefined);
  }

  model(warnings: Diagnostic[]): BlockModel {
    return {
      blocks: this.top,
      columns: this.columns,
      edges: this.edges,
      classDefs: [...this.classDefs.values()],
      warnings,
    };
  }
}
