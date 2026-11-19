/**
 * c4-beta on the character grid (spec #730 §Layout, text output): the graph `layered` gets in
 * cells with `grid: 1` and the cell profile's metrics, and its answer read back in px so the
 * scene legacy C4's text drawing takes (`../ascii/draw.ts`) is made the way the SVG's is.
 *
 * Text is measured in cells at the profile's 8 × 16 px a cell (`../layout/cells.ts`), so every
 * measured length is a whole number of cells. On the grid a box of width `w` centred at `x`
 * covers the columns `x - w/2 + ½` to `x + w/2 - ½`, and a route point `(c, r)` is the cell
 * `c`, `r`; in px a box starts at its first cell's edge, and a point at the corner of its cell.
 * Nothing here imports the text kit: the SVG chunk carries this file.
 */
import type {
  LayoutGraph,
  LayoutGroup,
  LayoutModel,
  LayoutModelEdge,
  LayoutNode,
  Size,
  UnitProfile,
} from '@mermaid-js/core/layout';
import { graphSpacing, groupPadding, labelledEdge } from '@mermaid-js/shared/layout';
import type { C4BetaModel } from './model.ts';
import { C4_BETA_METRICS as B } from './metrics.ts';

/** What the cell graph is built from: the measured diagram. */
export interface CellParts {
  readonly model: Pick<C4BetaModel, 'direction' | 'elements'>;
  /** Each leaf's box, in px. */
  readonly leaves: ReadonlyMap<string, { readonly w: number; readonly h: number }>;
  /** Each boundary's header: its label, then the lines under it (measured text, in px). */
  readonly frames: ReadonlyMap<
    string,
    {
      readonly header: readonly (
        | { readonly text: Size & { readonly lines: readonly unknown[] } }
        | undefined
      )[];
    }
  >;
  /** Each drawn relation: its id, its ends and its label block's size in px, without padding. */
  readonly edges: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly block: Size | undefined;
  }[];
  readonly availableWidth?: number;
}

/**
 * The cell graph of `parts`. A boundary's label sits on its top border, so its group's title is
 * one row, and the `[type]` and description rows under it are padding above its content. Text
 * output trims the empty margin, so the profile's own `diagramPadding` (0) applies.
 */
export function cellGraph(parts: CellParts, units: UnitProfile): LayoutGraph {
  const { x: sx, y: sy } = units.pxPerUnit;
  const b = units.builder;
  const parents = new Map(parts.model.elements.map((e) => [e.id, e.parent]));
  const parentOf = (id: string): { parent?: string } => {
    const parent = parents.get(id);
    return parent === undefined ? {} : { parent };
  };
  const nodes = [...parts.leaves].map(
    ([id, leaf]): LayoutNode => ({
      id,
      ...parentOf(id),
      width: Math.round(leaf.w / sx),
      height: Math.round(leaf.h / sy),
    })
  );
  const groups = [...parts.frames].map(([id, frame]): LayoutGroup => {
    const [label, ...below] = frame.header;
    const rows = below.reduce((n, m) => n + (m?.text.lines.length ?? 0), 0);
    const width = Math.max(0, ...frame.header.map((m) => m?.text.width ?? 0));
    return {
      id,
      ...parentOf(id),
      padding: groupPadding(b, true, rows),
      title: { width: Math.round(width / sx), height: label ? 1 : 0 },
    };
  });
  const edges = parts.edges.map(({ id, from, to, block }) => {
    const size = block && {
      width: Math.round(block.width / sx),
      height: Math.round(block.height / sy),
    };
    return labelledEdge(b, id, from, to, size, 1);
  });
  const px = (key: 'nodeSpacing' | 'rankSpacing'): number => B[key];
  const available = parts.availableWidth;
  return {
    direction: parts.model.direction,
    nodes,
    groups,
    edges,
    ...graphSpacing(units, parts.model.direction, px),
    routing: 'stepped',
    headRoom: b.headRoom,
    diagramPadding: b.diagramPadding,
    metrics: units.engine,
    ...(units.grid !== undefined ? { grid: units.grid } : {}),
    ...(available !== undefined && Number.isFinite(available) && available > 0
      ? { availableWidth: available }
      : {}),
  };
}

/**
 * The engine's answer in cells, read in px at `size` a cell: boxes from their first cell's
 * edge, route points at the corner of their cell.
 */
export function laidInPx(laid: LayoutModel, size: { x: number; y: number }): LayoutModel {
  const { x: sx, y: sy } = size;
  const rect = <T extends { x: number; y: number; width: number; height: number }>(r: T): T => ({
    ...r,
    x: (r.x + 0.5) * sx,
    y: (r.y + 0.5) * sy,
    width: r.width * sx,
    height: r.height * sy,
  });
  const edge = (e: LayoutModelEdge): LayoutModelEdge => ({
    ...e,
    points: e.points.map((q) => ({ ...q, x: q.x * sx, y: q.y * sy })),
    ...(e.label ? { label: { x: (e.label.x + 0.5) * sx, y: (e.label.y + 0.5) * sy } } : {}),
  });
  return {
    ...laid,
    width: laid.width * sx,
    height: laid.height * sy,
    nodes: new Map([...laid.nodes].map(([id, n]) => [id, rect(n)])),
    groups: new Map(
      [...laid.groups].map(([id, g]) => [
        id,
        { ...rect(g), title: { x: (g.title.x + 0.5) * sx, y: (g.title.y + 0.5) * sy } },
      ])
    ),
    edges: new Map([...laid.edges].map(([id, e]) => [id, edge(e)])),
  };
}
