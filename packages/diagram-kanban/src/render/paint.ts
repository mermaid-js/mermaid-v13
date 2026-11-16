/**
 * The colours the kanban renderer draws with (v12 `styles.ts`, D152): no theme name, no `look`
 * (D153), no gradient or shadow (D227). Every theme colour is read before the root is written,
 * so the root's style declares exactly the aliases used.
 *
 * - column k: fill and stroke `kanbanColumn<(k + 1) mod 12>` (the plugin's table, D374);
 * - column titles and card text: `textColor` (v12 `.cluster-label, .label`);
 * - card rect: fill `background`, stroke `nodeBorder` (v12 `.node rect`);
 * - the priority bar: v12's four literal colours in every theme (D375).
 */
import type { RenderContext } from '@mermaid-js/core';
import type { Paint } from '@mermaid-js/core/svg';
import { fixedPaint } from '@mermaid-js/shared/svg/document';
import type { KanbanLayout } from '../layout/index.ts';
import type { KanbanPriority } from '../priority.ts';
import { columnSlot, columnVar } from '../theme/columns.ts';

type Theme = RenderContext['theme'];

/** v12 `colorFromPriority` (`kanbanItem.ts:9-22`): renderer constants, matched exactly (D375). */
export const PRIORITY_COLORS: Readonly<Record<KanbanPriority, Paint>> = {
  'Very High': fixedPaint('red'),
  High: fixedPaint('orange'),
  Low: fixedPaint('blue'),
  'Very Low': fixedPaint('lightblue'),
};

/** A card's rect: v12's `.node rect`. */
export interface CardPaint {
  readonly fill: Paint;
  readonly stroke: Paint;
}

export interface Paints {
  /** Column `ordinal` (from 1, `ColumnLayout.ordinal`): its fill and stroke. */
  column(ordinal: number): Paint;
  readonly text: Paint;
  /** Undefined on a board with no card, so its root declares neither variable. */
  readonly card?: CardPaint;
}

export function paints(theme: Theme, layout: KanbanLayout): Paints {
  // Only the slots drawn, so the root declares no alias it does not use.
  const columns = new Map<number, Paint>();
  for (const c of layout.columns) {
    const n = columnSlot(c.ordinal);
    if (!columns.has(n)) columns.set(n, theme.color(columnVar(n)));
  }
  const text = theme.color('textColor');
  const card =
    layout.cards.length > 0
      ? { fill: theme.color('background'), stroke: theme.color('nodeBorder') }
      : undefined;
  return {
    column: (ordinal) => columns.get(columnSlot(ordinal))!,
    text,
    ...(card ? { card } : {}),
  };
}
