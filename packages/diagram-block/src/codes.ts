/**
 * Every diagnostic and warning code block raises itself, one definition each. Shared codes
 * (`UNEXPECTED`, `UNCLOSED_*`, `NODE_LIMIT`, `EDGE_LIMIT`, `DEPTH_LIMIT`) are core's.
 */

/**
 * `style` naming ids that no block, edge end or composite header declares (D443): one warning
 * per parse, listing them. v12 threw a TypeError at the first.
 */
export const BLOCK_STYLE_UNKNOWN = 'BLOCK_STYLE_UNKNOWN';
/**
 * `columns 0` (read as `columns auto`) or a span `:0` (read as `:1`), D445: one warning per
 * parse. v12 threw at render, or drew NaN.
 */
export const BLOCK_SIZE_INVALID = 'BLOCK_SIZE_INVALID';
/**
 * A span over 1,000 columns or a `space:n` over 100,000 cells, cut to the cap (D445, R-SEC-5):
 * one warning per parse.
 */
export const BLOCK_TRUNCATED = 'BLOCK_TRUNCATED';
/**
 * `block.padding` that is not a finite number of 0 or more (laid out at the default 8), or over
 * 1,000 (cut to 1,000), D226, D445: one warning per render. v12 laid it out as it was.
 */
export const BLOCK_CONFIG_INVALID = 'BLOCK_CONFIG_INVALID';
