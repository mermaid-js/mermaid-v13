// `compass`'s length constants (pitfall 13): v12's two architecture defaults and the constants of
// the reference implementation's pixel pass (see `compass.ts`). Nothing else in the engine writes a
// length.

const ICON_SIZE = 80;
const PADDING = 40;

/**
 * Every length the engine uses (pitfall 13): v12's two defaults and the reference implementation's
 * constants.
 */
export const METRICS = {
  /** v12's `architecture.iconSize`: an empty group's cell is this wide. */
  iconSize: ICON_SIZE,
  /** v12's `architecture.padding`, the least gap between cells. */
  padding: PADDING,
  /** Gap between cells: the reference implementation's `max(40, 0.75 × iconSize)`. */
  gap: Math.max(PADDING, Math.round(ICON_SIZE * 0.75)),
  /** An empty group's cell is this tall. */
  emptyHeight: ICON_SIZE / 2,
  /** How far a route runs straight out of a port before it may turn. */
  stub: 12,
  /** Room an edge label adds to the gap it sits in, across and along the columns. */
  labelGapX: 28,
  labelGapY: 24,
  /** Room an edge label keeps either side when it widens its column, or sits on a run. */
  labelPad: 8,
  /** Room between an edge label nudged off a node and the node. */
  labelClear: 4,
  /** Room between a group's title and the top of its content. */
  titleGap: 12,
  /** Room between a group's top border and its title's top. */
  titleTop: 6,
  /** How far in from the group's left border the title starts. */
  titleLeft: 10,
  /** Room a title keeps from an edge that comes down through it, and from the right border. */
  titleClear: 6,
  titleRight: 4,
  /** Room a title wants beyond its own width before its group widens for it. */
  titleRoom: 20,
  /** How far apart the two ends of an edge from a side back to the same side are drawn. */
  loopPart: 8,
  /** Room kept around route points at the drawing's border. */
  routeMargin: 4,
  /** Room between an edge-end label and the line and side it sits by. */
  endLabelGap: 4,
} as const;
