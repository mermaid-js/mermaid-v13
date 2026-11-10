/**
 * Event modeling's diagnostic codes, in one place for the parser, the layout and the packages
 * that read their results. Each is exported from the package entry.
 *
 * - The D525 codes (`INVALID_SOURCE`, `UNKNOWN_SOURCE`, `UNKNOWN_DATA`, `UNKNOWN_FRAME`) are
 *   warnings on what v12 accepted: none of them changes the output.
 * - `DUPLICATE_FRAME` is an error, v12's thrown error: the parse fails (the facet still reads
 *   the recovered model).
 * - `CONFIG_INVALID` is a layout warning (D226): an invalid `padding` or `useMaxWidth` is
 *   replaced by its default, so the output is what the default draws.
 */

/** A `->>` source of the wrong kind (`evt ->> evt`), with v12's validator message. */
export const EVENTMODELING_INVALID_SOURCE = 'EVENTMODELING_INVALID_SOURCE';
/** A `->>` id that names no earlier frame (a later one, or none); v12 drew no relation. */
export const EVENTMODELING_UNKNOWN_SOURCE = 'EVENTMODELING_UNKNOWN_SOURCE';
/** A `[[name]]` that names no `data` block; v12 showed no data for it. */
export const EVENTMODELING_UNKNOWN_DATA = 'EVENTMODELING_UNKNOWN_DATA';
/** A `note` or `gwt` on a frame id no frame has. */
export const EVENTMODELING_UNKNOWN_FRAME = 'EVENTMODELING_UNKNOWN_FRAME';
/** A frame id used twice (v12's thrown error, with its message). An error. */
export const EVENTMODELING_DUPLICATE_FRAME = 'EVENTMODELING_DUPLICATE_FRAME';
/**
 * An `eventmodeling.padding` that is not a finite number of 0 or more (capped so the bounds stay
 * finite), or a `useMaxWidth` that is not a boolean: the default is used (D226: never NaN, one
 * warning). Not a D525 code.
 */
export const EVENTMODELING_CONFIG_INVALID = 'EVENTMODELING_CONFIG_INVALID';
