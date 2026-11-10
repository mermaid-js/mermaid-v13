/**
 * Usecase hover (DESIGN §4.5, D93): an actor or use case shows its kind, label, stereotype,
 * metadata, boundary, relation count and classes; a system boundary its title, frame and
 * members; a JSON table its rows; a relation id, and an arrow, the relation's type and ends; a
 * direction what it means; a keyword the one-line doc of the grammar file (`generated/docs.ts`).
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { usecaseDocs } from '../generated/docs.ts';
import type { UsecaseModel, UsecaseRelationship } from '../model.ts';
import type { UsecaseDocument, UsecaseElementKind, UsecaseStatementNode } from '../parser/ast.ts';
import { ARROW_SET } from '../parser/tables.ts';
import { generatedId } from '../parser/text.ts';
import { T } from '../parser/tokens.ts';
import { ARROW_MEANING, code, DIRECTIONS, KIND_NAMES, plural, span } from './tables.ts';
import { trimmed } from '@mermaid-js/core/parser-kit/facet';

/** At most this many members or rows are listed; the rest are counted. */
const LISTED = 8;

/** The element of `items` a symbol named `name` stands for: its id, or a quoted label (D191). */
function find<E extends { id: string; label?: string }>(items: readonly E[], name: string) {
  return (
    items.find((e) => e.id === name) ??
    items.find((e) => e.label === name && generatedId(name) === e.id)
  );
}

/** The heading: the kind in bold and the name, and for a quoted element its id. */
function head(kind: UsecaseElementKind, name: string, id: string): string {
  return `**${KIND_NAMES[kind]}** ${code(name)}${id === name ? '' : ` (id ${code(id)})`}`;
}

function relationsOf(model: UsecaseModel, id: string): UsecaseRelationship[] {
  return model.relationships.filter((r) => r.source === id || r.target === id);
}

const classesLine = (classes: readonly string[]): string[] =>
  classes.length === 0
    ? []
    : [`${classes.length === 1 ? 'Class' : 'Classes'}: ${classes.map(code).join(', ')}`];

function elementHover(kind: 'actor' | 'usecase', name: string, model: UsecaseModel) {
  const e = kind === 'actor' ? find(model.actors, name) : find(model.useCases, name);
  if (!e) return undefined;
  const parts = [head(kind, name, e.id)];
  const about: string[] = [];
  if (e.label !== name) about.push(`Label: ${code(e.label)}`);
  if (e.stereotype !== undefined) about.push(`Stereotype: «${e.stereotype}»`);
  if ('type' in e && e.type !== 'normal') {
    about.push(e.type === 'icon' ? `Icon: ${code(e.icon ?? '')}` : `Figure: ${e.type}`);
  }
  if ('shape' in e && e.shape === 'rect') about.push('Drawn as a rectangle');
  if (e.business) about.push('Business');
  if (about.length > 0) parts.push(about.join(' · '));
  const boundary = e.parentId === undefined ? undefined : find(model.boundaries, e.parentId);
  const where = boundary
    ? `In system boundary ${code(boundary.id)}${boundary.label === boundary.id ? '' : ` (${code(boundary.label)})`}`
    : 'Outside any system boundary';
  const notes = model.notes.filter((n) => n.target === e.id).length;
  const facts = [where, plural(relationsOf(model, e.id).length, 'relation')];
  if (notes > 0) facts.push(plural(notes, 'note'));
  parts.push([...facts, ...classesLine(e.classes)].join(' · '));
  return parts.join('\n\n');
}

function boundaryHover(name: string, model: UsecaseModel): string | undefined {
  const b = find(model.boundaries, name);
  if (!b) return undefined;
  const parts = [head('boundary', name, b.id)];
  const about = [`Title: ${code(b.label)}`, b.type === 'package' ? 'A package' : 'A rectangle'];
  parts.push(about.join(' · '));
  if (b.members.length === 0) parts.push('No members.');
  else {
    const shown = b.members.slice(0, LISTED).map(code);
    const more = b.members.length > LISTED ? `, … ${b.members.length - LISTED} more` : '';
    parts.push(`${plural(b.members.length, 'member')}: ${shown.join(', ')}${more}`);
  }
  const cls = classesLine(b.classes);
  if (cls.length > 0) parts.push(cls.join(''));
  return parts.join('\n\n');
}

