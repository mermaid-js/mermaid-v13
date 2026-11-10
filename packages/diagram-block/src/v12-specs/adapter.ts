/**
 * Test-only adapter for the ported v12 block specs (R-TEST-3): v12's `block.jison` parser and
 * its block DB, backed by the v13 parse. The specs' expectations are kept as v12 wrote them;
 * this file only translates names and shapes:
 *
 * - `block.parse(text)` throws on an error diagnostic, as v12 threw on a syntax error, else
 *   hands the model to `block.parser.yy`;
 * - `db.getBlocks()` returns the tree in v12's shape (`widthInColumns` for the span, a space
 *   as one block per cell, `id-<n>-<j>`), `db.getBlock(id)` a block by id (`root` the top level,
 *   as v12 keeps it), `db.getColumns(id)` v12's column count, `db.getEdges()` and
 *   `db.getClasses()` (a `Map`) the edges and class definitions;
 * - `db.edgeStrTo…` are v12's edge decoders, which v13's parser applies to each link.
 */
import type { Block, BlockModel } from '../model.ts';
import { parseBlock } from '../parser/index.ts';
import { arrowEnd, arrowStart, pattern, thickness } from '../parser/text.ts';

/** A block as v12's DB held it, the fields the specs read. */
interface V12Block {
  id: string;
  label: string;
  type: string;
  widthInColumns?: number;
  columns?: number;
  classes?: string[];
  styles?: string[];
  directions?: string[];
  colorIndex?: number;
  children: V12Block[];
}

function v12Blocks(blocks: readonly Block[], index: Map<string, V12Block>): V12Block[] {
  const out: V12Block[] = [];
  for (const b of blocks) {
    const node: V12Block = {
      id: b.id,
      label: b.label,
      type: b.type,
      widthInColumns: b.span,
      classes: [...b.classes],
      styles: [...b.styles],
      children: v12Blocks(b.children, index),
    };
    if (b.columns !== undefined) node.columns = b.columns;
    if (b.directions) node.directions = [...b.directions];
    if (b.colorIndex !== undefined) node.colorIndex = b.colorIndex;
    if (b.type !== 'space') {
      index.set(b.id, node);
      out.push(node);
      continue;
    }
    for (let j = 0; j < (b.cells ?? 1); j++) {
      const cell = { ...node, id: `${b.id}-${j}`, label: b.id, widthInColumns: undefined };
      index.set(cell.id, cell);
      out.push(cell);
    }
  }
  return out;
}

class BlockDB {
  private model: BlockModel | undefined;
  private blocks: V12Block[] = [];
  private readonly index = new Map<string, V12Block>();

  clear(): void {
    this.model = undefined;
    this.blocks = [];
    this.index.clear();
  }

  /** Called by `block.parse`. */
  load(model: BlockModel): void {
    this.model = model;
    this.index.clear();
    this.blocks = v12Blocks(model.blocks, this.index);
    this.index.set('root', {
      id: 'root',
      label: '',
      type: 'composite',
      columns: model.columns,
      children: this.blocks,
    });
  }

  getBlocks(): V12Block[] {
    return this.blocks;
  }

  getBlock(id: string): V12Block | undefined {
    return this.index.get(id);
  }

  /** v12 `getColumns`: the columns set, else the children count; -1 for an unknown id. */
  getColumns(id: string): number {
    const b = this.index.get(id);
    if (!b) return -1;
    if (b.columns) return b.columns;
    return b.children.length;
  }

  getEdges(): BlockModel['edges'] {
    return this.model?.edges ?? [];
  }

  getClasses(): Map<string, { id: string; styles: string[]; textStyles: string[] }> {
    const out = new Map<string, { id: string; styles: string[]; textStyles: string[] }>();
    for (const c of this.model?.classDefs ?? [])
      out.set(c.id, { id: c.id, styles: [...c.styles], textStyles: [...c.textStyles] });
    return out;
  }

  edgeStrToThickness = thickness;
  edgeStrToPattern = pattern;
  edgeStrToEdgeData = arrowEnd;
  edgeStrToEdgeStartData = arrowStart;
}

export const db = new BlockDB();

export const block = {
  parser: { yy: db as BlockDB | undefined },
  parse(text: string): void {
    const result = parseBlock(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    this.parser.yy?.load(result.model);
  },
};

/** v12's site config: v13 parses with none. */
export const configApi = {
  setSiteConfig(): void {
    // Nothing to set.
  },
  reset(): void {
    // Nothing to reset.
  },
};

/** v12's logger and diagram API, read only by skipped tests. */
export const log = { warn: (): undefined => undefined };
export const diagramAPI = { getConfig: (): Record<string, unknown> => ({}) };
