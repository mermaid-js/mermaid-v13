// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `layered.ts`, which re-exports what other files import. The
// shapes the phases of the layered layout share: the nodes and edges, the options, and the
// graph of rank-to-rank segments that the phases read. The algorithm is unchanged.
// cspell:ignore kepano lnode
//

import type { LayoutMetrics } from '../units.ts';
import type { GridHooks } from './grid.ts';

export const Kind = { Node: 0, Dummy: 1, Label: 2, StartPort: 3, EndPort: 4 } as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

export interface LNode {
  w: number;
  h: number;
  kind: Kind;
  pin: number;
  // Port's cross-flow destination; NaN if unknown. Fully hinted port ranks keep this order.
  hint: number;
  // Initial cross-flow position; NaN if unknown. Used only when every node in a rank has one.
  key: number;
  // How much of the side that edges meet may be shared out between them; 0 keeps them all at its middle.
  span: number;
  x: number;
  y: number;
  rank: number;
}

export interface LEdge {
  tail: number;
  head: number;
  minlen: number;
  labelW: number;
  labelH: number;
  tailDx: number;
  headDx: number;
  // An end that is held where its offset puts it, and takes no part in sharing out a node's side.
  tailFixed: boolean;
  headFixed: boolean;
  // Room an edge-end label takes along the flow next to each end (D102); its gap grows to it.
  tailEnd: number;
  headEnd: number;
  reversed: boolean;
  points: number[];
  labelX: number;
  labelY: number;
}

export interface LayeredOptions {
  nodeSep: number;
  edgeSep: number;
  rankSep: number;
  portSep: number;
  // Route edges at right angles, each on a track of its own across the gap between two ranks.
  tracks?: boolean;
  // Draw every edge straight from point to point: none is given a level to turn onto.
  straight?: boolean;
  // The caller sets the ends of the edges on one side of a node apart itself, so two edges
  // between the same two nodes need no bend to keep them from being drawn as one.
  apart?: boolean;
  // The room that the marker at the head of an edge takes. A rank of labels whose edges all
  // head the same way sits half of this nearer their tails, so that each label is midway along
  // the line that shows, and the curves either side of it have the same room to turn in.
  headRoom?: number;
  // Keep each group contiguous within ranks. `of` maps nodes to groups; `parent` maps groups
  // to parents. Both use -1 for none.
  groups?: { of: Int32Array; parent: Int32Array };
  // Compute cross-flow positions in `x` without full routing.
  orderOnly?: boolean;
  // The length constants (D77); the px profile's when absent.
  metrics?: LayoutMetrics;
  // The grid mode (D78, D140), absent in px. Box edges land on whole multiples of its cell and
  // every line (edge ends, bends, tracks) on the middle of a cell, and each end on a side gets a
  // cell of its own. `layered` and `compoundLayout` call a hook where a mode differs.
  grid?: GridHooks;
}

export interface LayeredResult {
  width: number;
  height: number;
  // With `orderOnly`: final crossings and crossings before grouping or reordering.
  crossings?: number;
  declared?: number;
}

// How far out of line two points may be and still count as in line.
export const IN_LINE = 0.5;
// How far apart two edges may be at both ends and still count as twins.
export const TWIN = 1;

export const End = { Held: 0, Leaves: 1, Arrives: 2 } as const;
export type End = (typeof End)[keyof typeof End];

export function isDummy(kind: number): boolean {
  return kind === Kind.Dummy || kind === Kind.Label;
}

export interface Graph {
  n: number;
  real: number;
  maxRank: number;
  W: Float64Array;
  KIND: Uint8Array;
  RANK: Int32Array;
  // Segment endpoints, and where each segment attaches on them.
  EF: Int32Array;
  ET: Int32Array;
  EFD: Float64Array;
  ETD: Float64Array;
  succStart: Int32Array;
  succE: Int32Array;
  predStart: Int32Array;
  predE: Int32Array;
  layerStart: Int32Array;
  order: Int32Array;
  pos: Int32Array;
  offsets: boolean;
  // Ranks whose order must remain fixed.
  fixed: Uint8Array;
  // What each segment's end is to the node it meets, for the ends that may move along its side.
  EFK?: Uint8Array;
  ETK?: Uint8Array;
  GRP?: Int32Array;
  groupParent?: Int32Array;
  M: LayoutMetrics;
}

// The pieces of edges that each cross one gap: where they leave the rank above and reach the
// one below, the rank above, the bend they end at (or -1 at the edge's last node), and the
// track they run across on (or -1 when they have none). Where only some pieces are given a
// level to turn onto, `wide` marks those that run far across, `levels` is how many tracks the
// group a piece belongs to takes, or 0 for a piece that needs none, and each piece's track
// counts from its group's first. A piece that is not `wide` curves from the level above its own.
export interface Pieces {
  from: number[];
  to: number[];
  rank: number[];
  lower: number[];
  track: number[];
  levels: number[];
  wide: number[];
}
