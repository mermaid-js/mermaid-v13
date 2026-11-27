/**
 * Accessible names (`aria-label`) of every element and relationship, as v12's renderer wrote
 * them (`usecaseRenderer.ts:46-84`), such as "business hollow actor Customer, stereotype Human",
 * "use case Login", "Note for Login: …", "Payload: region: eu; …", "package system boundary
 * Shop" and "include from Login to Pay". A label is named by the words it draws, a line at a
 * time: without its tags, Markdown markers and character references (D735).
 */
import { layoutLabel, type FontKey } from '@mermaid-js/core/text';
import {
  readLabel,
  type ActorView,
  type BoundaryView,
  type JsonTableView,
  type NoteView,
  type RelationEdgeView,
  type UseCaseView,
} from '../layout/prepare.ts';
import type { UsecaseLabelType } from '../model.ts';
import type { UsecaseRenderContext } from './context.ts';

/** A label's text for assistive technology: the words it draws, a line at a time. */
export type Speak = (text: string, type: UsecaseLabelType) => string;

/** Any font: only the words of the laid-out lines are read, never their widths. */
const FONT: FontKey = { family: 'sans-serif', size: 16, weight: 400 };

/**
 * Reads labels as the layout does ({@link readLabel}) and lays them out unwrapped, so a name has
 * the lines the label was written with. A Markdown line's words are joined by one space, as
 * v12's `markdownToLines` gave them.
 */
export function speaker(ctx: Pick<UsecaseRenderContext, 'config' | 'measurer'>): Speak {
  return (text, type) => {
    const source = readLabel(text, type, ctx.config);
    const { lines } = layoutLabel(source.text, FONT, Infinity, ctx.measurer, source);
    return lines
      .map((runs) => {
        const line = runs.map((r) => r.text).join('');
        return type === 'markdown' ? line.replace(/\s+/g, ' ').trim() : line;
      })
      .join('\n');
  };
}

export function actorName(speak: Speak, v: ActorView): string {
  const a = v.actor;
  const variant = a.type !== 'normal' ? `${a.type} ` : '';
  const business = a.business ? 'business ' : '';
  const stereotype = a.stereotype !== undefined ? `, stereotype ${a.stereotype}` : '';
  return `${business}${variant}actor ${speak(a.label, a.labelType)}${stereotype}`;
}

export function useCaseName(speak: Speak, v: UseCaseView): string {
  const u = v.useCase;
  const stereotype = u.stereotype !== undefined ? `, stereotype ${u.stereotype}` : '';
  return `${u.business ? 'business ' : ''}use case ${speak(u.label, u.labelType)}${stereotype}`;
}

/** `target` is the spoken label of the element the note is for. */
export function noteName(speak: Speak, v: NoteView, target: string): string {
  return `Note for ${target}: ${speak(v.note.label, v.note.labelType)}`;
}

export function jsonName(v: JsonTableView): string {
  const rows = v.table.rows.map((r) => `${r.accessibleKey}: ${r.value}`).join('; ');
  return rows ? `${v.table.id}: ${rows}` : v.table.id;
}

export function boundaryName(speak: Speak, v: BoundaryView): string {
  const b = v.boundary;
  return `${b.type} system boundary ${speak(b.label, b.labelType)}`;
}

/** `source` and `target` are the spoken labels of its ends. */
export function relationName(
  speak: Speak,
  v: RelationEdgeView,
  source: string,
  target: string
): string {
  const r = v.relationship;
  const relation =
    r.type === 'association' && r.label && v.label
      ? `association ${speak(r.label, r.labelType ?? 'text')}`
      : r.type;
  return `${relation} from ${source} to ${target}`;
}
