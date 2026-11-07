/**
 * Every diagnostic and warning code kanban raises itself, one definition each. Shared codes
 * (`UNEXPECTED`, `UNCLOSED_*`, `SHAPE_DATA`, `NODE_LIMIT`, `URL_REFUSED`) are core's.
 */

/** A card or column indented less than the first column (v12's `getSection` threw). */
export const KANBAN_ITEM_WITHOUT_COLUMN = 'KANBAN_ITEM_WITHOUT_COLUMN';
/** An `::icon(…)` or `:::class` line before any item (v12's DB threw). */
export const KANBAN_DECORATION_BEFORE_ITEM = 'KANBAN_DECORATION_BEFORE_ITEM';
/** `@{ … }` data that is empty or `null` (v12's `addNode` threw). */
export const KANBAN_DATA_EMPTY = 'KANBAN_DATA_EMPTY';
/** A `shape` v12 refused: not a lower-case string, or one with `_`. */
export const KANBAN_SHAPE = 'KANBAN_SHAPE';
/** A `kanban` config value the layout can't honour (pitfall 22): it lays out with another. */
export const KANBAN_CONFIG_IGNORED = 'KANBAN_CONFIG_IGNORED';
/** A card priority none of the five v12 knows (D375): one warning per render. */
export const KANBAN_PRIORITY = 'KANBAN_PRIORITY';
