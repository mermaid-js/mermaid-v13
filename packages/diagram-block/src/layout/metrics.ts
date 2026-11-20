/**
 * The block layout's px constants (spec #521 §Package and contract, pitfall 13): one table. No
 * other file in `layout/` writes a length literal (conformance's
 * `block-layout-literals.spec.ts`). The shapes' own geometry (the flowchart copy's minimum
 * widths and cap heights, v12's arrow factors) is in `../shapes/`.
 */

export interface BlockMetrics {
  /**
   * `block.padding`'s default (v12 `layout.ts`, `config.schema.yaml`): the gap between cells
   * and the inset of a grid in its container, the leaves' label padding, and the multiple the
   * classic themes' shape padding is given in (D152).
   */
  readonly padding: number;
  /** The corner radius of a round block (v12 `getNodeFromBlock`: `rx = ry = 5`). */
  readonly roundRadius: number;
  /** The margin around everything drawn (v12's viewBox: 5 px each side). */
  readonly margin: number;
  /**
   * A self-loop (D441), in degrees: it leaves the outline on the ray this far right of straight
   * up and comes back on the ray this far above straight right, …
   */
  readonly loopAngle: number;
  /** … its control points this far out along those rays, so the loop stands clear. */
  readonly loopReach: number;
  /**
   * How many times the grid sizes a block with children at most (`grid.ts`): v12 sized one at
   * depth d 2^d times, so the grid is v12's wherever composites nest at most 4 deep.
   */
  readonly maxSizings: number;
  /**
   * The largest `block.padding` laid out (D445, D226): a larger one is cut to it with one
   * `BLOCK_CONFIG_INVALID` warning, so a padding of 1e9 cannot draw a viewBox 1e9 wide.
   */
  readonly maxPadding: number;
}

export const BLOCK_METRICS: BlockMetrics = {
  padding: 8,
  roundRadius: 5,
  margin: 5,
  loopAngle: 30,
  loopReach: 24,
  maxSizings: 16,
  maxPadding: 1000,
};

/** A cubic Bézier's point at one half: its ends weigh 1/8 each, its control points 3/8. */
export const CUBIC_MIDDLE = { end: 1 / 8, control: 3 / 8 } as const;

/** The CSS weight block text is measured and drawn at: v12 sets none, so normal. */
export const NORMAL_WEIGHT = 400;
