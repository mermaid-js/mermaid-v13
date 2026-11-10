/**
 * Value conversion for the block parser (parser-method §3): v12 `blockDB.ts`'s shape and edge
 * decoding and `addStyleClass`, and AST id escaping (D448).
 */
import type { BlockArrowType, BlockType } from '../model.ts';

const SHAPES: Readonly<Record<string, BlockType>> = {
  '[]': 'square',
  '()': 'round',
  '(())': 'circle',
  '>]': 'rect_left_inv_arrow',
  '{}': 'diamond',
  '{{}}': 'hexagon',
  '([])': 'stadium',
  '[[]]': 'subroutine',
  '[()]': 'cylinder',
  '((()))': 'doublecircle',
  '[//]': 'lean_right',
  '[\\\\]': 'lean_left',
  '[/\\]': 'trapezoid',
  '[\\/]': 'inv_trapezoid',
  '<[]>': 'block_arrow',
};

/** v12 `typeStr2Type`: a shape's opener and closer; any other pair (or none) is `na`. */
export const shapeType = (typeStr: string | undefined): BlockType =>
  (typeStr !== undefined && Object.hasOwn(SHAPES, typeStr) ? SHAPES[typeStr] : undefined) ?? 'na';

/** v12 `edgeStrToEdgeData`: the arrowhead at the end, from the link's last character. */
export function arrowEnd(link: string): BlockArrowType {
  switch (link.trim().slice(-1)) {
    case 'x':
      return 'arrow_cross';
    case 'o':
      return 'arrow_circle';
    case '>':
      return 'arrow_point';
    default:
      return '';
  }
}

/** v12 `edgeStrToEdgeStartData`: the arrowhead at the start, from the link's first character. */
export function arrowStart(link: string): BlockArrowType {
  switch (link.trim().charAt(0)) {
    case 'x':
      return 'arrow_cross';
    case 'o':
      return 'arrow_circle';
    case '<':
      return 'arrow_point';
    default:
      return 'arrow_open';
  }
}

/** v12 `edgeStrToThickness`. */
export const thickness = (link: string): 'normal' | 'thick' =>
  link.includes('==') ? 'thick' : 'normal';

/** v12 `edgeStrToPattern`. */
export const pattern = (link: string): 'solid' | 'dotted' =>
  link.includes('.-') ? 'dotted' : 'solid';

/**
 * v12 `addStyleClass`'s reading of a `classDef`'s styles: split at `,`, the first `;` of each
 * removed and trimmed; one with `color` in it is also a text style, `fill` → `bgFill` and then
 * `color` → `fill` (first occurrences, as v12's `replace`).
 */
export function classStyles(css: string): { styles: string[]; textStyles: string[] } {
  const styles: string[] = [];
  const textStyles: string[] = [];
  for (const attrib of css.split(',')) {
    const fixed = attrib.replace(/([^;]*);/, '$1').trim();
    if (attrib.includes('color'))
      textStyles.push(fixed.replace('fill', 'bgFill').replace('color', 'fill'));
    styles.push(fixed);
  }
  return { styles, textStyles };
}

/**
 * `%`, `>`, `@` and `#` percent-encoded (the separators of block AST ids), and so are the
 * characters XML 1.0 cannot hold (C0 controls but tab, LF and CR; DEL; lone surrogates; U+FFFE,
 * U+FFFF). Two hex digits up to U+007F, four above, so the encoding stays one-to-one.
 */
const ESCAPED = '%>@#\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udfff\\ufffe\\uffff';
const RE_NEEDS_ESC = new RegExp(`[${ESCAPED}]`, 'u');
const RE_ESC = new RegExp(`[${ESCAPED}]`, 'gu');
const TWO_DIGITS = 0x80;

/** An id as it goes into an AST id. */
export function esc(name: string): string {
  return RE_NEEDS_ESC.test(name)
    ? name.replace(RE_ESC, (c) => {
        const n = c.charCodeAt(0);
        return `%${n
          .toString(16)
          .toUpperCase()
          .padStart(n < TWO_DIGITS ? 2 : 4, '0')}`;
      })
    : name;
}

/** `a`, `a and b`, `a, b and c`. */
export function listOf(parts: readonly string[]): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}
