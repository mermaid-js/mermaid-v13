/**
 * RequirementModel: the plain-data result of a requirement parse (spec #520 T2), and the input of
 * the layout. It holds what v12's `RequirementDB` (`requirementDb.ts`) holds after a parse, in
 * its order (R-ARCH-7), so model parity holds against it:
 *
 * - `requirements`, then `elements`, each in the order of its first definition (a later
 *   definition of a name is left out, D434); each with its fields as v12 stored them (`''` for
 *   one the body does not set; the first of a repeated field wins), its classes (`default`
 *   first, as v12) and its styles in order, its AST id and its palette slot (v12's
 *   `colorIndex`: requirements first, then elements);
 * - display values canonical whatever the input case (`HIGH` reads `High`, `TEST` reads
 *   `Test`), as v12's tables;
 * - `relations` in source order, ends as written, unknown names included (D434), each with the
 *   box it resolves to: the requirement of that name, else the element (v12's `getData`);
 * - `classes` (`classDef`) in first-definition order, the direction (default `TB`), the
 *   accessible title and description, and the front-matter title (D218).
 *
 * AST ids (D437): `requirement:<name>`, `element:<name>`, `relation:<src>-><dst>` with `@2`,
 * `@3` for later ones (`parser/ids.ts`).
 */
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/parser-kit';

/** The six requirement kinds, as v12 displays them. */
export type RequirementKind =
  | 'Requirement'
  | 'Functional Requirement'
  | 'Interface Requirement'
  | 'Performance Requirement'
  | 'Physical Requirement'
  | 'Design Constraint';

export type RiskLevel = 'Low' | 'Medium' | 'High';

export type VerifyMethod = 'Analysis' | 'Demonstration' | 'Inspection' | 'Test';

export type RelationshipKind =
  | 'contains'
  | 'copies'
  | 'derives'
  | 'satisfies'
  | 'verifies'
  | 'refines'
  | 'traces';

export type RequirementDirection = 'TB' | 'BT' | 'LR' | 'RL';

/** What requirements and elements share: one box each. */
export interface RequirementBox {
  /** `requirement:<name>` or `element:<name>`: the first definition's AST id. */
  readonly ast: AstId;
  readonly name: string;
  /** The first definition, from its keyword to its `}` (or as far as it was read). */
  readonly range: Range;
  /** The name as written, quotes included. */
  readonly nameRange: Range;
  /** Classes in order, `default` first (v12's `classes`). */
  readonly classes: string[];
  /** Styles in order: `style` statements and the styles of each class as it was applied. */
  readonly styles: string[];
  /** Palette slot (v12's `colorIndex`): requirements count from 0, then elements. */
  readonly slot: number;
}

export interface Requirement extends RequirementBox {
  readonly kind: RequirementKind;
  /** The `id:` field (v12's `requirementId`); `''` when the body has none. */
  readonly requirementId: string;
  readonly text: string;
  readonly risk: RiskLevel | '';
  readonly verifyMethod: VerifyMethod | '';
}

export interface Element extends RequirementBox {
  /** The `type:` field; `''` when the body has none. */
  readonly type: string;
  /** The `docref:` field; `''` when the body has none. */
  readonly docRef: string;
}

export interface Relation {
  /** `relation:<src>-><dst>`, `@k` for the k-th relation between the same two names. */
  readonly ast: AstId;
  readonly kind: RelationshipKind;
  /** The source's name as written (`a - traces -> b` and `b <- traces - a` both have `a`). */
  readonly src: string;
  readonly dst: string;
  /**
   * The AST ids of the boxes the ends name (the requirement of that name, else the element),
   * or undefined for a name no box has (D434: such a relation stays out of the layout).
   */
  readonly from: AstId | undefined;
  readonly to: AstId | undefined;
  readonly range: Range;
}

/**
 * A box and which of the two it is. The tag is `is`, not `kind`: a requirement's own `kind` is
 * its requirement kind (`Functional Requirement`, …).
 */
export type BoxOf<R = Requirement, E = Element> =
  | { readonly is: 'requirement'; readonly box: R }
  | { readonly is: 'element'; readonly box: E };

/** Which of the two a box is. */
export type BoxKind = BoxOf['is'];

/** Boxes by name, one map per kind (`parser/boxes.ts`). */
export interface BoxesByName<R = Requirement, E = Element> {
  readonly requirements: ReadonlyMap<string, R>;
  readonly elements: ReadonlyMap<string, E>;
}

/** A `classDef`. */
export interface RequirementClass {
  readonly name: string;
  readonly styles: string[];
  /** Styles that mention `color`, with `fill` read as `bgFill` (v12's label styles). */
  readonly textStyles: string[];
}

/**
 * A warning of the parse. The D433 and D434 warnings list their statements' AST ids in
 * `astIds`: core's render `Warning` keeps that field (and drops `related`), as sankey's.
 */
export interface RequirementWarning extends Diagnostic {
  readonly astIds?: readonly AstId[];
}

/**
 * The style copies past the cap (D433, R-SEC-5): the parse stopped copying at `max`, where
 * the statement at `range` wanted `found`. The layout ends the render with a `LimitError`
 * (`checkStyleCopies`).
 */
export interface StyleCopies {
  readonly max: number;
  readonly found: number;
  readonly range: Range;
}

export interface RequirementModel {
  readonly requirements: readonly Requirement[];
  readonly elements: readonly Element[];
  readonly relations: readonly Relation[];
  readonly classes: readonly RequirementClass[];
  readonly direction: RequirementDirection;
  /** `accTitle`, `''` for none. */
  readonly accTitle: string;
  /** `accDescr`, `''` for none. */
  readonly accDescr: string;
  /** The front-matter `title` (D218). */
  readonly title?: string;
  /** Set when `style`, `class` and `classDef` would copy past the cap (D433). */
  readonly styleCopies?: StyleCopies;
  /** Warning diagnostics of the parse (the same objects as in `ParseResult.diagnostics`). */
  readonly warnings: readonly RequirementWarning[];
}
