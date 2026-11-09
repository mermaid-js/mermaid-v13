/**
 * The railroad layout's fixed lengths in px (spec #526 §Package and contract, pitfall 13): v12's
 * constants in `railroadRenderer.ts` and `styles.ts`. The configurable lengths are the `railroad`
 * section's (`../config.ts`), the font is the config's or the theme's. No other file in
 * `layout/` writes a length literal (`packages/conformance/src/railroad-layout-literals.spec.ts`).
 * Railroad draws SVG in px (D216).
 */
export interface RailroadMetrics {
  /** A terminal's corner radius: fixed, not `arcRadius` (`railroadRenderer.ts:112-113`). */
  readonly terminalCornerRadius: number;
  /** A special's dashed outline, dash then gap (`styles.ts:344`, `stroke-dasharray: 5,3`). */
  readonly specialDash: readonly [number, number];
  /** Added to the rule label's width to place the start marker (`nameWidth`, L542). */
  readonly nameGap: number;
  /** From the start marker to the definition (`definitionX = nameWidth + 20`, L543). */
  readonly definitionGap: number;
  /** From the definition's end to the end marker (L571, L594, L602). */
  readonly endGap: number;
  /** The track never runs above this distance from the rule's top (`max(20, up)`, L548). */
  readonly minBaseline: number;
  /** A rule is at least this tall (`max(40, …)`, L601). */
  readonly minRuleHeight: number;
  /** The canvas of a diagram with no rules (L650-654). */
  readonly emptyWidth: number;
  readonly emptyHeight: number;
}

export const RAILROAD_METRICS: RailroadMetrics = {
  terminalCornerRadius: 10,
  specialDash: [5, 3],
  nameGap: 20,
  definitionGap: 20,
  endGap: 10,
  minBaseline: 20,
  minRuleHeight: 40,
  emptyWidth: 200,
  emptyHeight: 100,
};

/** The CSS weight of every text but rule names (v12 sets none). */
export const NORMAL_WEIGHT = 400;

/** Rule names are drawn bold (`styles.ts` `.railroad-rule-name`) and measured so (D514). */
export const BOLD_WEIGHT = 700;
