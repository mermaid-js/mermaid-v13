/**
 * Every diagnostic and warning code venn raises itself, one definition each (D417). Shared codes
 * (`UNEXPECTED`, `UNEXPECTED_CHARACTER`, `UNCLOSED_STRING`, `UNCLOSED_LABEL`) are core's or
 * other diagrams' as well.
 */

/** `union` with one set (v12's `union requires multiple identifiers`, a rejection). */
export const VENN_UNION_ONE_SET = 'VENN_UNION_ONE_SET';
/** `union` naming a set no earlier `set` declared (v12's `unknown set identifier`, a rejection). */
export const VENN_UNKNOWN_SET = 'VENN_UNKNOWN_SET';
/** Warning: a repeated `set` or `union` (each copy is kept and drawn, as in v12). */
export const VENN_DUPLICATE = 'VENN_DUPLICATE';
/** Warning: a text node or style naming a set or overlap the diagram does not draw. */
export const VENN_UNKNOWN_TARGET = 'VENN_UNKNOWN_TARGET';
/** Warning: a negative size, or one too large to lay out (laid out as 0). */
export const VENN_INVALID_SIZE = 'VENN_INVALID_SIZE';
/** Warning: no `set` or `union`; only the title is drawn. */
export const VENN_EMPTY = 'VENN_EMPTY';
/** Warning (the layout's): sets written with size 0, which are not drawn, nor their overlaps. */
export const VENN_ZERO_SET = 'VENN_ZERO_SET';
