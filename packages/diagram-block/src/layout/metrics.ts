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
  /** A styled `font-size` at or past this is ignored (flowchart's bound on a label's font). */
  readonly maxFontSize: number;
}

export const BLOCK_METRICS: BlockMetrics = {
  padding: 8,
  roundRadius: 5,
  margin: 5,
  loopAngle: 30,
  loopReach: 24,
  maxFontSize: 1000,
};

/** The CSS weight block text is measured and drawn at: v12 sets none, so normal. */
export const NORMAL_WEIGHT = 400;