function jsonHover(name: string, model: UsecaseModel): string | undefined {
  const j = model.jsonTables.find((x) => x.id === name);
  if (!j) return undefined;
  const keys = j.propertyOrder[''] ?? Object.keys(j.value);
  const shown = keys.slice(0, LISTED).map(code);
  const more = keys.length > LISTED ? `, … ${keys.length - LISTED} more` : '';
  const body = keys.length === 0 ? 'No keys.' : `Keys: ${shown.join(', ')}${more}`;
  const facts = [plural(j.rows.length, 'row'), plural(relationsOf(model, j.id).length, 'relation')];
  return [head('json', name, j.id), body, [...facts, ...classesLine(j.classes)].join(' · ')].join(
    '\n\n'
  );
}

/** A relation's type and ends, in one line. */
function relationLine(r: UsecaseRelationship): string {
  const ends = `${code(r.source)} to ${code(r.target)}`;
  let what: string;
  if (r.type === 'include') what = `Include: ${code(r.source)} includes ${code(r.target)}`;
  else if (r.type === 'extend') what = `Extend: ${code(r.source)} extends ${code(r.target)}`;
  else if (r.type === 'generalization') {
    what = `Generalization: ${code(r.source)} is a kind of ${code(r.target)}`;
  } else what = `Association from ${ends}, ${ARROW_MEANING[r.arrowType]}`;
  const extra: string[] = [];
  if (r.type === 'association' && r.label !== undefined) extra.push(`label ${code(r.label)}`);
  if (r.minlen > 1) extra.push(`${r.minlen} ranks long`);
  if (r.animate) extra.push(r.animation ? `animated (${r.animation})` : 'animated');
  return extra.length > 0 ? `${what} · ${extra.join(' · ')}` : what;
}

function edgeHover(name: string, model: UsecaseModel): string | undefined {
  const r = model.relationships.find((x) => x.explicitId && x.id === name);
  if (!r) return undefined;
  return [head('edge', name, r.id), relationLine(r), ...classesLine(r.classes)].join('\n\n');
}

function symbolHover(kind: string, name: string, model: UsecaseModel): string | undefined {
  switch (kind) {
    case 'actor':
    case 'usecase':
      return elementHover(kind, name, model);
    case 'boundary':
      return boundaryHover(name, model);
    case 'json':
      return jsonHover(name, model);
    case 'edge':
      return edgeHover(name, model);
    default:
      return undefined;
  }
}

/** The relation whose arrow holds `at`. */
function relationAt(children: readonly UsecaseStatementNode[], at: number) {
  for (const c of children) {
    if (c.type === 'Relation' && c.arrowRange.start <= at && at <= c.arrowRange.end) return c;
  }
  return undefined;
}

const RELATION_WORDS = new Set<number>([T.Include, T.Extend, T.Generalization, T.DependencyArrow]);

export function usecaseHover(
  at: HoverTarget,
  doc: DocumentView<UsecaseDocument>
): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as UsecaseModel;
  if (at.symbol) {
    const contents = symbolHover(at.symbol.kind, at.symbol.name, model);
    if (contents !== undefined) return { range: at.symbol.range, contents };
  }
  const t = at.token;
  if (!t) return undefined;
  const range = trimmed(text, t.range);
  if (at.offset < range.start || at.offset > range.end || range.start === range.end) {
    return undefined;
  }
  const word = text.slice(range.start, range.end);
  const docText = usecaseDocs[t.kind];
  if (ARROW_SET[t.kind] === 1 || RELATION_WORDS.has(t.kind)) {
    const node = relationAt(result.ast.children, at.offset);
    const r = node && model.relationships.find((x) => x.astId === node.id);
    const body = [`**${code(word)}**`, ...(r ? [relationLine(r)] : []), docText ?? ''];
    return { range, contents: body.filter((p) => p !== '').join('\n\n') };
  }
  const dir = DIRECTIONS.find(([, kind]) => kind === t.kind);
  if (dir) {
    return { range, contents: `**${code(word)}** direction: ${dir[2]}\n\n${docText ?? ''}`.trim() };
  }
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(word)}**\n\n${docText}` };
}
