/**
 * The block facet's tables and shared helpers (DESIGN §4.5, D95). Keyword docs are not here:
 * they come from the grammar file (`generated/docs.ts`). The shapes, links and directions are
 * v12's (`blockDB.ts` `typeStr2Type`, `edgeStrToEdgeData`, `blockArrowHelper`).
 */
import type { Range } from '@mermaid-js/core/parser-kit';
import type { BlockType } from '../model.ts';

/** A line break as the lexer reads one (`\s` takes the line separators). */
export const LINE_BREAK = /[\n\r\u2028\u2029]/;

/**
 * The shapes a block id takes, in the order completion offers them: the opener and closer
 * around a quoted label, and the type v12 gives the pair. The block arrow takes directions
 * after its closer.
 */
export const SHAPES: readonly (readonly [open: string, close: string, type: BlockType])[] = [
  ['[', ']', 'square'],
  ['(', ')', 'round'],
  ['((', '))', 'circle'],
  ['(((', ')))', 'doublecircle'],
  ['([', '])', 'stadium'],
  ['[[', ']]', 'subroutine'],
  ['[(', ')]', 'cylinder'],
  ['{', '}', 'diamond'],
  ['{{', '}}', 'hexagon'],
  ['>', ']', 'rect_left_inv_arrow'],
  ['[/', '/]', 'lean_right'],
  ['[\\', '\\]', 'lean_left'],
  ['[/', '\\]', 'trapezoid'],
  ['[\\', '/]', 'inv_trapezoid'],
  ['<[', ']>(right)', 'block_arrow'],
];

/** How hover names each block type. */
export const TYPE_NAMES: Readonly<Record<BlockType, string>> = {
  na: 'square (no shape written)',
  square: 'square, `["…"]`',
  round: 'round, `("…")`',
  circle: 'circle, `(("…"))`',
  doublecircle: 'double circle, `((("…")))`',
  stadium: 'stadium, `(["…"])`',
  subroutine: 'subroutine, `[["…"]]`',
  cylinder: 'cylinder, `[("…")]`',
  diamond: 'diamond, `{"…"}`',
  hexagon: 'hexagon, `{{"…"}}`',
  rect_left_inv_arrow: 'flag, `>"…"]`',
  lean_right: 'leaning right, `[/"…"/]`',
  lean_left: 'leaning left, `[\\"…"\\]`',
  trapezoid: 'trapezoid, `[/"…"\\]`',
  inv_trapezoid: 'inverted trapezoid, `[\\"…"/]`',
  block_arrow: 'block arrow, `<["…"]>(…)`',
  composite: 'composite, `block:id … end`',
  space: 'space',
};

/** The links completion offers, each with what it draws (any number of `-`, `=` or `.` works). */
export const LINKS: readonly (readonly [link: string, detail: string])[] = [
  ['-->', 'line with an arrow head'],
  ['---', 'line with no head'],
  ['--x', 'line with a cross head'],
  ['--o', 'line with a circle head'],
  ['<-->', 'line with an arrow head at both ends'],
  ['x--x', 'line with a cross head at both ends'],
  ['o--o', 'line with a circle head at both ends'],
  ['==>', 'thick line with an arrow head'],
  ['===', 'thick line with no head'],
  ['-.->', 'dotted line with an arrow head'],
  ['-.-', 'dotted line with no head'],
];

/** A block arrow's directions (`blockArrowHelper`), each with where it points. */
export const DIRECTIONS: readonly (readonly [dir: string, detail: string])[] = [
  ['right', 'points right'],
  ['left', 'points left'],
  ['up', 'points up'],
  ['down', 'points down'],
  ['x', 'points left and right'],
  ['y', 'points up and down'],
];

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });

/** `1 block`, `2 blocks`. */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** The text of `at`'s line before `at`. */
export function lineBefore(text: string, at: number): string {
  let start = at;
  while (start > 0 && !LINE_BREAK.test(text.charAt(start - 1))) start--;
  return text.slice(start, at);
}

/** Where the run of characters matching `re` (one character each) around `at` starts and ends. */
export function runAround(text: string, at: number, re: RegExp, from = 0, to = text.length): Range {
  let start = at;
  while (start > from && re.test(text.charAt(start - 1))) start--;
  let end = at;
  while (end < to && re.test(text.charAt(end))) end++;
  return span(start, end);
}
