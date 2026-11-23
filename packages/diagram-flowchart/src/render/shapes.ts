// The shapes a flowchart draws, by v12 name: the table from a shape's name to its definition,
// the lookups the builder and the renderer ask it, and v12's aliases. The shapes themselves
// (sizes, outlines, drawers) are `@mermaid-js/shared/shapes/*`.
import type { Attrs, SvgWriter } from '@mermaid-js/core/svg';
import {
  anchor,
  bang,
  bolt,
  bowRect,
  braceLeft,
  braceRight,
  braces,
  browser,
  bucket,
  choice,
  cloud,
  crossedCircle,
  curvedTrapezoid,
  datastore,
  delay,
  dividedRect,
  doc,
  ellipse,
  filledCircle,
  flag,
  flippedTriangle,
  folder,
  fork,
  framedCircle,
  horizontalCylinder,
  hourglass,
  linedCylinder,
  linedRect,
  notchedPentagon,
  notchedRect,
  person,
  slopedRect,
  smallCircle,
  stackedDocument,
  stackedRect,
  taggedDocument,
  taggedRect,
  terminal,
  text,
  triangle,
  windowPane,
} from '@mermaid-js/shared/shapes/extended';
import {
  circle,
  collapsedGroup,
  cylinder,
  diamond,
  doubleCircle,
  framedRect,
  hexagon,
  leanLeft,
  leanRight,
  linedDocument,
  odd,
  rect,
  rounded,
  stadium,
  trapezoidBottom,
  trapezoidTop,
} from '@mermaid-js/shared/shapes/basic';
import type { Frame, FramedPads, Pads, Shape, ShapeSize } from '@mermaid-js/shared/shapes/kit';
import { SHAPE_GROUPS } from '../parser/shapes.ts';

export type { Pads, ShapeSize };

const S: Record<string, Shape> = {
  rect,
  rounded,
  stadium,
  'fr-rect': framedRect,
  cyl: cylinder,
  'lin-cyl': linedCylinder,
  circle,
  'dbl-circ': doubleCircle,
  ellipse,
  diam: diamond,
  hex: hexagon,
  odd,
  text,
  'sm-circ': smallCircle,
  'f-circ': filledCircle,
  'fr-circ': framedCircle,
  fork,
  hourglass,
  bolt,
  'cross-circ': crossedCircle,
  choice,
  anchor,
  'lean-r': leanRight,
  'lean-l': leanLeft,
  'trap-b': trapezoidBottom,
  'trap-t': trapezoidTop,
  'notch-rect': notchedRect,
  'notch-pent': notchedPentagon,
  'lin-rect': linedRect,
  'div-rect': dividedRect,
  'win-pane': windowPane,
  'tag-rect': taggedRect,
  'st-rect': stackedRect,
  tri: triangle,
  'flip-tri': flippedTriangle,
  'sl-rect': slopedRect,
  delay,
  'h-cyl': horizontalCylinder,
  'curv-trap': curvedTrapezoid,
  'bow-rect': bowRect,
  doc,
  'tag-doc': taggedDocument,
  'lin-doc': linedDocument,
  docs: stackedDocument,
  flag,
  brace: braceLeft,
  'brace-r': braceRight,
  braces,
  datastore,
  folder,
  bucket,
  console: terminal,
  browser,
  person,
  bang,
  cloud,
  collapsedGroup,
};

// Lookups go through a Map so names like "constructor" never reach Object.prototype.
const BY_NAME = /* @__PURE__ */ new Map(Object.entries(S));
const FALLBACK = rect;

const def = (shape: string): Shape => BY_NAME.get(shape) ?? FALLBACK;

export const shapeSize = (shape: string, tw: number, th: number, p: Pads): ShapeSize =>
  def(shape).size(tw, th, p);

/** What {@link drawShape} draws: the shape `kind` at `width` x `height`, its paint and pads. */
export interface ShapeDraw {
  readonly kind: string;
  readonly w: SvgWriter;
  readonly width: number;
  readonly height: number;
  readonly attrs: Attrs;
  readonly lines: Attrs;
  readonly pads: Pads;
  /** The frame the size gave, for a shape whose box does not fix it (the cloud's). */
  readonly frame?: Frame;
}

/** The pads with the frame a shape's size gave, where it gave one (the cloud's). */
export const framed = (pads: Pads, frame: Frame | undefined): FramedPads =>
  frame ? { ...pads, frame } : pads;

export const drawShape = (d: ShapeDraw): void =>
  def(d.kind).draw(d.w, d.width, d.height, d.attrs, d.lines, framed(d.pads, d.frame));
export const shapeInset = (
  shape: string,
  W: number,
  H: number,
  side: number,
  t: number,
  p: FramedPads
): number => def(shape).inset?.(W, H, side, t, p) ?? 0;
export const shapeSpan = (shape: string, W: number, H: number, sideways: boolean): number =>
  Math.max(0, def(shape).span?.(W, H, sideways) ?? 0);
/**
 * Whether the shape's `line` paint is a colour, not the gradient (D182, D185): the shape's
 * `plain`. conformance's every-shape neo tests check it.
 */
export const usesPlain = (shape: string): boolean => BY_NAME.get(shape)?.plain === true;
export const shapeHasLabel = (shape: string): boolean => def(shape).noLabel !== true;
export const shapeFilled = (shape: string): boolean => def(shape).bare !== true;
/** Whether the shape is drawn by its own code rather than falling back to a rectangle. */
export const isDrawnShape = (shape: string): boolean => BY_NAME.has(shape);

// v12 shape names, their aliases and the bracket syntax types → the name drawn here.
const CANONICAL: ReadonlyMap<string, string> = /* @__PURE__ */ new Map([
  ...SHAPE_GROUPS.flatMap((names) => names.map((n) => [n, names[0]!] as const)),
  ['square', 'rect'],
  ['round', 'rounded'],
]);

/** The shape drawn for a v12 vertex type or `@{ shape }` name. Unknown names draw a rectangle. */
export function canonicalShape(name: string | undefined): string {
  if (name === undefined) return 'rect';
  return CANONICAL.get(name) ?? (BY_NAME.has(name) ? name : 'rect');
}
