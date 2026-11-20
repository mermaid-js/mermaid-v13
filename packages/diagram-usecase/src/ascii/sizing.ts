/**
 * The text output's sizing (D478, spec #517 T7): the shapes' lengths in character cells, for the
 * layout (`layout/sizing.ts`), in the `./ascii` entry so an SVG render loads none of it
 * (R-ASCII-9). Paddings, spacing, wrap widths and the group frame come from core's cell profile.
 * px config values convert through it (`fromPx`) only when an author set them (as ER's, D124):
 * v12's defaults (120 px wraps and widths) would not read as text, so the profile's own wrap and
 * no least width apply.
 */
import { fromPx, type LayoutGraph, type UnitProfile } from '@mermaid-js/core/layout';
import { graphSpacing } from '@mermaid-js/shared/layout';
import type { UsecaseLayoutConfig } from '../config.ts';
import { ANGLE_QUOTES, ASCII_QUOTES, type Sizing } from '../layout/sizing.ts';

/** The shapes' own lengths in cells. */
export const CELL = Object.freeze({
  /** The actor's three-line figure (` O `, `/|\`, `/ \`), the labels right under it. */
  actor: Object.freeze({ glyphWidth: 3, glyphHeight: 3, labelGap: 0, stereotypeGap: 0, pad: 0 }),
  /** A box side: a use case's, its label rows `( … )` (`[ … ]`), a note's and a table's. */
  side: 1,
  /** An empty use case label still takes its row, which reads `(  )`. */
  minBlockHeight: 1,
  /** An author's `wrappingWidth` converts to at least this many cells: a label keeps a column. */
  leastWrap: 1,
});

/** The graph in cells: on the grid, the spacing an author set converted, the profile's margin. */
function onGrid(units: UnitProfile, graph: LayoutGraph, config: UsecaseLayoutConfig): LayoutGraph {
  // usecase.nodeSpacing runs across the flow, rankSpacing along it; with the spacing, the width
  // budget that turns LR to TB uses (as ER's).
  const px = (key: 'nodeSpacing' | 'rankSpacing') =>
    config.set.has(key) ? config[key] : undefined;
  return {
    ...graph,
    ...graphSpacing(units, graph.direction, px),
    // Text output trims the empty margin: the profile's own applies (as ER's and the flowchart's).
    diagramPadding: units.builder.diagramPadding,
    grid: units.grid,
  };
}

/**
 * The sizing of the cell profile `units`, `<<`/`>>` quotes in the `ascii` charset. Use cases,
 * notes and tables are boxes: their sides take a cell each, the profile's node padding inside
 * them; frames take the profile's group padding, the title on the top border. A wrap or least
 * width converts from px only when the author set it.
 */
export function cellSizing(
  units: UnitProfile,
  charset: 'ascii' | 'unicode',
  config: UsecaseLayoutConfig
): Sizing {
  const b = units.builder;
  const box = { x: CELL.side + b.nodePad.x, y: CELL.side + b.nodePad.y };
  const { set } = config;
  return {
    units,
    quotes: charset === 'ascii' ? ASCII_QUOTES : ANGLE_QUOTES,
    wrap: set.has('wrappingWidth')
      ? fromPx(units, config.wrappingWidth, 'x', CELL.leastWrap)
      : b.wrapWidth,
    minWidth: set.has('minNodeWidth') ? fromPx(units, config.minNodeWidth, 'x') : 0,
    titleWrap: Infinity,
    cellWrap: b.wrapWidth,
    edgeWrap: b.edgeWrap,
    actor: CELL.actor,
    ovalPad: box,
    rectPad: box,
    businessGap: 0,
    minBlockHeight: CELL.minBlockHeight,
    notePad: box,
    json: { cellPadX: b.nodePad.x, cellPadY: b.nodePad.y, border: CELL.side, rule: CELL.side },
    tabs: false,
    ovalSpan: false,
    // The engine keeps two cells between a frame and a member's side, so a two-cell head (`|>`)
    // stays off the frame (pitfall 20).
    frame: { pad: b.groupPad, titledTop: b.titlePad },
    finish: (graph) => onGrid(units, graph, config),
  };
}
