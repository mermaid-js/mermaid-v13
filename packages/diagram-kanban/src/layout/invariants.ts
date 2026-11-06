/**
 * Layout invariants for `KanbanLayout` (spec #424 T3), the custom layout's counterpart of the
 * graph engine's `validateLayout`. Each is a property of the output: no NaN or Infinity; every
 * column and card of the input laid out, in order; columns apart, left to right; every card
 * inside its column, below the shared title row, and clear of the next; every column title in
 * the title row at its column's top; a card's title above its ticket row; the priority bar's
 * line inside its card (in cells its stroke sits on the card's edge); the bounds holding everything drawn (D224). Each violation is one readable
 * line. Comparisons allow a float tolerance.
 *
 * Not invariants, because v12 does them too: a title word wider than its wrap width overflows
 * its column or card, and a ticket or assignee over 40 px high sticks out of the card's bottom.
 */
import type { KanbanLayoutInput } from './input.ts';
import { drawnRects } from './extent.ts';
import type { KanbanLayout, Rect } from './types.ts';

const EPS = 1e-6;

function numbers(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} is ${value}`);
  } else if (Array.isArray(value)) value.forEach((v, i) => numbers(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) numbers(v, `${path}.${k}`, out);
}

const within = (v: number, lo: number, hi: number): boolean => v >= lo - EPS && v <= hi + EPS;
const contains = (outer: Rect, inner: Rect): boolean =>
  within(inner.x, outer.x, outer.x + outer.width) &&
  within(inner.x + inner.width, outer.x, outer.x + outer.width) &&
  within(inner.y, outer.y, outer.y + outer.height) &&
  within(inner.y + inner.height, outer.y, outer.y + outer.height);
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width - EPS &&
  b.x < a.x + a.width - EPS &&
  a.y < b.y + b.height - EPS &&
  b.y < a.y + a.height - EPS;
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

  layout.columns.forEach((c, k) => {
    const where = `column ${c.ast}`;
    const source = input.columns[k];
    if (source && c.ast !== source.ast) out.push(`column ${k} is ${c.ast}, not ${source.ast}`);
    if (c.slot !== k + 1) out.push(`${where} has slot ${c.slot}, not ${k + 1}`);
    if (Math.abs(c.width - layout.sectionWidth) > EPS)
      out.push(`${where} is ${c.width} wide, not W = ${layout.sectionWidth}`);
    if (c.height < layout.titleRow - EPS) out.push(`${where} is shorter than the title row`);
    if (c.title) {
      if (Math.abs(c.title.y - c.y) > EPS) out.push(`${where}: its title is not at its top`);
      if (c.title.height > layout.titleRow + EPS)
        out.push(`${where}: its title is taller than the title row`);
      const centre = c.title.x + c.title.width / 2;
      if (Math.abs(centre - (c.x + c.width / 2)) > EPS)
        out.push(`${where}: its title is off its centre`);
    }
    const next = layout.columns[k + 1];
    if (next && c.x + c.width > next.x + EPS) out.push(`${where} overlaps ${next.ast}`);
  });

  layout.cards.forEach((card, n) => {
    const where = `card ${card.ast}`;
    const want = expected[n];
    if (want && (card.ast !== want.card.ast || card.column !== want.k || card.index !== want.i))
      out.push(
        `card ${n} is ${card.ast} (column ${card.column}, place ${card.index}), not ${want.card.ast} (column ${want.k}, place ${want.i})`
      );
    const col = layout.columns[card.column];
    if (!col) {
      out.push(`${where} names column ${card.column}, which is not laid out`);
      return;
    }
    if (!contains(col, card)) out.push(`${where} ${box(card)} is outside its column ${box(col)}`);
    const rowEnd = col.y + layout.titleRow;
    if (card.y < rowEnd - EPS) out.push(`${where} reaches into the title row`);
    if (card.index === 0 && Math.abs(card.y - rowEnd) > EPS)
      out.push(`${where}: the first card does not start under the shared title row`);
    if (card.title)
      for (const below of [card.ticket, card.assignee])
        if (below && below.y < card.title.y + card.title.height - EPS)
          out.push(`${where}: its ticket row overlaps its title`);
    if (card.bar) {
      const b = card.bar;
      if (
        !within(b.x, card.x, card.x + card.width) ||
        !within(b.y1, card.y, card.y + card.height) ||
        !within(b.y2, b.y1, card.y + card.height)
      )
        out.push(`${where}: its priority bar is outside it`);
    }
    const next = layout.cards[n + 1];
    if (next && next.column === card.column) {
      if (overlaps(card, next)) out.push(`${where} overlaps ${next.ast}`);
      if (next.y < card.y + card.height - EPS) out.push(`${next.ast} is above ${card.ast}`);
    }
  });

  for (const r of drawnRects(layout))
    if (!contains(layout.bounds, r)) out.push(`the bounds do not hold ${box(r)}`);
  return out;
}
