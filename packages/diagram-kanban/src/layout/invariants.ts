/**
 * Layout invariants for `KanbanLayout` (spec #424 T3), the custom layout's counterpart of the
 * graph engine's `validateLayout`. Each is a property of the output: no NaN or Infinity; every
 * column and card of the input laid out, in order; columns apart, left to right; every card
 * inside its column, below the shared title row, and clear of the next; every column title in
 * the title row at its column's top; a card's title above its ticket row; the priority bar's
 * line inside its card (in cells its stroke sits on the card's edge); no box of negative size
 * (pitfall 22); the bounds holding everything drawn (D224). Each violation is one readable
 * line. Comparisons allow a float tolerance.
 *
 * Not an invariant, because v12 does it too: a ticket or assignee over 40 px high sticks out of
 * the card's bottom. Nor is a label inside its column or card: a word wider than the wrap width
 * stays whole and overflows, as in v12 (in cells it is split between characters, and a single
 * character can still be wider than a narrow `kanban.sectionWidth` allows).
 */
import type { KanbanLayoutInput } from './input.ts';
import { drawnRects } from './extent.ts';
import type { KanbanLayout, Rect } from './types.ts';
import { nonFinite as numbers, rectsOverlap as overlaps, within } from '@mermaid-js/core/layout';

const EPS = 1e-6;
const contains = (outer: Rect, inner: Rect): boolean =>
  within(inner.x, outer.x, outer.x + outer.width) &&
  within(inner.x + inner.width, outer.x, outer.x + outer.width) &&
  within(inner.y, outer.y, outer.y + outer.height) &&
  within(inner.y + inner.height, outer.y, outer.y + outer.height);
const box = (r: Rect): string => `(${r.x}, ${r.y}, ${r.width} × ${r.height})`;

/** Every invariant `layout` breaks for `input`, one line each; empty when it holds them all. */
export function kanbanLayoutViolations(input: KanbanLayoutInput, layout: KanbanLayout): string[] {
  const out: string[] = [];
  numbers(layout, 'layout', out);
  if (out.length > 0) return out;

  if (layout.columns.length !== input.columns.length)
    out.push(`${layout.columns.length} columns laid out for ${input.columns.length} in the input`);
  const expected = input.columns.flatMap((c, k) => c.cards.map((card, i) => ({ card, k, i })));
  if (layout.cards.length !== expected.length)
    out.push(`${layout.cards.length} cards laid out for ${expected.length} in the input`);

  let ordinal = 0;
  let previousColumn: KanbanLayout['columns'][number] | undefined;
  layout.columns.forEach((column, k) => {
    ordinal++;
    const where = `column ${column.ast}`;
    const source = input.columns[k];
    if (source && column.ast !== source.ast)
      out.push(`column ${k} is ${column.ast}, not ${source.ast}`);
    if (column.ordinal !== ordinal)
      out.push(`${where} is numbered ${column.ordinal}, not ${ordinal}`);
    if (Math.abs(column.width - layout.sectionWidth) > EPS)
      out.push(`${where} is ${column.width} wide, not W = ${layout.sectionWidth}`);
    if (column.height < layout.titleRow - EPS) out.push(`${where} is shorter than the title row`);
    if (column.title) {
      if (Math.abs(column.title.y - column.y) > EPS)
        out.push(`${where}: its title is not at its top`);
      if (column.title.height > layout.titleRow + EPS)
        out.push(`${where}: its title is taller than the title row`);
      const centre = column.title.x + column.title.width / 2;
      if (Math.abs(centre - (column.x + column.width / 2)) > EPS)
        out.push(`${where}: its title is off its centre`);
    }
    if (previousColumn && previousColumn.x + previousColumn.width > column.x + EPS)
      out.push(`column ${previousColumn.ast} overlaps ${column.ast}`);
    previousColumn = column;
  });

  let previousCard: KanbanLayout['cards'][number] | undefined;
  layout.cards.forEach((card, n) => {
    const where = `card ${card.ast}`;
    const want = expected[n];
    if (want && (card.ast !== want.card.ast || card.column !== want.k || card.index !== want.i))
      out.push(
        `card ${n} is ${card.ast} (column ${card.column}, place ${card.index}), not ${want.card.ast} (column ${want.k}, place ${want.i})`
      );
    const column = layout.columns[card.column];
    if (!column) {
      out.push(`${where} names column ${card.column}, which is not laid out`);
      return;
    }
    if (!contains(column, card))
      out.push(`${where} ${box(card)} is outside its column ${box(column)}`);
    const rowEnd = column.y + layout.titleRow;
    if (card.y < rowEnd - EPS) out.push(`${where} reaches into the title row`);
    if (card.index === 0 && Math.abs(card.y - rowEnd) > EPS)
      out.push(`${where}: the first card does not start under the shared title row`);
    if (card.title)
      for (const below of [card.ticket, card.assignee])
        if (below && below.y < card.title.y + card.title.height - EPS)
          out.push(`${where}: its ticket row overlaps its title`);
    if (previousCard && previousCard.column === card.column) {
      if (overlaps(previousCard, card)) out.push(`card ${previousCard.ast} overlaps ${card.ast}`);
      if (card.y < previousCard.y + previousCard.height - EPS)
        out.push(`${card.ast} is above ${previousCard.ast}`);
    }
    previousCard = card;
    if (card.bar) {
      const { bar } = card;
      if (
        !within(bar.x, card.x, card.x + card.width) ||
        !within(bar.y1, card.y, card.y + card.height) ||
        !within(bar.y2, bar.y1, card.y + card.height)
      )
        out.push(`${where}: its priority bar is outside it`);
    }
  });

  // Pitfall 22: no box comes out with a negative size, whatever the config.
  const boxes: [string, Rect | undefined][] = [['the bounds', layout.bounds]];
  for (const c of layout.columns)
    boxes.push([`column ${c.ast}`, c], [`column ${c.ast}'s title`, c.title]);
  for (const c of layout.cards)
    boxes.push(
      [`card ${c.ast}`, c],
      [`card ${c.ast}'s title`, c.title],
      [`card ${c.ast}'s ticket`, c.ticket],
      [`card ${c.ast}'s assignee`, c.assignee]
    );
  for (const [name, r] of boxes)
    if (r && (r.width < 0 || r.height < 0)) out.push(`${name} has a negative size ${box(r)}`);
  for (const c of layout.cards)
    if (c.bar && (c.bar.width < 0 || c.bar.y2 < c.bar.y1))
      out.push(`card ${c.ast}'s priority bar has a negative size`);

  for (const r of drawnRects(layout))
    if (!contains(layout.bounds, r)) out.push(`the bounds do not hold ${box(r)}`);
  return out;
}
