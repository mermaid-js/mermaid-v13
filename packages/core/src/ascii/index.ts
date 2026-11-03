/**
 * The text-grid kit for ASCII/Unicode output (DESIGN §6.3, D76). Only ASCII code imports
 * it; SVG rendering never does.
 */
export { Canvas } from './canvas.ts';
export { drawBox, drawText } from './draw.ts';
export type { BoxOptions, CellRect } from './draw.ts';
export { ascii, glyphFor, junction, unicode } from './glyphs.ts';
export type { GlyphSet, Sides, Stroke } from './glyphs.ts';
export { cellMeasurer, cellWidth, graphemes, graphemeWidth } from './measurer.ts';
export type { Grapheme } from './measurer.ts';
