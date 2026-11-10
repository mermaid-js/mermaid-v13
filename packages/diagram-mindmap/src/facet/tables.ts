/**
 * The mindmap facet's tables and shared helpers (DESIGN §4.5, D95). Keyword docs are not here:
 * they come from the grammar file (`generated/docs.ts`).
 */
import type { Range } from '@mermaid-js/core/parser-kit';
import type { MindmapShape } from '../model.ts';
export { lineBefore } from '@mermaid-js/core/parser-kit';
export { span } from '@mermaid-js/core/parser-kit';
export { code } from '@mermaid-js/core/parser-kit';

/** A shape written with delimiters: its opener, the closer it reads best with, its name. */
export interface ShapeForm {
  readonly open: string;
  readonly close: string;
  readonly shape: MindmapShape;
  readonly name: string;
}

/**
 * The six shapes with delimiters (spec #294, story 3), in the order completion offers them.
 * Any closer closes any shape in v12; these are the closers each opener is written with.
 */
export const SHAPES: readonly ShapeForm[] = [
  { open: '[', close: ']', shape: 'rect', name: 'square' },
  { open: '(', close: ')', shape: 'rounded', name: 'rounded' },
  { open: '((', close: '))', shape: 'circle', name: 'circle' },
  { open: ')', close: '(', shape: 'cloud', name: 'cloud' },
  { open: '))', close: '((', shape: 'bang', name: 'bang' },
  { open: '{{', close: '}}', shape: 'hexagon', name: 'hexagon' },
];

/**
 * The closer each opener is written with; `-)` and `(-` (the default shape) too. `(-` takes
 * `)`: in `a(-x-)` the `-` of `-)` is read as text, as in v12.
 */
export const CLOSER_OF: Readonly<Record<string, string>> = {
  ...Object.fromEntries(SHAPES.map((s) => [s.open, s.close])),
  '-)': '(-',
  '(-': ')',
};

/** What hover calls each shape. */
export const SHAPE_NAMES: Readonly<Record<MindmapShape, string>> = {
  default: 'default',
  rect: 'square',
  rounded: 'rounded',
  circle: 'circle',
  cloud: 'cloud',
  bang: 'bang',
  hexagon: 'hexagon',
};

const LINE_END = /[\n\r\u2028\u2029]/;

/** The text of `at`'s line from `at` on. */
export function lineAfter(text: string, at: number): string {
  let end = at;
  while (end < text.length && !LINE_END.test(text.charAt(end))) end++;
  return text.slice(at, end);
}
