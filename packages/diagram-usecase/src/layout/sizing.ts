/**
 * The lengths and shape forms the view builders and the graph read (pitfall 13), one object per
 * unit profile. `pxSizing` is v12's: the metrics table and the config. The text output's (D478,
 * in character cells) is the `./ascii` entry's (`ascii/sizing.ts`), so an SVG render loads none
 * of it (R-ASCII-9): `layoutAscii` hands it in as `ctx.sizing`, and the entry installs it when it
 * loads (`setTextSizing`) for the pipeline's own layout of a text render, which reaches the
 * plugin's `layout` with the cell profile and no sizing (DESIGN §6.3, D86).
 */
import { pxProfile, type LayoutGraph, type UnitProfile } from '@mermaid-js/core/layout';
import type { UsecaseLayoutConfig } from '../config.ts';
import type { UsecaseLayoutContext } from './context.ts';
import { PX } from './metrics.ts';

/** `«` and `»`; text output's `ascii` charset writes `<<` and `>>` (D478). */
export type Quotes = readonly [open: string, close: string];

export const ANGLE_QUOTES: Quotes = ['«', '»'];
export const ASCII_QUOTES: Quotes = ['<<', '>>'];

/** Across and down, each side. */
export interface Pad {
  readonly x: number;
  readonly y: number;
}

export interface Sizing {
  readonly units: UnitProfile;
  /** Stereotype and include/extend quotes. */
  readonly quotes: Quotes;
  /** Node labels wrap here. */
  readonly wrap: number;
  /** The least label block of a use case, note or table title. */
  readonly minWidth: number;
  /** Boundary titles, JSON cells and edge labels wrap here. */
  readonly titleWrap: number;
  readonly cellWrap: number;
  readonly edgeWrap: number;
  /** The actor's glyph, the gaps under it and the padding round it. */
  readonly actor: {
    readonly glyphWidth: number;
    readonly glyphHeight: number;
    readonly labelGap: number;
    readonly stereotypeGap: number;
    readonly pad: number;
  };
  /** Round an oval use case's label block, and a `[rect]` one's. */
  readonly ovalPad: Pad;
  readonly rectPad: Pad;
  /** Between a business oval's stereotype and its label; 0 where no business mark is drawn. */
  readonly businessGap: number;
  /** The least height of a use case's label block. */
  readonly minBlockHeight: number;
  readonly notePad: Pad;
  /** A JSON table's cell padding, border, and the rule and divider between its parts. */
  readonly json: {
    readonly cellPadX: number;
    readonly cellPadY: number;
    readonly border: number;
    readonly rule: number;
  };
  /** A package boundary has a tab (v12 `clusters.js`); in text every boundary is a frame. */
  readonly tabs: boolean;
  /** Ends on an oval keep to the middle half of its side (clipped onto it after, `clip.ts`). */
  readonly ovalSpan: boolean;
  /** A boundary's padding each side, and its top when it has a title. */
  readonly frame: { readonly pad: number; readonly titledTop: number };
  /** The graph as the engine gets it, from the one built with the config's spacing and margin. */
  finish?(graph: LayoutGraph): LayoutGraph;
}

/** How a unit profile's sizing comes from the config and the context. */
export type SizingFor = (config: UsecaseLayoutConfig, ctx: UsecaseLayoutContext) => Sizing;

/** v12's lengths: the metrics table, the config and core's px profile (`units`). */
function pxSizing(config: UsecaseLayoutConfig, units: UnitProfile = pxProfile): Sizing {
  const b = units.builder;
  const oval = { x: PX.ellipse.inset, y: PX.ellipse.inset };
  const note = { x: PX.note.pad, y: PX.note.pad };
  return {
    units,
    quotes: ANGLE_QUOTES,
    wrap: config.wrappingWidth,
    minWidth: config.minNodeWidth,
    titleWrap: PX.boundary.titleWrap,
    cellWrap: PX.json.cellWrap,
    edgeWrap: b.edgeWrap,
    actor: PX.actor,
    ovalPad: oval,
    rectPad: b.nodePad,
    businessGap: PX.ellipse.stereotypeGap,
    minBlockHeight: 0,
    notePad: note,
    json: { ...PX.json, rule: 0 },
    tabs: true,
    ovalSpan: true,
    frame: { pad: PX.boundary.pad, titledTop: PX.boundary.pad },
  };
}

// Kept module state, lazy-load handle: the ./ascii entry installs it once, when it loads.
let textSizing: SizingFor | undefined;

/** Installs the text output's sizing: the `./ascii` entry does, when it loads. */
export function setTextSizing(sizing: SizingFor): void {
  textSizing = sizing;
}

/** The sizing for `ctx`: its own, else px, or on the grid the text output's. */
export function sizingOf(config: UsecaseLayoutConfig, ctx: UsecaseLayoutContext): Sizing {
  if (ctx.sizing) return ctx.sizing(config, ctx);
  const units = ctx.units ?? pxProfile;
  if (units.grid === undefined) return pxSizing(config, units);
  if (!textSizing)
    throw new Error('A usecase layout in cells needs @mermaid-js/diagram-usecase/ascii loaded.');
  return textSizing(config, ctx);
}
