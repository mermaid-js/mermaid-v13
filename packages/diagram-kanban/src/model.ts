/**
 * KanbanModel: the plain-data result of a kanban parse (spec #424 §Parser, T2), and the input of
 * the kanban layout. It keeps v12's data, so model parity holds against `kanbanDb.ts`:
 *
 * - items in source order. The first item's indent is the column level: an item at that indent
 *   is a column, and any other item is a card of the last column before it, at any depth (v12
 *   `getSection`; a card is never a child of a card);
 * - ids and labels as v12's grammar handed them to its DB, entities decoded and line breaks
 *   kept. v12 passed them through `sanitizeText`; v13 writes text escaped instead, so nothing
 *   is removed here. Every label is markdown (v12 set `labelType: 'markdown'`);
 * - `@{ … }` data as v12's `addNode` read it: a truthy `label` replaces the text; truthy
 *   `ticket`, `assigned` and `icon` are kept as JavaScript strings (`[x, y]` reads `x,y`); a
 *   truthy `priority` is kept, a string as it is and any other value as its JSON text
 *   (`priorityKind: 'other'`); `shape` is checked and otherwise ignored; other keys are ignored;
 * - a card belongs to the column it follows (D373: by position, where v12 listed every card of
 *   every column with the same id under each), and keeps v12's `parentId`, its column's id.
 *
 * AST ids (D289, DESIGN §4.2): `n:<id>` for columns and cards alike, `n:<id>@k` for the k-th
 * item with the same id (blanks around the id dropped); an id-less item's id is its text.
 * Decorations and data belong to their item.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** How an item's `priority` was written: a YAML string, or any other value (D375). */
export type KanbanPriorityKind = 'text' | 'other';

export interface KanbanItem {
  /** `n:<id>` or `n:<id>@k`. */
  readonly ast: AstId;
  /** v12's `id`: the id as written, or the text for an item written without one. */
  readonly id: string;
  /** v12's `label`: the text in the shape (the inside of a string), the id, or `label:`'s value. */
  readonly label: string;
  /** v12's `level`: the indent width as written (tabs count 1); 0 with none. */
  readonly level: number;
  /** Whether the item is a column (at the first item's level) or a card. */
  readonly isColumn: boolean;
  /** Index into `KanbanModel.columns` of its column: its own for a column. */
  readonly column: number;
  /** v12's `parentId` for a card: its column's id. Undefined for a column. */
  readonly parentId?: string;
  /** `@{ ticket }`. */
  readonly ticket?: string;
  /** `@{ assigned }`. */
  readonly assigned?: string;
  /** `@{ priority }`: the string, or with `priorityKind: 'other'` the value's JSON text. */
  readonly priority?: string;
  /** Set with `priority`. */
  readonly priorityKind?: KanbanPriorityKind;
  /** The last of `@{ icon }` and the `::icon(…)` lines after the item (drawn by none, D376). */
  readonly icon?: string;
  /** The words of the last `:::` line after the item (a later line replaces it, as in v12). */
  readonly classes: readonly string[];
}

export interface KanbanColumn {
  /** Index into `KanbanModel.items` of the column item. */
  readonly item: number;
  /** Indexes into `KanbanModel.items` of its cards, in source order (D373). */
  readonly cards: readonly number[];
}

export interface KanbanModel {
  /** In source order. Empty when the text has no item. */
  readonly items: readonly KanbanItem[];
  /** The column items in source order, each with its cards. */
  readonly columns: readonly KanbanColumn[];
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
