/**
 * The C4 facet's tables (DESIGN §4.5, D95): each macro's argument slots, in order, and the
 * hover doc of each slot name. Keyword docs are not here: they come from the grammar file
 * (`generated/docs.ts`). The slots are the ones `parser/build.ts` reads, by position or as
 * `$name="…"`.
 */
import type { Range } from '@mermaid-js/core/parser-kit';
import { T } from '../parser/tokens.ts';

/** What an argument slot does. */
export type SlotRole = 'alias' | 'reference' | 'text';

export interface Slot {
  readonly name: string;
  readonly role: SlotRole;
}

const slot = (name: string, role: SlotRole = 'text'): Slot => ({ name, role });
const ALIAS = slot('alias', 'alias');
const LABEL = slot('label');
const FROM = slot('from', 'reference');
const TO = slot('to', 'reference');
const TAIL = [slot('sprite'), slot('tags'), slot('link')];

const ELEMENT = [ALIAS, LABEL, slot('descr'), ...TAIL];
const TECHN_ELEMENT = [ALIAS, LABEL, slot('techn'), slot('descr'), ...TAIL];
const BOUNDARY = [ALIAS, LABEL, slot('type'), slot('tags'), slot('link')];
/** `Enterprise_Boundary`, `System_Boundary`, `Container_Boundary`: the type is spliced in. */
const TYPED_BOUNDARY = [ALIAS, LABEL, slot('tags'), slot('link')];
const NODE = [ALIAS, LABEL, slot('type'), slot('descr'), ...TAIL];
const REL = [FROM, TO, LABEL, slot('techn'), slot('descr'), ...TAIL];
const ELEMENT_STYLE = [
  slot('elementName', 'reference'),
  slot('bgColor'),
  slot('fontColor'),
  slot('borderColor'),
  slot('shadowing'),
  slot('shape'),
  slot('sprite'),
  slot('techn'),
  slot('legendText'),
  slot('legendSprite'),
];
const REL_STYLE = [
  FROM,
  TO,
  slot('textColor'),
  slot('lineColor'),
  slot('offsetX'),
  slot('offsetY'),
];
const LAYOUT = [slot('c4ShapeInRow'), slot('c4BoundaryInRow')];

/** Each macro keyword kind's slots, in argument order. */
export const SLOTS: ReadonlyMap<number, readonly Slot[]> = new Map<number, readonly Slot[]>([
  [T.Person, ELEMENT],
  [T.PersonExt, ELEMENT],
  [T.System, ELEMENT],
  [T.SystemDb, ELEMENT],
  [T.SystemQueue, ELEMENT],
  [T.SystemExt, ELEMENT],
  [T.SystemDbExt, ELEMENT],
  [T.SystemQueueExt, ELEMENT],
  [T.Container, TECHN_ELEMENT],
  [T.ContainerDb, TECHN_ELEMENT],
  [T.ContainerQueue, TECHN_ELEMENT],
  [T.ContainerExt, TECHN_ELEMENT],
  [T.ContainerDbExt, TECHN_ELEMENT],
  [T.ContainerQueueExt, TECHN_ELEMENT],
  [T.Component, TECHN_ELEMENT],
  [T.ComponentDb, TECHN_ELEMENT],
  [T.ComponentQueue, TECHN_ELEMENT],
  [T.ComponentExt, TECHN_ELEMENT],
  [T.ComponentDbExt, TECHN_ELEMENT],
  [T.ComponentQueueExt, TECHN_ELEMENT],
  [T.Boundary, BOUNDARY],
  [T.EnterpriseBoundary, TYPED_BOUNDARY],
  [T.SystemBoundary, TYPED_BOUNDARY],
  [T.ContainerBoundary, TYPED_BOUNDARY],
  [T.Node, NODE],
  [T.NodeL, NODE],
  [T.NodeR, NODE],
  [T.Rel, REL],
  [T.BiRel, REL],
  [T.RelU, REL],
  [T.RelD, REL],
  [T.RelL, REL],
  [T.RelR, REL],
  [T.RelB, REL],
  [T.RelIndex, [slot('index'), ...REL]],
  [T.UpdateElementStyle, ELEMENT_STYLE],
  [T.UpdateRelStyle, REL_STYLE],
  [T.UpdateLayoutConfig, LAYOUT],
]);

