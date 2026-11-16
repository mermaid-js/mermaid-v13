/**
 * C4Model: the plain-data result of a C4 parse (spec #522 §Parser, T2), and the input of the C4
 * layout. It keeps v12's model (`c4Db.ts`), so model parity holds against it, apart from what
 * D452 and D453 change:
 *
 * - elements, boundaries and relations each in the order of their first statement (R-ARCH-7);
 *   aliases and relation ends are compared as written, after `trim()`;
 * - a repeated alias merges into the first element (or boundary) with it: the kind, the label and
 *   the parent are the last statement's, `descr` and `techn` are kept when it leaves them out,
 *   and every argument it gives replaces the field's value. A repeated `from`, `to` pair merges
 *   the same way into the first relation. Elements and boundaries are separate namespaces;
 * - each argument fills the field of its slot, a `$name="value"` one the field it names (v12's
 *   rule), names v12 has no use for kept in `extra`. A name for the structure is v12's too:
 *   `$alias` renames the element or boundary, a relation's `$type`, `$from` and `$to` set its kind
 *   and ends, `UpdateElementStyle`'s `$parentBoundary`, `$typeC4Shape` and `$nodeType` move it or
 *   change its kind; where that would leave the model broken (no such boundary, no such kind, a
 *   boundary's statements left outside it) the structure is kept, with one `C4_STRUCTURE_KEPT`
 *   warning. A name v12 set again after the arguments (`$parentBoundary` in a macro) does
 *   nothing, as there. A named argument where an alias, a relation
 *   end or a label belongs sets the field it names and leaves the slot empty (D452,
 *   `C4_NAMED_ARGUMENT_MOVED`). An argument a statement leaves out leaves its field as it was:
 *   absent, or empty for `descr` and `techn` (v12's defaults);
 * - text as v12's grammar handed it to its DB, trimmed, line breaks kept and entities as written
 *   (`#35;` reads `&#35;`): core's label layout decodes them;
 * - the title is the last `title` statement's text, trimmed (D453), else the front-matter title
 *   (D218); `accTitle:` sets the accessible title only (D453; v12 set the visible one);
 * - `direction` (#730, amending D452) is the last `direction` statement at the top level, and on
 *   a boundary the last in its braces (across every statement that opens it); a line is a row
 *   in TB and BT, a column in LR and RL, and a boundary without one takes its parent's;
 * - `shapeInRow` and `boundaryInRow` are the last valid `UpdateLayoutConfig` values (an integer
 *   prefix of at least 1, by position), undefined when none: the layout's config defaults apply.
 *
 * AST ids (D458): `element:<alias>`, `boundary:<alias>`, `rel:<from>-><to>` with `@2`, `@3` for
 * the later statements of a merged one, and `style:<n>` for the n-th `Update…` statement. Each
 * model item carries its first statement's id.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** The five headers. */
export type C4Type = 'C4Context' | 'C4Container' | 'C4Component' | 'C4Dynamic' | 'C4Deployment';

/** A fill order (#730): a line of members is a row in TB and BT, a column in LR and RL. */
export type C4Direction = 'TB' | 'BT' | 'LR' | 'RL';

/**
 * The ten base element kinds, each with an `external_` twin (v12 `C4_ELEMENT_TYPES`): the one
 * list the element kinds come from.
 */
export const C4_BASE_KINDS = [
  'person',
  'system',
  'system_db',
  'system_queue',
  'container',
  'container_db',
  'container_queue',
  'component',
  'component_db',
  'component_queue',
] as const;

/** A base element kind: one of {@link C4_BASE_KINDS}. */
export type C4BaseKind = (typeof C4_BASE_KINDS)[number];

/** An element's kind: v12's `typeC4Shape`, a base kind or its `external_` twin. */
export type C4ElementKind = C4BaseKind | `external_${C4BaseKind}`;

/** The twenty element kinds, each base kind then its external twin. */
export const C4_ELEMENT_KINDS: readonly C4ElementKind[] = C4_BASE_KINDS.flatMap((kind) => [
  kind,
  `external_${kind}` as const,
]);

/** A deployment node's kinds: `Deployment_Node`/`Node`, `Node_L` or `Node_R`. */
export const C4_NODE_KINDS = ['node', 'nodeL', 'nodeR'] as const;
export type C4NodeKind = (typeof C4_NODE_KINDS)[number];

/** A relation's kinds (`RelIndex` is `rel`; `Rel_Up` and `Rel_U` are `rel_u`, …). */
export const C4_RELATION_KINDS = [
  'rel',
  'birel',
  'rel_u',
  'rel_d',
  'rel_l',
  'rel_r',
  'rel_b',
] as const;
export type C4RelationKind = (typeof C4_RELATION_KINDS)[number];

