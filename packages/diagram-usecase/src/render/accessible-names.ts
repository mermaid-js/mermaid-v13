/**
 * Accessible names (`aria-label`) of every element and relationship, as v12's renderer wrote
 * them (`usecaseRenderer.ts:46-84`), such as "business hollow actor Customer, stereotype Human",
 * "use case Login", "Note for Login: …", "Payload: region: eu; …", "package system boundary
 * Shop" and "include from Login to Pay". A Markdown label is named by its words, as
 * `markdownToLines` gave them, a line at a time.
 */
import type {
  ActorView,
  BoundaryView,
  JsonTableView,
  NoteView,
  RelationEdgeView,
  UseCaseView,
} from '../layout/prepare.ts';
import type { UsecaseLabelType } from '../model.ts';

/** Markdown's emphasis and code markers: `**`, `__`, `*`, backticks, and `_` beside a space. */
const MARKERS = /\*+|`+|(?<=^|\s)_+|_+(?=\s|$)/g;

/**
 * A label's text for assistive technology: as written, or a Markdown label's words without
 * their markers, a line at a time (v12 `markdownToLines`, words joined by a space).
 */
export function spoken(text: string, type: UsecaseLabelType): string {
  if (type !== 'markdown') return text;
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(MARKERS, '').replace(/\s+/g, ' ').trim())
    .join('\n');
}

export function actorName(v: ActorView): string {
  const a = v.actor;
  const variant = a.type !== 'normal' ? `${a.type} ` : '';
  const business = a.business ? 'business ' : '';
  const stereotype = a.stereotype !== undefined ? `, stereotype ${a.stereotype}` : '';
  return `${business}${variant}actor ${spoken(a.label, a.labelType)}${stereotype}`;
}

export function useCaseName(v: UseCaseView): string {
  const u = v.useCase;
  const stereotype = u.stereotype !== undefined ? `, stereotype ${u.stereotype}` : '';
  return `${u.business ? 'business ' : ''}use case ${spoken(u.label, u.labelType)}${stereotype}`;
}

/** `target` is the spoken label of the element the note is for. */
export function noteName(v: NoteView, target: string): string {
  return `Note for ${target}: ${spoken(v.note.label, v.note.labelType)}`;
}

export function jsonName(v: JsonTableView): string {
  const rows = v.table.rows.map((r) => `${r.accessibleKey}: ${r.value}`).join('; ');
  return rows ? `${v.table.id}: ${rows}` : v.table.id;
}

export function boundaryName(v: BoundaryView): string {
  const b = v.boundary;
  return `${b.type} system boundary ${spoken(b.label, b.labelType)}`;
}

/** `source` and `target` are the spoken labels of its ends. */
export function relationName(v: RelationEdgeView, source: string, target: string): string {
  const r = v.relationship;
  const relation =
    r.type === 'association' && r.label && v.label
      ? `association ${spoken(r.label, r.labelType ?? 'text')}`
      : r.type;
  return `${relation} from ${source} to ${target}`;
}
