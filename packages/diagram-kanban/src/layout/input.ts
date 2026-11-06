/**
 * What the kanban layout reads (spec #424 T3): the board as columns in order, each with its
 * cards by position (D373). It is the part of the spec's `KanbanModel` that is drawn, so a
 * small adapter from that model is all the layout needs:
 *
 * - `columns[k].title` is the column item's label, `ast` its AST id;
 * - `cards` are the column's `cards` in order, with the card's label, `ticket` and `assigned`
 *   as strings (v12 `toString()`s them), and `priority` only when the model holds a string
 *   (`priorityKind: 'other'` passes no priority).
 *
 * Labels are text as the model holds it (entities decoded); they are laid out as markdown
 * (D372). What v12 parses and never draws (icons, classes, a column's metadata, D376) is not
 * read.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';

export interface KanbanLayoutCard {
  /** The card item's AST id (`n:<id>`, `n:<id>@k` for a repeat). */
  readonly ast: AstId;
  readonly title: string;
  readonly ticket?: string;
  readonly assigned?: string;
  /** The priority as written when it is a string; v12 draws a bar for four of them (D375). */
  readonly priority?: string;
}

export interface KanbanLayoutColumn {
  readonly ast: AstId;
  readonly title: string;
  readonly cards: readonly KanbanLayoutCard[];
}

export interface KanbanLayoutInput {
  /** In source order. */
  readonly columns: readonly KanbanLayoutColumn[];
}
