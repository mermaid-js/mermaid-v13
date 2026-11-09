/**
 * Every diagnostic and warning code sankey raises itself, one definition each. Shared codes
 * (`UNEXPECTED`, `UNCLOSED_STRING`) are core's.
 */

/**
 * A link on a cycle, a self-link included (D393): an error at parse, where v12's d3-sankey
 * threw `circular link` at render. One per group of nodes that reach each other.
 */
export const SANKEY_CYCLE = 'SANKEY_CYCLE';
/**
 * Values that are not a number, negative, or infinite (D394): each such link counts as 0. One
 * warning per parse, listing every such row (`related`, and `astIds` for the render warning).
 */
export const SANKEY_INVALID_VALUE = 'SANKEY_INVALID_VALUE';
/** A value with text after its number (`1;`, `1 2`): v12's `parseFloat` read the number (D394). */
export const SANKEY_VALUE_TRAILING_TEXT = 'SANKEY_VALUE_TRAILING_TEXT';
/**
 * A `sankey` option the layout cannot use (a length that is negative or not a number, an
 * unknown alignment or label style, a value of the wrong type): the default is used. One
 * warning per key per render (#503).
 */
export const SANKEY_CONFIG_INVALID = 'SANKEY_CONFIG_INVALID';
/**
 * A `linkColor` or `nodeColors` value that fails core's colour check (spec #427 §Integration):
 * dropped, and the default drawn. One warning per render, naming every dropped value (#503).
 */
export const SANKEY_COLOR_INVALID = 'SANKEY_COLOR_INVALID';
