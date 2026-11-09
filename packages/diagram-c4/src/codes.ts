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
/** D452: a `$__proto__` argument (v12 threw a `TypeError`), kept as an unknown name. */
export const C4_NAME_RESERVED = 'C4_NAME_RESERVED';
/** D457: an `offsetX` or `offsetY` that is not a number; it counts as 0. */
export const C4_OFFSET_INVALID = 'C4_OFFSET_INVALID';
/**
 * D457: a relation whose end names no element or boundary (v12 threw at render, with this
 * diagnostic's message).
 */
export const C4_UNKNOWN_END = 'C4_UNKNOWN_END';
