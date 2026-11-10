/**
 * Each macro's argument slots, in order, and the names a `$name="…"` argument sets: the one
 * table the builder reads arguments by (`build.ts`) and the language facet completes and hovers
 * from (`facet/`). The slots are v12's (`c4Db.ts`); D452 and D457 changed what some do, not
 * where they are.
 */
import { T } from './tokens.ts';

/** What an argument slot holds. */
export type SlotRole = 'alias' | 'reference' | 'text';

export interface Slot {
  readonly name: string;
  readonly role: SlotRole;
  /** Read and dropped: v12 never stored it (a deployment node's sprite). */
  readonly dropped?: true;
  /** Left out, v12 stored `''` (an element's or a relation's `descr` and `techn`). */
  readonly blank?: true;
}

/**
 * What a statement's `$name`s set: an element's, a boundary's or a relation's fields, the
 * element (else boundary) `UpdateElementStyle` names, or nothing (`UpdateLayoutConfig` reads
 * by position).
 */
export type NamesOf = 'element' | 'boundary' | 'relation' | 'styled' | 'none';

/** A macro's slots as written, and what its arguments are read with. */
export interface SlotTable {
  readonly slots: readonly Slot[];
  /** How many leading slots the statement needs (v12 drops a relation without its three). */
  readonly required: number;
  /**
   * The structural names v12's DB call set again after the arguments, so a `$name` argument
   * with one of them changes nothing in this statement.
   */
  readonly setAfter: ReadonlySet<string>;
  readonly names: NamesOf;
}

/** The fields a named argument sets on an element or a boundary; any other name is `extra`. */
export const ELEMENT_FIELDS: ReadonlySet<string> = new Set([
  'label',
  'descr',
  'techn',
  'type',
  'sprite',
  'tags',
  'link',
  'bgColor',
  'fontColor',
  'borderColor',
  'shadowing',
  'shape',
  'legendText',
  'legendSprite',
]);
/** The text fields a named argument sets on a relation (`offsetX`/`offsetY` are numbers). */
export const RELATION_FIELDS: ReadonlySet<string> = new Set([
  'label',
  'descr',
  'techn',
  'sprite',
  'tags',
  'link',
  'textColor',
  'lineColor',
]);
export const OFFSETS: ReadonlySet<string> = new Set(['offsetX', 'offsetY']);

/** The names that set an item's structure rather than a field, by item type (as v12). */
export const STRUCTURAL: Readonly<
  Record<'element' | 'boundary' | 'relation', ReadonlySet<string>>
> = {
  element: new Set(['alias', 'parentBoundary', 'typeC4Shape', 'wrap']),
  boundary: new Set(['alias', 'parentBoundary', 'nodeType', 'wrap']),
  relation: new Set(['type', 'from', 'to', 'wrap']),
};

const slot = (name: string, role: SlotRole = 'text'): Slot => ({ name, role });
const blank = (name: string): Slot => ({ name, role: 'text', blank: true });
const ALIAS = slot('alias', 'alias');
const LABEL = slot('label');
const FROM = slot('from', 'reference');
const TO = slot('to', 'reference');
const TAIL = [slot('sprite'), slot('tags'), slot('link')];
/** No names set after the arguments: `Update…Style` set theirs last (`old[key] = value`). */
export const NO_NAMES: ReadonlySet<string> = new Set();
/** `addPersonOrSystem`/`addContainer`/`addComponent` set these after the arguments. */
const ELEMENT_LAST: ReadonlySet<string> = new Set(['typeC4Shape', 'parentBoundary', 'wrap']);
const BOUNDARY_LAST: ReadonlySet<string> = new Set(['parentBoundary', 'wrap']);
const NODE_LAST: ReadonlySet<string> = new Set(['parentBoundary', 'wrap', 'nodeType']);
const RELATION_LAST: ReadonlySet<string> = new Set(['wrap']);

const table = (
  names: NamesOf,
  slots: readonly Slot[],
  required: number,
  setAfter = NO_NAMES
): SlotTable => ({ slots, required, setAfter, names });

/** `Person(alias, label, descr?, sprite?, tags?, link?)` and the systems. */
export const ELEMENT = table('element', [ALIAS, LABEL, blank('descr'), ...TAIL], 2, ELEMENT_LAST);
/** Containers and components: `techn?` before `descr?`. */
export const TECHN_ELEMENT = table(
  'element',
  [ALIAS, LABEL, blank('techn'), blank('descr'), ...TAIL],
  2,
  ELEMENT_LAST
);
/** `Boundary(alias, label, type?, tags?, link?)`. */
export const BOUNDARY = table(
  'boundary',
  [ALIAS, LABEL, slot('type'), slot('tags'), slot('link')],
  2,
  BOUNDARY_LAST
);
/**
 * `Enterprise_Boundary`, `System_Boundary` and `Container_Boundary` as written: their type is
 * spliced in as the third argument (v12's `splice(2, 0, …)`), so they are read as
 * {@link BOUNDARY}.
 */
export const TYPED_BOUNDARY = table(
  'boundary',
  BOUNDARY.slots.filter((s) => s.name !== 'type'),
  2,
  BOUNDARY_LAST
);
/** Deployment nodes: `type?, descr?, sprite?` (dropped, as v12), `tags?, link?`. */
export const NODE = table(
  'boundary',
  [
    ALIAS,
    LABEL,
    slot('type'),
    blank('descr'),
    { ...slot('sprite'), dropped: true },
    ...TAIL.slice(1),
  ],
  2,
  NODE_LAST
);
/** `Rel(from, to, label, techn?, descr?, sprite?, tags?, link?)`. */
export const REL = table(
  'relation',
  [FROM, TO, LABEL, blank('techn'), blank('descr'), ...TAIL],
  3,
  RELATION_LAST
);
/** `RelIndex(index, …)`: the index first, dropped (v12's `splice(0, 1)`), then {@link REL}. */
export const REL_INDEX = table('relation', [slot('index'), ...REL.slots], 4, RELATION_LAST);
/** `UpdateElementStyle(elementName, bgColor?, …)`: on the element, else the boundary. */
export const ELEMENT_STYLE = table(
  'styled',
  [
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
  ],
  1
);
/** `UpdateRelStyle(from, to, textColor?, lineColor?, offsetX?, offsetY?)`. */
export const REL_STYLE = table(
  'relation',
  [FROM, TO, slot('textColor'), slot('lineColor'), slot('offsetX'), slot('offsetY')],
  2
);
/** `UpdateLayoutConfig(c4ShapeInRow?, c4BoundaryInRow?)`: by position, a name changes nothing. */
export const LAYOUT = table('none', [slot('c4ShapeInRow'), slot('c4BoundaryInRow')], 0);

/** Each macro keyword kind's table, as written. */
export const SLOT_TABLES: ReadonlyMap<number, SlotTable> = new Map<number, SlotTable>([
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
  [T.RelIndex, REL_INDEX],
  [T.UpdateElementStyle, ELEMENT_STYLE],
  [T.UpdateRelStyle, REL_STYLE],
  [T.UpdateLayoutConfig, LAYOUT],
]);
