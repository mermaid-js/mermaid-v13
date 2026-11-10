/**
 * The C4 facet's slot docs (DESIGN §4.5, D93, D95): what each slot name and `$name` does, for
 * hover. The slots themselves are the parser's (`parser/slots.ts`), the table the builder reads
 * arguments by. Keyword docs are not here: they come from the grammar file (`generated/docs.ts`).
 */
import type { SlotTable } from '../parser/slots.ts';

/** The macro's signature, optional slots marked: `Person(alias, label, descr?, …)`. */
export function signature(macro: string, table: SlotTable): string {
  const names = table.slots.map((s, k) => (k < table.required ? s.name : `${s.name}?`));
  return `${macro}(${names.join(', ')})`;
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
