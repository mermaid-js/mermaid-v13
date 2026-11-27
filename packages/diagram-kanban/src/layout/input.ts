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
 * Labels are text as the model holds it (entities as written, `&amp;`), read by core's label
 * handler (#1368): a title the parser found as a markdown string (D712) comes without its
 * wrapper and with `markdown` set, and is laid out as markdown; any other label is plain
 * (`<br>`, the drawn tags, entities, math and icons; markdown syntax as written) unless
 * `markdownAlwaysOn` is set. Core's label layout decodes the entities. What v12 parses and never
 * draws (icons, classes, a column's metadata, D376) is not read.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';

export interface KanbanLayoutCard {
  /** The card item's AST id (`n:<id>`, `n:<id>@k` for a repeat). */
  readonly ast: AstId;
  readonly title: string;
  /** Set when the title was written as a markdown string, which `title` holds unwrapped. */
  readonly markdown?: true;
  readonly ticket?: string;
  readonly assigned?: string;
  /** The priority as written when it is a string; v12 draws a bar for four of them (D375). */
  readonly priority?: string;
}

export interface KanbanLayoutColumn {
  readonly ast: AstId;
  readonly title: string;
  /** Set when the title was written as a markdown string, which `title` holds unwrapped. */
  readonly markdown?: true;
  readonly cards: readonly KanbanLayoutCard[];
}

export interface KanbanLayoutInput {
  /** In source order. */
  readonly columns: readonly KanbanLayoutColumn[];
}
