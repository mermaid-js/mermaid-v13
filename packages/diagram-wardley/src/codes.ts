/**
 * Wardley's diagnostic and warning codes, in one place for the parser, the config reader and the
 * layout, which share some (D424, D425, D428). Each is exported from the package entry.
 */

/** A coordinate above 100 % (v12's thrown range error, with its message). */
export const WARDLEY_OUT_OF_RANGE = 'WARDLEY_OUT_OF_RANGE';
/** A `pipeline` whose parent names no anchor or component (v12's thrown error). */
export const WARDLEY_UNKNOWN_PARENT = 'WARDLEY_UNKNOWN_PARENT';
/** D428: a coordinate in (1, 2), read as a percentage although it looks like a fraction. */
export const WARDLEY_COORDINATE_AMBIGUOUS = 'WARDLEY_COORDINATE_AMBIGUOUS';
/** D425: an `evolve` naming no node; v12 skipped it. */
export const WARDLEY_UNKNOWN_TARGET = 'WARDLEY_UNKNOWN_TARGET';
/** D745: an `evolve` naming a pipeline component by its name; v12 skipped it. */
export const WARDLEY_EVOLVE_PIPELINE_COMPONENT = 'WARDLEY_EVOLVE_PIPELINE_COMPONENT';
/**
 * D425: a link with an end that names no node, from a node to itself, or (#490) whose ends are
 * at the same place; not drawn. The parser raises it, the layout only where the parser did not.
 */
export const WARDLEY_LINK_DROPPED = 'WARDLEY_LINK_DROPPED';
/** D425: a second `pipeline` for a parent, which replaces the first one's children. */
export const WARDLEY_PIPELINE_REPLACED = 'WARDLEY_PIPELINE_REPLACED';
/** D424: a `wardley-beta` option or a `size` the layout cannot draw, replaced by a default. */
export const WARDLEY_CONFIG_INVALID = 'WARDLEY_CONFIG_INVALID';
/** D424: custom stage boundaries outside [0, 1], clamped. */
export const WARDLEY_STAGE_CLAMPED = 'WARDLEY_STAGE_CLAMPED';
