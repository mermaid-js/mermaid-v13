// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts, src/layout/compound.ts
// and src/layout/index.ts at 3a2f075. Copyright (c) 2026 kepano. MIT License: see
// THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: the grid mode (D78, D140) is one `GridHooks` object that `layered`,
// `compoundLayout` and the engine call where a mode differs. The algorithm is unchanged.
// cspell:ignore kepano cnode cnodes
//
// The grid mode of the layered engine, behind one object. `gridHooks` is the only place that
// reads the grid quantum: it gives `undefined` for px, and the pixel path never asks about the
// grid again. A hook is called where one is set.
import type {
  LayoutGraph,
  LayoutModel,
  LayoutModelEdge,
  LayoutModelNode,
  RoutePoint,
  Side,
} from '../types.ts';
import type { LayoutMetrics } from '../units.ts';
import type { CEdge, CNode } from './compound.ts';
import type { LNode } from './layered.ts';
import {
  ceilTo,
  edgeOn,
  floorTo,
  freeTop,
  midCell,
  onGrid,
  trackRows,
  widenOnGrid,
  type GridGraph,
} from './grid-layout.ts';
import { growOnGrid, gridLoop, isOwnEdge, ontoCells, roomForMembers } from './grid-model.ts';

/**
 * The grid mode (D78, D140) of the layered engine. `cell` is the quantum (1: character cells).
 * `layered` and `compoundLayout` read it from `LayeredOptions.grid`, and the engine in index.ts
 * from `gridHooks(graph.grid)`.
 */
export interface GridHooks {
  readonly cell: number;
  // Round to a whole number of cells, down or up, and to the middle of a cell.
  floor: (v: number) => number;
  ceil: (v: number) => number;
  mid: (v: number) => number;
  // `layered`: put the cross-flow positions on cells, and give the middle of each label's box.
  cross: (
    g: GridGraph,
    nodes: readonly LNode[],
    xs: Float64Array,
    heldFrom: Uint8Array,
    heldTo: Uint8Array
  ) => Float64Array;
  // `layered`: the row of each track of a gap, given the px profile's (`ideal`).
  tracks: (
    bandTop: Float64Array,
    bandBottom: Float64Array,
    below: Int32Array,
    ideal: (r: number, count: number, onTrack: number) => number
  ) => (r: number, count: number, onTrack: number) => number;
  // `compoundLayout`: the top cell of a member for the edge from its group, and the room a line
  // of such an edge keeps from the member's right corner.
  ownTop: (member: CNode, edges: CEdge[], portPitch: number) => number;
  ownLineInset: (memberW: number) => number;
  // `compoundLayout`: the box width that keeps the content centred on whole cells, and that holds
  // the labels of own edges a cell inside the frame.
  centred: (boxW: number, contentW: number) => number;
  widen: (boxW: number, contentW: number, right: number) => number;
  // The engine: a length scaled for a tight layout stays whole cells.
  scale: (v: number, by: number) => number;
  // The engine, model post-passes: room for members and sides, titles; routes onto cells;
  // self-loops; whether an edge joins a group and its own member.
  roomForMembers: (cnodes: CNode[], ends: readonly (readonly [number, number])[]) => void;
  grow: (
    graph: LayoutGraph,
    model: LayoutModel,
    rerun: (grown: LayoutGraph) => LayoutModel
  ) => { graph: LayoutGraph; model: LayoutModel };
  ontoCells: (points: RoutePoint[], from: Side, to: Side) => RoutePoint[];
  loop: (
    b: LayoutModelNode,
    below: boolean,
    label: { width: number; height: number } | undefined,
    M: LayoutMetrics,
    slot: { nth: number; count: number }
  ) => LayoutModelEdge;
  isOwnEdge: (cnodes: CNode[], a: number, b: number) => boolean;
}

/** The hooks for a quantum, or none (px) for an absent or non-positive one. */
export function gridHooks(grid: number | undefined): GridHooks | undefined {
  if (grid === undefined || !(grid > 0)) return undefined;
  return {
    cell: grid,
    floor: (v) => floorTo(v, grid),
    ceil: (v) => ceilTo(v, grid),
    mid: (v) => midCell(v, grid),
    cross: onGrid.bind(undefined, grid),
    tracks: trackRows.bind(undefined, grid),
    ownTop: (member, edges, portPitch) => freeTop(member, edges, grid, edgeOn(portPitch, grid)),
    ownLineInset: (w) => (w >= 3 * grid ? 1.5 * grid : grid / 2),
    centred: (boxW, contentW) =>
      Math.round((boxW - contentW) / grid) % 2 !== 0 ? boxW + grid : boxW,
    widen: widenOnGrid.bind(undefined, grid),
    scale: (v, by) => Math.max(grid, edgeOn(v * by, grid)),
    roomForMembers: roomForMembers.bind(undefined, grid),
    grow: growOnGrid.bind(undefined, grid),
    ontoCells: ontoCells.bind(undefined, grid),
    loop: gridLoop.bind(undefined, grid),
    isOwnEdge,
  };
}
