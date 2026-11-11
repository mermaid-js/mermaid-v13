/**
 * Kanban hover (DESIGN §4.5, D93): `kanban`, `::icon(` and `:::` their one-line doc from the
 * grammar file (`generated/docs.ts`); a `@{ … }` key its doc (`tables.ts`); an item (its id,
 * delimiters or text) whether it is a column or a card, with what its data sets; a class and an
 * assignee their use. Never a preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { kanbanDocs } from '../generated/docs.ts';
import type { KanbanItem, KanbanModel } from '../model.ts';
import type { KanbanDocument, KanbanItemNode } from '../parser/ast.ts';
import { FIRST_LINE } from '../parser/text.ts';
import { T } from '../parser/tokens.ts';
import { code, KEY_DOCS, span } from './tables.ts';
import { plural } from '@mermaid-js/shared/parser/facet';

/** The tokens of an item statement, its data aside. */
const ITEM_TOKENS = new Set<number>([
  T.NodeId,
  T.NodeDStart,
  T.NodeDescr,
  T.NodeDEnd,
  T.StringStart,
  T.StringEnd,
  T.MdStringStart,
  T.MdStringEnd,
]);

/** The item statement holding `at` (AST nodes are in source order and never overlap). */
function itemAt(doc: DocumentView<KanbanDocument>, at: number): KanbanItemNode | undefined {
  const items = doc.result.ast.children;
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const n = items[mid]!;
    if (n.range.end < at) lo = mid + 1;
    else if (n.range.start > at) hi = mid - 1;
    else return n;
  }
  return undefined;
}

/** One line: the first, cut at 40 characters. */
function short(text: string): string {
  const line = FIRST_LINE.exec(text.trim())?.[0] ?? '';
  return line.length > 40 || line.length < text.trim().length ? `${line.slice(0, 40)}…` : line;
}

function itemHover(model: KanbanModel, item: KanbanItem): string {
  const id = item.id.trim();
  const what = item.isColumn ? 'column' : 'card';
  const facts: string[] = [];
  if (item.label.trim() !== id) facts.push(`Text: ${code(short(item.label))}`);
  const column = model.columns[item.column];
  if (item.isColumn) {
    facts.push(`Column ${item.column + 1} · ${plural(column?.cards.length ?? 0, 'card')}`);
  } else {
    const owner = column === undefined ? undefined : model.items[column.item];
    if (owner) facts.push(`In column ${code(short(owner.id))}`);
  }
  // A column's ticket, assignee and priority are kept but not drawn (D376).
  const drawn = item.isColumn ? ' (not drawn on a column)' : '';
  if (item.ticket !== undefined) facts.push(`Ticket: ${code(short(item.ticket))}${drawn}`);
  if (item.assigned !== undefined) facts.push(`Assigned: ${code(short(item.assigned))}${drawn}`);
  if (item.priority !== undefined) facts.push(`Priority: ${code(short(item.priority))}${drawn}`);
  if (item.classes.length > 0) {
    facts.push(
      `${item.classes.length === 1 ? 'Class' : 'Classes'}: ${item.classes.map(code).join(', ')}`
    );
  }
  const title = id === '' ? `**${what}**` : `**${what}** ${code(id)}`;
  return [title, ...facts].join('\n\n');
}

function classHover(name: string, model: KanbanModel): string {
  const n = model.items.filter((x) => x.classes.includes(name)).length;
  return `**class** ${code(name)}\n\nUsed by ${plural(n, 'item')}`;
}

function assigneeHover(name: string, model: KanbanModel): string {
  const on = model.items.filter((x) => x.assigned === name);
  const cards = on.filter((x) => !x.isColumn).length;
  const columns = on.length - cards;
  const more = columns === 0 ? '' : ` and ${plural(columns, 'column')} (not drawn)`;
  return `**assignee** ${code(name)}\n\nAssigned ${plural(cards, 'card')}${more}`;
}

/** The `@{ … }` key under `at` in the data token `[start, end)`, with its range. */
function keyAt(text: string, start: number, end: number, at: number) {
  let from = at;
  while (from > start && /[A-Za-z]/.test(text.charAt(from - 1))) from--;
  let to = at;
  while (to < end && /[A-Za-z]/.test(text.charAt(to))) to++;
  const key = text.slice(from, to);
  if (KEY_DOCS[key] === undefined) return undefined;
  if (!/^[\t ]*:/.test(text.slice(to, end))) return undefined;
  // Where a key goes: after `@{`, a line break or a `,`.
  const before = text.slice(start, from).replace(/[\t ]+$/, '');
  if (before !== '' && !/[\n\r,]$/.test(before)) return undefined;
  return { key, range: span(from, to) };
}

export function kanbanHover(at: HoverTarget, doc: DocumentView<KanbanDocument>): Hover | undefined {
  const model = doc.result.model as KanbanModel;
  const s = at.symbol;
  if (s?.kind === 'class') return { range: s.range, contents: classHover(s.name, model) };
  if (s?.kind === 'assignee') return { range: s.range, contents: assigneeHover(s.name, model) };
  const t = at.token;
  if (!t) return undefined;
  const { start, end } = t.range;
  const docText = kanbanDocs[t.kind];
  if (docText !== undefined) {
    const word = doc.text.slice(start, end);
    return { range: span(start, end), contents: `**${code(word)}**\n\n${docText}` };
  }
  if (t.kind === T.ShapeData) {
    const key = keyAt(doc.text, start, end, at.offset);
    if (!key) return undefined;
    return { range: key.range, contents: `**${code(key.key)}**\n\n${KEY_DOCS[key.key]}` };
  }
  if (!ITEM_TOKENS.has(t.kind)) return undefined;
  const node = itemAt(doc, at.offset);
  const item = node && model.items.find((x) => x.ast === node.id);
  if (!node || !item) return undefined;
  return { range: node.range, contents: itemHover(model, item) };
}