const EXTERNAL = 'external_';

/** Whether an element kind is an external one (v12's `c4-external` class). */
export const isExternal = (kind: C4ElementKind): boolean => kind.startsWith(EXTERNAL);

/** An element kind without its `external_`. */
export const baseKind = (kind: C4ElementKind): C4BaseKind =>
  (isExternal(kind) ? kind.slice(EXTERNAL.length) : kind) as C4BaseKind;

/** What an element kind is: a person, a system, a container or a component. */
export type C4Family = 'person' | 'system' | 'container' | 'component';

/** An element kind's family, and its store when it is a database or a queue. */
export function kindParts(kind: C4ElementKind): { family: C4Family; store?: 'db' | 'queue' } {
  const [family, store] = baseKind(kind).split('_') as [C4Family, 'db' | 'queue' | undefined];
  return store ? { family, store } : { family };
}

/** An element kind in words, as hover shows it (`external system db`). */
export const kindWords = (kind: C4ElementKind): string => kind.split('_').join(' ');

/** A `$name="value"` whose name sets no field of the model: the last value given. */
export interface C4Extra {
  readonly name: string;
  readonly value: string;
}

/** The fields an element or a boundary has, each set by its slot or by name. */
export interface C4ElementFields {
  readonly label: string;
  readonly descr?: string;
  readonly techn?: string;
  /** A boundary's `[type]` line; on an element only when named. */
  readonly type?: string;
  readonly sprite?: string;
  readonly tags?: string;
  readonly link?: string;
  // `UpdateElementStyle`'s slots.
  readonly bgColor?: string;
  readonly fontColor?: string;
  readonly borderColor?: string;
  readonly shadowing?: string;
  readonly shape?: string;
  readonly legendText?: string;
  readonly legendSprite?: string;
  /** In the order their names were first given. */
  readonly extra: readonly C4Extra[];
}

export interface C4Element extends C4ElementFields {
  readonly ast: AstId;
  readonly alias: string;
  readonly kind: C4ElementKind;
  /** Index into `C4Model.boundaries` of the boundary it is in; -1 at the top level. */
  readonly parent: number;
}

export interface C4Boundary extends C4ElementFields {
  readonly ast: AstId;
  readonly alias: string;
  /** Set on a deployment node. */
  readonly nodeKind?: C4NodeKind;
  /**
   * Index into `C4Model.boundaries` of the boundary it is in; -1 at the top level. Reopening an
   * alias inside itself (or inside a boundary in it) can make the parents a cycle, as in v12.
   */
  readonly parent: number;
  /** The last `direction` in its braces; absent when it has none (it inherits its parent's). */
  readonly direction?: C4Direction;
}

export interface C4Relation {
  readonly ast: AstId;
  /**
   * A {@link C4RelationKind}, or any text a `$type="…"` argument set (v12 took it; an unknown
   * kind draws as `rel`).
   */
  readonly kind: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly techn?: string;
  readonly descr?: string;
  readonly sprite?: string;
  readonly tags?: string;
  readonly link?: string;
  // `UpdateRelStyle`'s slots.
  readonly textColor?: string;
  readonly lineColor?: string;
  /** An integer; 0 for a value that is not a number (D457, `C4_OFFSET_INVALID`). */
  readonly offsetX?: number;
  readonly offsetY?: number;
  /** In the order their names were first given. */
  readonly extra: readonly C4Extra[];
}

export interface C4Model {
  /** The header; undefined only when the parse found none. */
  readonly c4Type?: C4Type;
  readonly elements: readonly C4Element[];
  readonly boundaries: readonly C4Boundary[];
  readonly relations: readonly C4Relation[];
  /** `UpdateLayoutConfig`'s first value, when it gave a valid one. */
  readonly shapeInRow?: number;
  /** `UpdateLayoutConfig`'s second value, when it gave a valid one. */
  readonly boundaryInRow?: number;
  /** The last top-level `direction`; absent when there is none (TB). */
  readonly direction?: C4Direction;
  /** The last in-text `title`, trimmed, else the front-matter title. */
  readonly title?: string;
  /** The last `accTitle:` (`''` when none). */
  readonly accTitle: string;
  /** The last `accDescr`/`accDescription` (`''` when none). */
  readonly accDescr: string;
  readonly warnings: readonly Diagnostic[];
}

/**
 * The alias of boundary `index` of `model` (an item's `parent`), or `global` at the top level, as
 * v12 named the parent of a top-level item.
 */
export function parentAlias(model: Pick<C4Model, 'boundaries'>, index: number): string {
  return index < 0 ? 'global' : (model.boundaries[index]?.alias ?? 'global');
}
