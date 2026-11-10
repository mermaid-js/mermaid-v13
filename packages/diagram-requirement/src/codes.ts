/**
 * Every warning code requirement raises itself, one definition each. Syntax errors use core's
 * shared codes (`UNEXPECTED`, `UNEXPECTED_CHARACTER`, `UNCLOSED_STRING`, …); the style-copy
 * cap ends the render in core's `LimitError` (`limits.ts`, D433).
 */

/**
 * Styling lost to v12's order (D433): a `style`, `class` or `:::` that names a box before it is
 * defined (or one never defined; `style` also stops there for the ids after it), and a
 * `classDef default` that reaches only the boxes defined before it. One warning per parse,
 * listing each lost statement (`related`, and `astIds` for the render warning).
 */
export const REQUIREMENT_STYLE_DROPPED = 'REQUIREMENT_STYLE_DROPPED';
/**
 * Relations whose source or target names no requirement or element (D434): kept in the model,
 * left out of the layout. One warning per parse, listing each such relation.
 */
export const REQUIREMENT_UNKNOWN_NODE = 'REQUIREMENT_UNKNOWN_NODE';
/**
 * A requirement or element defined twice (D434): the first definition is kept, later bodies are
 * left out (a later `:::` still classes the first). One warning per parse, listing each later
 * definition.
 */
export const REQUIREMENT_DUPLICATE = 'REQUIREMENT_DUPLICATE';
/**
 * A requirement and an element of one name (D434): both boxes are drawn, and every relation,
 * `style` and `class` naming it reaches the requirement (v12's order). One warning per parse,
 * listing each shared name.
 */
export const REQUIREMENT_SHARED_NAME = 'REQUIREMENT_SHARED_NAME';

/** Style copies one parse may make before the rest are left out (D433, Pele's limit). */
export const MAX_STYLE_COPIES = 1_000_000;
