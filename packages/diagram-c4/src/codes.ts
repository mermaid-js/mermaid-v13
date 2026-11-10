/**
 * Every diagnostic and warning code C4 raises itself, one definition each. Shared codes
 * (`UNEXPECTED`, `UNCLOSED_STRING`, `UNCLOSED_ARGUMENTS`, `UNCLOSED_BLOCK`,
 * `UNCLOSED_ACC_DESCR`) are core's vocabulary.
 */

/**
 * D452: a `$name="value"` argument where an alias, a relation end or a label belongs. It sets
 * the field it names (v12 stored the raw argument there); the slot is left empty.
 */
export const C4_NAMED_ARGUMENT_MOVED = 'C4_NAMED_ARGUMENT_MOVED';
/** D452: a line holding `direction TB`, `BT`, `RL` or `LR` (v12 threw `setDirection`). */
export const C4_DIRECTION = 'C4_DIRECTION';
/**
 * D452: a `$__proto__` argument (v12 threw a `TypeError`), kept as an unknown name, as Pele keeps
 * it (a warning: Pele accepts it).
 */
export const C4_NAME_RESERVED = 'C4_NAME_RESERVED';
/** D457: an `offsetX` or `offsetY` that is not a number; it counts as 0. */
export const C4_OFFSET_INVALID = 'C4_OFFSET_INVALID';
/**
 * D457: a relation whose end names no element or boundary (v12 threw at render, with this
 * diagnostic's message).
 */
export const C4_UNKNOWN_END = 'C4_UNKNOWN_END';
/**
 * A `$name` for the model's structure that v12 would have let break it (`$parentBoundary` naming
 * no boundary, an unknown `$typeC4Shape` or `$nodeType`, `$wrap`, a boundary renamed with its
 * statements): the structure is kept (D450, for the maintainer).
 */
export const C4_STRUCTURE_KEPT = 'C4_STRUCTURE_KEPT';
/**
 * D454: a boundary inside itself (reopening an alias inside one of its own boundaries makes the
 * parents a cycle, which v12 left undrawn): it is drawn at the top level.
 */
export const C4_BOUNDARY_CYCLE = 'C4_BOUNDARY_CYCLE';
/**
 * A colour that is not one core's colour check allows (`UpdateElementStyle`'s `$bgColor`,
 * `$fontColor`, `$borderColor`, `UpdateRelStyle`'s `$textColor`, `$lineColor`, a config
 * `<kind>_bg_color` or `_border_color`): it is dropped and the default drawn. One warning per
 * render names every dropped value (v12 wrote them raw).
 */
export const C4_COLOR_INVALID = 'C4_COLOR_INVALID';

/**
 * Text output (#545): a `c4.c4ShapePadding` that leaves an element no room for its border on the
 * character grid (under two cells across or a row down); the least that does is used.
 */
export const C4_CONFIG_IGNORED = 'C4_CONFIG_IGNORED';
