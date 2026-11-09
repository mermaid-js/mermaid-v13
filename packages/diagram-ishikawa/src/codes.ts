/**
 * Every warning code ishikawa raises itself, one definition each (D417, D496). Syntax errors use
 * the shared `UNEXPECTED`.
 */

/** Warning: the diagram has no effect (an empty body), so nothing is drawn (D496). */
export const ISHIKAWA_EMPTY = 'ISHIKAWA_EMPTY';
/**
 * Warning: causes indented less than the first cause, read as top-level causes; one per parse,
 * each such cause in `related` (D496).
 */
export const ISHIKAWA_INDENT_CLAMPED = 'ISHIKAWA_INDENT_CLAMPED';
