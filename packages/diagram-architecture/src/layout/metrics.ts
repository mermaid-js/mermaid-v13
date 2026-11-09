/**
 * The architecture metrics table (spec #525 "Package and contract", pitfall 13): every length
 * v12 drew an architecture diagram with, in px, as its `svgDraw.ts` and schema wrote them. It is
 * the only file in `layout/` that holds a length literal; the builder and the renderer take
 * their lengths from {@link architectureSizes}, which scales them by the document's
 * `architecture.iconSize` and `architecture.padding` as v12 did. Architecture has no text output
 * (D320), so there is one set, in px.
 */

/** v12's constants: two schema defaults, and the ratios and offsets `svgDraw.ts` applies to them. */
export const ARCHITECTURE_METRICS = {
  /** Schema default of `architecture.iconSize`: a service's icon and a junction's box are this square. */
  iconSize: 80,
  /** Schema default of `architecture.padding`: room inside a group's border, and round the drawing. */
  padding: 40,
  /** An arrowhead is `iconSize / arrowDivisor` (`svgDraw.ts:34`). */
  arrowDivisor: 6,
  /** A service label wraps at `iconSize × labelWidthRatio` (`svgDraw.ts:294`). */
  labelWidthRatio: 1.5,
  /** A `{group}` end runs `padding + groupEdgeExtra` past the node (`svgDraw.ts:55`). */
  groupEdgeExtra: 4,
  /** … and on a bottom side this much more, for the service label (`svgDraw.ts:56-62`). */
  groupEdgeBottom: 18,
  /** A group's icon is `padding × groupIconRatio` square (`svgDraw.ts:200`). */
  groupIconRatio: 0.75,
  /** A group's label starts this far after its icon, or after its corner (`svgDraw.ts:263`). */
  groupLabelGap: 4,
  /** A group border's `stroke-dasharray` (`architectureStyles.ts`). */
  groupDash: 8,
  /** The weight labels are measured and drawn at (v12's `createText`, no bold but markdown's). */
  fontWeight: 400,
} as const;

/** v12's lengths for one document's `iconSize` and `padding`, px. */
export interface ArchitectureSizes {
  /** A service's icon and a junction's box: `iconSize` square. */
  readonly iconSize: number;
  /** Room inside a group's border on every side, and round the drawing. */
  readonly padding: number;
  /** An arrowhead's size, `iconSize / 6`. */
  readonly arrow: number;
  /** The width a service label wraps at, `iconSize × 1.5`. */
  readonly labelWidth: number;
  /** Where a service label's top centre sits from the icon's corner: `(iconSize / 2, iconSize)`. */
  readonly labelAt: { readonly x: number; readonly y: number };
  /** How far a `{group}` end runs past its node: `padding + 4`, and on a bottom side 18 more. */
  readonly groupEdge: { readonly side: number; readonly bottom: number };
  /** How far a junction end runs on into the junction (to its centre): `iconSize / 2`. */
  readonly junctionEnd: number;
  /** A group's icon: `padding × 0.75` square. */
  readonly groupIcon: number;
  /** Between a group's icon (or its corner) and its label. */
  readonly groupLabelGap: number;
  /** A group border's dash. */
  readonly groupDash: number;
}

/** The lengths v12 drew with for `iconSize` and `padding` (px). */
export function architectureSizes(
  iconSize: number = ARCHITECTURE_METRICS.iconSize,
  padding: number = ARCHITECTURE_METRICS.padding
): ArchitectureSizes {
  const M = ARCHITECTURE_METRICS;
  const side = padding + M.groupEdgeExtra;
  return {
    iconSize,
    padding,
    arrow: iconSize / M.arrowDivisor,
    labelWidth: iconSize * M.labelWidthRatio,
    labelAt: { x: iconSize / 2, y: iconSize },
    groupEdge: { side, bottom: side + M.groupEdgeBottom },
    junctionEnd: iconSize / 2,
    groupIcon: padding * M.groupIconRatio,
    groupLabelGap: M.groupLabelGap,
    groupDash: M.groupDash,
  };
}
