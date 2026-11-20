/**
 * The text-grid kit for ASCII/Unicode output (DESIGN §6.3, D76). Only ASCII code imports
 * it; SVG rendering never does.
 */
export { Canvas } from './canvas.ts';
export { DOWN, DX, DY, INTO, LEFT, RIGHT, UP, opposite } from './directions.ts';
export type { Dir } from './directions.ts';
export { drawBox, drawText } from './draw.ts';
export type { BoxOptions, CellRect } from './draw.ts';
export { armOf, ascii, glyphFor, junction, sideOf, unicode } from './glyphs.ts';
export type { CardinalityGlyphs, GlyphSet, Sides, Stroke } from './glyphs.ts';
export { Heap } from './heap.ts';
export type { HeapTies } from './heap.ts';
export { repairRoutes, routeCollisions } from './repair.ts';
export type { Collision, CollisionKind, RepairOptions, RepairResult } from './repair.ts';
export { asciiOptions } from './options.ts';
export type { AsciiInput, AsciiOptions } from './options.ts';
export { snapRoute } from './snap.ts';
export { cellMeasurer, cellWidth, graphemes, graphemeWidth } from './measurer.ts';
export type { Grapheme } from './measurer.ts';
