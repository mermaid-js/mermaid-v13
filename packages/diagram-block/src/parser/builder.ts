/**
 * The block model as v12's DB (`blockDB.ts`) built it, statement by statement in source order,
 * with D442's, D443's and D445's fixes: the parser reads the syntax and hands each statement
 * here. Block lookups go through one map, so building is linear (pitfall 11).
 */
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import type { Diagnostic, ParseState, Range } from '@mermaid-js/core/parser-kit';
import * as codes from '../codes.ts';
import type { Block, BlockEdge, BlockModel, BlockType } from '../model.ts';
import type { BlockTarget } from './ast.ts';
import { arrowEnd, arrowStart, classStyles, listOf, pattern, thickness } from './text.ts';

/** D445's caps (Pele's limits). */
export const MAX_SPAN = 1_000;
export const MAX_SPACE_CELLS = 100_000;

/** A model block while the tree is built: the same fields, writable. */
export type OpenBlock = { -readonly [K in keyof Block]: Block[K] } & {
  classes: string[];
  styles: string[];
  children: OpenBlock[];
};

/** A block mention as the model reads it. */
export interface Mention {
  ast: string;
  id: string;
  type: BlockType;
  /** The quoted label, if any. */
  label: string | undefined;
  /** The span to keep if the block is new (undefined: 1). */
  span: number | undefined;
  /** As v12's lexer read them (blanks kept). */
  directions: string[] | undefined;
}

/** A link as read: its (closing) link text and label. */
export interface LinkText {
  link: string;
  label?: string;
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
  /** Edges between each `start-end` pair, for v12's ids. */
  private readonly edgeCount = new Map<string, number>();
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

  /** A block mention: a new block in `into`, or v12's merge into the block of that id. */
  mention(m: Mention, into: OpenBlock[], range: Range): void {
    const label = m.label === undefined || m.label === '' ? m.id : m.label;
    const existing = this.byId.get(m.id);
    if (existing) {
      this.merge(existing, m.type, label);
      return;
    }
    const block = this.create(m.ast, m.id, m.type, label, into, range);
    block.span = m.span ?? 1;
    if (m.directions) block.directions = m.directions.map((d) => d.trim());
  }

  /**
   * `block:id`: a new composite in `into`, or (D442) the block of that id made a composite; the
   * children then go to that block, after the ones it has.
   */
  composite(m: Mention, into: OpenBlock[], range: Range): OpenBlock {
    const label = m.label ?? '';
    const existing = this.byId.get(m.id);
    if (existing) {
      this.merge(existing, 'composite', label);
      existing.colorIndex ??= this.nextColor++;
      return existing;
    }
    const block = this.create(m.ast, m.id, 'composite', label, into, range);
    block.colorIndex = this.nextColor++;
    if (m.span !== undefined) block.span = m.span;
    if (m.directions) block.directions = m.directions.map((d) => d.trim());
    return block;
  }

  /** An anonymous `block … end` with the generated id `id`. */
  anonymous(ast: string, id: string, into: OpenBlock[], range: Range): OpenBlock {
    const block = this.create(ast, id, 'composite', '', into, range);
    block.colorIndex = this.nextColor++;
    return block;
  }

  /** `space:n` with the generated id `id` (D445: at most {@link MAX_SPACE_CELLS} cells). */
  space(ast: string, id: string, written: number, into: OpenBlock[], range: Range): void {
    let cells = written;
    if (cells > MAX_SPACE_CELLS) {
      this.truncated.push(range);
      cells = MAX_SPACE_CELLS;
    }
    this.create(ast, id, 'space', '', into, range).cells = cells;
  }

  /** v12's merge into an existing block: a type other than `na`, a label other than the id. */
  private merge(existing: OpenBlock, type: BlockType, label: string): void {
    if (type !== 'na') existing.type = type;
    if (label !== existing.id) existing.label = label;
  }

  /** A new block in `into`, with the classes named for it before (D442). */
  private create(
    ast: string,
    id: string,
    type: BlockType,
    label: string,
    into: OpenBlock[],
    range: Range
  ): OpenBlock {
    const block: OpenBlock = {
      ast,
      id,
      type,
      label,
      span: 1,
      classes: this.pendingClasses.get(id) ?? [],
      styles: [],
      children: [],
    };
    this.pendingClasses.delete(id);
    into.push(block);
    this.byId.set(id, block);
    if (++this.nodes === this.limits.maxNodes + 1) {
      this.st.diagnostics.error(
        LIMIT_CODES.maxNodes,
        `The diagram has more than ${this.limits.maxNodes} blocks, the limit. The limit is set by the page or app that renders the diagram.`,
        range
      );
    }
    return block;
  }

  /** An edge from `start` to `end`: v12's id and arrowheads from the (closing) link. */
  edge(ast: string, start: string, end: string, link: LinkText, range: Range): void {
    const key = `${start}-${end}`;
    const count = (this.edgeCount.get(key) ?? 0) + 1;
    this.edgeCount.set(key, count);
    this.edges.push({
      ast,
      id: `${count}-${key}`,
      start,
      end,
      label: link.label ?? '',
      arrowTypeStart: arrowStart(link.link),
      arrowTypeEnd: arrowEnd(link.link),
      thickness: thickness(link.link),
      pattern: pattern(link.link),
    });
    if (this.edges.length === this.limits.maxEdges + 1) {
      this.st.diagnostics.error(
        LIMIT_CODES.maxEdges,
        `The diagram has more than ${this.limits.maxEdges} edges, the limit. The limit is set by the page or app that renders the diagram.`,
        range
      );
    }
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
      const ids = [...named].map((n) => `\`${n}\``);
      const one = ids.length === 1;
      const related = rest.map((t) => ({
        message: `\`${t.name}\` is styled here`,
        range: t.range,
      }));
      this.st.diagnostics.warning(
        codes.BLOCK_STYLE_UNKNOWN,
        `\`style\` names ${one ? 'a block' : 'blocks'} the diagram does not have: ${listOf(ids)}. Declare ${one ? 'it' : 'them'}, or check the spelling.`,
        first.range,
        related.length > 0 ? { related } : undefined
      );
    }
    this.once(
      codes.BLOCK_SIZE_INVALID,
      this.sizeInvalid,
      '`columns 0` reads as `columns auto` and a span `:0` as `:1`, as mermaid@12 could not draw them.'
    );
    this.once(
      codes.BLOCK_TRUNCATED,
      this.truncated,
      `A span is at most ${MAX_SPAN} columns and a \`space\` at most ${MAX_SPACE_CELLS} cells; larger ones are cut to that.`
    );
  }

  /** One warning of `code` for every range in `at`: the first, the others related. */
  private once(code: string, at: readonly Range[], message: string): void {
    const [first, ...rest] = at;
    if (!first) return;
    const related = rest.map((range) => ({ message: 'also here', range }));
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