/** The macro's signature, optional slots marked: `Person(alias, label, descr?, …)`. */
export function signature(macro: string, slots: readonly Slot[], required: number): string {
  const names = slots.map((s, k) => (k < required ? s.name : `${s.name}?`));
  return `${macro}(${names.join(', ')})`;
}

/** How many leading slots a macro needs: v12 drops a relation without its first three. */
export function requiredSlots(kind: number): number {
  if (kind === T.UpdateLayoutConfig) return 0;
  if (kind === T.UpdateElementStyle) return 1;
  if (kind === T.UpdateRelStyle) return 2;
  if (kind === T.RelIndex) return 4;
  const slots = SLOTS.get(kind);
  return slots?.[0]?.role === 'reference' ? 3 : 2;
}

const NOT_DRAWN = 'Kept, not drawn (as mermaid@12).';

/** The hover doc of each slot name. */
export const SLOT_DOCS: Readonly<Record<string, string>> = {
  alias: 'The name other statements use for it: relation ends and `Update…Style` targets.',
  label: 'The text drawn for it (in bold on an element or a boundary).',
  descr: 'The description, drawn under the label.',
  techn: 'The technology, drawn in brackets under the label (`[Container: …]` on an element).',
  type: 'The type, drawn in brackets under the label.',
  sprite: `A sprite. ${NOT_DRAWN} A shape word in it (\`cylinder\`, \`queue\`, …) picks the shape.`,
  tags: `Tags. ${NOT_DRAWN} A shape word among them picks the shape.`,
  link: `A link. ${NOT_DRAWN}`,
  from: 'The alias of the element or boundary the relation starts at (an element first).',
  to: 'The alias of the element or boundary the relation ends at (an element first).',
  index: 'The relation’s index. Not drawn.',
  elementName: 'The alias of the element to style, else of the boundary.',
  bgColor: 'The fill colour.',
  fontColor: 'The text colour (an element’s; a boundary keeps its own).',
  borderColor: 'The outline colour.',
  shadowing: NOT_DRAWN,
  shape: 'The shape: a shape word (`rounded`, `cylinder`, …) replaces the element’s own.',
  legendText: NOT_DRAWN,
  legendSprite: NOT_DRAWN,
  textColor: 'The colour of the relation’s label.',
  lineColor: 'The colour of the relation’s line.',
  offsetX: 'Moves the relation’s label across, in whole pixels.',
  offsetY: 'Moves the relation’s label down, in whole pixels.',
  c4ShapeInRow: 'How many shapes go in a row (by position: the first argument).',
  c4BoundaryInRow: 'How many boundaries go in a row (by position: the second argument).',
  // Names, not slots: what v12 took them for.
  parentBoundary: 'Moves it into the boundary with that alias (`global`: the top level).',
  typeC4Shape: 'Changes the element’s kind (`person`, `system_db`, `external_container`, …).',
  nodeType: 'Changes a deployment node’s kind (`node`, `nodeL`, `nodeR`).',
  wrap: 'Changes nothing: wrapping follows the `c4.wrap` config.',
};

/** A relation's `$type`: its kind. */
export const RELATION_TYPE_DOC = 'The relation’s kind (`rel`, `birel`, `rel_u`, `rel_b`, …).';

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });

/** The text of the line before `at`. */
export function lineBefore(text: string, at: number): string {
  let from = at;
  while (from > 0 && !/[\n\r]/.test(text.charAt(from - 1))) from--;
  return text.slice(from, at);
}
