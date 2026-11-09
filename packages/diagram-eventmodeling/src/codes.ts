/**
 * Event modeling's diagnostic codes (D525), in one place for the parser and the packages that
 * read its results. Each is exported from the package entry. They are warnings: the type
 * accepts everything v12 accepts, and none of them changes the output.
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
 * An `eventmodeling.padding` that is not a number of 0 or more: the layout uses v12's 30 (D226:
 * never NaN, one warning). Not a D525 code: it changes nothing v12 would have drawn.
 */
export const EVENTMODELING_CONFIG_INVALID = 'EVENTMODELING_CONFIG_INVALID';
