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
import { checkColor, type Paint } from '@mermaid-js/core/svg';
import type { KanbanLayout, KanbanPriority } from '../layout/index.ts';
import { columnSlot, columnVar } from './slots.ts';

type Theme = RenderContext['theme'];

const fixed = (c: string): Paint => checkColor(c) as Paint;

/** v12 `colorFromPriority` (`kanbanItem.ts:9-22`): renderer constants, matched exactly (D375). */
export const PRIORITY_COLORS: Readonly<Record<KanbanPriority, Paint>> = {
  'Very High': fixed('red'),
  High: fixed('orange'),
  Low: fixed('blue'),
  'Very Low': fixed('lightblue'),
};

export interface Paints {
  /** Column `slot` (from 1, `ColumnLayout.slot`): its fill and stroke. */
  column(slot: number): Paint;
  readonly text: Paint;
  readonly cardFill: Paint;
  readonly cardStroke: Paint;
}

export function paints(theme: Theme, layout: KanbanLayout): Paints {
  // Only the slots drawn, so the root declares no alias it does not use.
  const columns = new Map<number, Paint>();
  for (const c of layout.columns) {
    const n = columnSlot(c.slot);
    if (!columns.has(n)) columns.set(n, theme.color(columnVar(n)));
  }
  const text = theme.color('textColor');
  const card = layout.cards.length > 0;
  return {
    column: (slot) => columns.get(columnSlot(slot)) ?? text,
    text,
    cardFill: card ? theme.color('background') : text,
    cardStroke: card ? theme.color('nodeBorder') : text,
  };
}
