/**
 * The C4 layout's px metrics table (spec #522 §Layout, pitfall 13): every length the grid, the
 * shapes, the router and the label placement use that is not a `c4` config key. The config
 * lengths (`diagramMarginX`, `c4ShapeMargin`, `c4ShapePadding`, `width`, …) are read by
 * `../config.ts`; nothing else in `src/layout/` writes a length.
 *
 * v12's own constants (`c4Renderer.ts`, `c4LabelHelper.ts`, `styles.js`, `c4ShapeAdapter.ts`)
 * and Pele's router constants (`src/diagrams/c4/route.ts`, `render.ts` at commit 3a2f075,
 * https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano) are marked as such.
 */
// cspell:ignore kepano
export const C4_METRICS = {
  /** v12 `c4LabelHelper.ts`: the gap between an element's name, type and description. */
  sectionGap: 3,
  /** v12 `c4LabelHelper.ts`: the least wrap width of an element's text. */
  minWrapWidth: 32,
  /** v12 `styles.js`: the type line's and the description's size, in em of the name's. */
  typeScale: 0.75,
  descrScale: 0.82,

  /** v12 `drawInsideBoundary`: the header lines' offsets from the frame's top. */
  boundaryLabelTop: 8,
  boundaryTypeGap: 5,
  boundaryDescrGap: 20,
  /** v12: a boundary's label is `boundaryFontSize + 2`, its description `− 2`, at least `minFontSize`. */
  boundaryLabelGrow: 2,
  boundaryDescrShrink: 2,
  minFontSize: 1,
  /** Room each side of a header wider than the boundary's contents (Pele `HEAD_LEFT`). */
  boundaryHeadPadX: 16,
  /** v12 `svgDraw.ts`: a boundary's corner radius. */
  boundaryRadius: 2.5,

  /** v12's title row (`extraVertForTitle`), and the title's size (the root's 16 px). */
  titleRow: 60,
  titleFontSize: 16,

  /** v12 `c4ShapeAdapter.ts`: `rx`/`ry` 12 on rounded and `fr-rect` elements. */
  shapeRadius: 12,
  /**
   * The person in the text output's cell layout, drawn as a box: v12 12.2.0's head of radius 13
   * centred 14 below the top, in a row 26 high over the body.
   */
  personHead: 26,
  personHeadRadius: 13,
  personHeadCentre: 14,
  /** `fr-rect`: the frame lines stand this far inside each side. */
  frameInset: 8,

  // The router (Pele `route.ts`).
  /** A self-loop's reach to the right, its label's gap past it, and its label room. */
  loop: 28,
  loopLabelGap: 4,
  loopRoom: 64,
  /** A self-loop's ends: up to this far above and below the middle, and this far clear of the side's ends. */
  loopSpread: 10,
  loopSpreadInset: 4,
  /** A detour lane's first distance from what it goes round, and the step for each lane after. */
  lane: 20,
  laneStep: 7,
  /** The radius of a bent line's corners. */
  corner: 8,
  /** A wide label on an upright lane leans this far out from it. */
  lean: 30,
  /** Label widths that fit the gap between two columns, and where there is room to spare. */
  narrow: 88,
  wide: 160,
  /**
   * Text output: the room across a relation label's text, in px (one cell). The text drawing
   * frames the label itself (`ascii/draw.ts`); the SVG's tag takes the `labelPatch` (D629).
   */
  textLabelPad: 8,
  /** Parallel stretches closer than this read as one line; a line this close to a frame, as part of it. */
  near: 6,
  frameNear: 3,
  /** The step between the places a line may leave or reach a side, and their least distance from its ends. */
  portStep: 12,
  portInset: 8,
  /** How far a line moves sideways when another runs the opposite way (Pele `PAIR_SHIFT`). */
  pairShift: 7,

  // Label placement (Pele `render.ts`).
  /** A label may cover this much of a shape's edge, where there is no text. */
  labelEdge: 8,
  /**
   * v12's arrowhead marker (`M 0 0 L 10 5 L 0 10 z`): 10 long and 10 wide, the one size the
   * renderer draws (`C4_RENDER_METRICS`); labels keep off a square of this half side round its tip.
   */
  arrow: 10,
  /** The farthest an `UpdateRelStyle` offset moves a label. */
  maxOffset: 2000,
  /** Places along a relation to try for its label, nearest the middle first. */
  slide: [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8] as readonly number[],
  /** The same, half as far apart, for a label the steps of `slide` found no clear spot for. */
  fineSlide: [
    0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8,
  ] as readonly number[],
  /** A label beside a shifted line keeps this far from it. */
  besideGap: 2,
  /** A leaning label moves out by its half height less this. */
  leanSlack: 14,
  /** How far out beside its line a label is tried, in label depths, when the line has no room. */
  besideSteps: 8,
  /** Steps beside the line per label depth in the finer search (`fineSlide`). */
  fineSplit: 2,
  /** What another relation's stretch through a label costs, as a share of the label's area. */
  lineCover: 0.5,
  /** What each step beside the line past the first costs, as a share of `lineCover`'s cost. */
  besideStepCost: 0.5,

  /**
   * R-SEC-5, D455: the box and stretch comparisons the router and label placement may make (also
   * capped by the integrator's `limits.maxLayoutWork`, D542); past it, the relations left go
   * straight and their labels sit at their middle.
   */
  careBudget: 2_000_000,
  /** The lane steps a detour tries for a free lane. */
  laneTries: 4,
  /** Places a side offers a line, and the steps tried to find them. */
  portCandidates: 4,
  portTries: 9,
  /** Lanes tried across a gap, and the least step between them as a share of the gap. */
  acrossTries: 9,
  laneSplit: 4,
  /** What crossing a line costs an elbow (against its length) and a detour (against its lane steps). */
  elbowCrossingCost: 1e6,
  detourCrossingCost: 8,
  /**
   * What a bend costs a path through the channels between shapes (`./channels.ts`, #774), against
   * its length: a bend fewer is worth about one gap between two columns more.
   */
  channelBend: 100,
  /** What crossing a line already routed costs that path: half a bend, so it mostly breaks ties. */
  channelCrossing: 50,
} as const;

/** CSS numeric weights. */
export const FONT_WEIGHT = { normal: 400, bold: 700 } as const;
