/**
 * Architecture's diagnostic codes (#599), in one place for the parser and, later, the layout and
 * the renderer. Each error carries v12's DB message word for word (`architectureDb.ts`), except
 * {@link ARCHITECTURE_GROUP_EDGE_END}, which takes Pele's (D504). Each is exported from the
 * package entry.
 */

/** v12: `The service id [a] is already in use by another node` (services, junctions, groups). */
export const ARCHITECTURE_DUPLICATE_ID = 'ARCHITECTURE_DUPLICATE_ID';
/** v12: `The service [a] cannot be placed within itself`. */
export const ARCHITECTURE_SELF_PARENT = 'ARCHITECTURE_SELF_PARENT';
/** v12: `The service [a]'s parent does not exist. Please make sure …`. */
export const ARCHITECTURE_UNKNOWN_PARENT = 'ARCHITECTURE_UNKNOWN_PARENT';
/** v12: `The service [a]'s parent is not a group`. */
export const ARCHITECTURE_PARENT_NOT_GROUP = 'ARCHITECTURE_PARENT_NOT_GROUP';
/** v12: `The left-hand id [a] does not yet exist. Please create …` (or `right-hand`). */
export const ARCHITECTURE_UNKNOWN_ID = 'ARCHITECTURE_UNKNOWN_ID';
/**
 * D504: an edge end that names a group, with Pele's message (`The left-hand id [g] is a group.`
 * and how to fix it), where v12 threw a `TypeError`.
 */
export const ARCHITECTURE_GROUP_EDGE_END = 'ARCHITECTURE_GROUP_EDGE_END';
/** v12: `The left-hand id [a] is modified to traverse the group boundary, but …`. */
export const ARCHITECTURE_GROUP_EDGE_SAME_GROUP = 'ARCHITECTURE_GROUP_EDGE_SAME_GROUP';
/** v12: `align row references [x], which is not a service or junction`. */
export const ARCHITECTURE_ALIGN_MEMBER = 'ARCHITECTURE_ALIGN_MEMBER';
/** v12: `align row lists [x] more than once`. */
export const ARCHITECTURE_ALIGN_REPEAT = 'ARCHITECTURE_ALIGN_REPEAT';
/**
 * v12: `An align directive requires at least two members; got 1`. The grammar asks for two, so
 * only a caller of the DB checks ({@link ArchitectureRegistry}) can meet it.
 */
export const ARCHITECTURE_ALIGN_SHORT = 'ARCHITECTURE_ALIGN_SHORT';
/**
 * D504 (warning): `{group}` on an edge end whose service or junction is in no group. Ignored,
 * where v12 still moved the end; one warning per render, every further place in `related`.
 */
export const ARCHITECTURE_GROUP_EDGE_UNGROUPED = 'ARCHITECTURE_GROUP_EDGE_UNGROUPED';
/**
 * Warning (#607, pitfall 22): `architecture.iconSize` is not a number above 0, or
 * `architecture.padding` not one of at least 0; the layout uses v12's default (80, 40).
 */
export const ARCHITECTURE_CONFIG_IGNORED = 'ARCHITECTURE_CONFIG_IGNORED';
/**
 * Warning (#614, GAPS T3): an edge with an arrowhead at each end whose line is shorter than the
 * two heads (`iconSize / 6` each): `compass`'s gap between nodes is fixed, so a large
 * `architecture.iconSize` would draw them over each other. Both heads shrink to half the line;
 * one warning per render. Never raised at the default sizes (60 px against 27).
 */
export const ARCHITECTURE_ARROW_SHRUNK = 'ARCHITECTURE_ARROW_SHRUNK';
