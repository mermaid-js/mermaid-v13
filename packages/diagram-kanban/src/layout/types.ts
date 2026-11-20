/**
 * KanbanLayout: the plain-data result of the kanban custom layout (`layoutKind: 'custom'`, spec
 * #424 T3). Lengths are in the render's units (px, or cells for the text output). Rectangles
 * have their top-left corner at `x`, `y`. Positions are v12's: column k (from 1) is centred at
 * `W·k + 5(k − 1)` and every column's top is at `−1.5 W`. Colours are left to the renderer.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey } from '@mermaid-js/core/text';
import type { PlacedLabel, Rect } from '@mermaid-js/shared/layout';
import type { KanbanPriority } from '../priority.ts';

export type { KanbanPriority };

export type { PlacedLabel, Rect };

/** The priority bar on a card's left edge: a vertical line `width` wide, centred on `x`. */
export interface PriorityBar {
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
  readonly width: number;
  readonly priority: KanbanPriority;
}

export interface CardLayout extends Rect {
  readonly ast: AstId;
  /** Index into `KanbanLayout.columns` of its column. */
  readonly column: number;
  /** Its place in the column, from 0. */
  readonly index: number;
  /** Left-aligned, wrapped at `W − 25`; undefined for a title with no text. */
  readonly title?: PlacedLabel;
  /** Left-aligned, under the title; undefined without a ticket. */
  readonly ticket?: PlacedLabel;
  /**
   * Right-aligned on the ticket's row, or on a row of its own under the ticket when the two do
   * not fit side by side (D647): the box's right edge is `labelInset` in from the card's, and
   * the renderer ends each line there (`text-anchor="end"`); undefined without an assignee.
   */
  readonly assignee?: PlacedLabel;
  /** Undefined unless the priority is one of the four (D375). */
  readonly bar?: PriorityBar;
}

export interface ColumnLayout extends Rect {
  readonly ast: AstId;
  /**
   * The column's number from 1: v12's `section-<n>` class; the renderer colours it by the
   * `cScale` slot this number maps to (D374, `theme/columns.ts`).
   */
  readonly ordinal: number;
  /**
   * Wrapped at `W` and centred on the column. A word wider than `W` stays whole and overflows
   * both sides, as in v12 (in cells it is split between characters). The bounds hold the title
   * (D224).
   */
  readonly title?: PlacedLabel;
}

export interface KanbanLayout {
  readonly units: 'px' | 'cell';
  /** The font every label was measured in, and so is drawn in (pitfall 16). */
  readonly font: FontKey;
  /** `W`: every column's width. */
  readonly sectionWidth: number;
  /** The title row every column shares: its height (`max(25, tallest title)`). */
  readonly titleRow: number;
  /** Corner radius of columns and cards (v12 `rx = ry = 5`). */
  readonly radius: number;
  /** Outline width of columns and cards. */
  readonly stroke: number;
  /** In source order. */
  readonly columns: readonly ColumnLayout[];
  /** Every card, column by column, top to bottom. */
  readonly cards: readonly CardLayout[];
  /** What is drawn, `kanban.padding` around it: the SVG `viewBox` (D224, D378). */
  readonly bounds: Rect;
}
