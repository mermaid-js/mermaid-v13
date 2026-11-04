// State's own lengths (D108, ADR-13): the shapes the shared builder metrics do not cover, with a
// `px` and a `cell` set chosen by `UnitProfile.id`. Core's `UnitProfile` gains no state section.
// The px values are v12's (`stateStart`, `choice`, `forkJoin`, `note`, `state.padding`).
import type { UnitProfile } from '@mermaid-js/core/layout';

export interface StateMetrics {
  /** Room between a state's label and its border, per side (v12 `state.padding`). */
  readonly statePad: { readonly x: number; readonly y: number };
  /** Room between a described state's title and its description lines (the divider sits in it). */
  readonly descGap: number;
  /** Diameter of a start or end pseudo-state. */
  readonly pseudo: number;
  /** Side of a choice diamond's box. */
  readonly choice: number;
  /** A fork or join bar: its length across the flow and its thickness along it. */
  readonly bar: { readonly long: number; readonly short: number };
  /** Room between a note's text and its border, per side (v12 used `flowchart.padding`). */
  readonly notePad: { readonly x: number; readonly y: number };
}

const PX: StateMetrics = Object.freeze({
  statePad: Object.freeze({ x: 8, y: 8 }),
  descGap: 8,
  pseudo: 14,
  choice: 28,
  bar: Object.freeze({ long: 70, short: 10 }),
  notePad: Object.freeze({ x: 15, y: 15 }),
});

// The px set scaled to cells (8 × 16 px): a pseudo-state or choice is a 3 × 3 text box, so its
// edge ends get a cell off its corners; a bar is one row (or column) thick.
const CELL: StateMetrics = Object.freeze({
  statePad: Object.freeze({ x: 1, y: 0 }),
  descGap: 1,
  pseudo: 3,
  choice: 3,
  bar: Object.freeze({ long: 9, short: 1 }),
  notePad: Object.freeze({ x: 1, y: 0 }),
});

export function stateMetrics(units: UnitProfile): StateMetrics {
  return units.id === 'cell' ? CELL : PX;
}

/**
 * v12's `state` config defaults the layout reads, in px (v12 `config.schema.yaml`). The plugin's
 * `configDefaults` (T5) carries the same values.
 */
export const STATE_LAYOUT_DEFAULTS = Object.freeze({
  wrappingWidth: 120,
  minNodeWidth: 120,
});
