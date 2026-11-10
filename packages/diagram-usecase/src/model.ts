/**
 * The usecase model (DESIGN §4.2, R-ARCH-7): plain, serialisable data in source order, as v12's
 * usecase DB held it after a parse (`usecaseDb.ts`, built by `usecaseModelBuilder.ts`), minus
 * v12's rendering fields. Actors, use cases, boundaries and JSON tables come in the order of
 * their first mention by offset (relation ends included), relations and notes in statement
 * order. Each element carries the AST id of its first mention (D475), which the renderer writes
 * as `data-ast`.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** How a label is drawn: as written, or as Markdown (a text in a quote and a backtick). */
export type UsecaseLabelType = 'text' | 'markdown';

export type UsecaseActorType = 'normal' | 'hollow' | 'awesome' | 'icon';

export type UsecaseShape = 'ellipse' | 'rect';

export type UsecaseBoundaryType = 'rect' | 'package';

export type UsecaseRelationshipType = 'association' | 'include' | 'extend' | 'generalization';

/**
 * The markers of an association (v12's `ARROW_TYPE`): `point` (`-->`), `reversedPoint` (`<--`),
 * `line` (`--`), `circle` (`--o`), `cross` (`--x`), `reversedCircle` (`o--`), `reversedCross`
 * (`x--`). Include, extend and generalization relations are `point`.
 */
export type UsecaseArrowType =
  | 'point'
  | 'reversedPoint'
  | 'line'
  | 'circle'
  | 'cross'
  | 'reversedCircle'
  | 'reversedCross';

export type UsecaseAnimation = 'fast' | 'slow';

/** `TD` is stored as `TB`, as v12 did. */
export type UsecaseDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface UsecaseActor {
  astId: AstId;
  id: string;
  label: string;
  labelType: UsecaseLabelType;
  /** `icon` when the actor has an `icon`, else its `type` (default `normal`). */
  type: UsecaseActorType;
  icon?: string;
  business: boolean;
  stereotype?: string;
  /** The system boundary it was declared in. */
  parentId?: string;
  /** `:::` and `class` names, in order, each once. */
  classes: string[];
  /** `style` declarations, in order. */
  styles: string[];
}

export interface UsecaseUseCase {
  astId: AstId;
  id: string;
  label: string;
  labelType: UsecaseLabelType;
  /** `rect` for `Id[label]`, else `ellipse`. */
  shape: UsecaseShape;
  business: boolean;
  stereotype?: string;
  parentId?: string;
  classes: string[];
  styles: string[];
}

export interface UsecaseBoundary {
  astId: AstId;
  id: string;
  /** The title. */
  label: string;
  labelType: UsecaseLabelType;
  type: UsecaseBoundaryType;
  /** The actors and use cases declared inside it, in source order. */
  members: string[];
  classes: string[];
  styles: string[];
}

export interface UsecaseRelationship {
  astId: AstId;
  /** The explicit id (`A e1@--> B`), else `edge-<n>` in statement order. */
  id: string;
  explicitId: boolean;
  source: string;
  target: string;
  type: UsecaseRelationshipType;
  arrowType: UsecaseArrowType;
  /** `include` / `extend` for those relations; an association's label as written. */
  label?: string;
  labelType?: UsecaseLabelType;
  /** Ranks the edge spans: dashes − 1 for point and plain arrows (at least 1), else 1. */
  minlen: number;
  classes: string[];
  styles: string[];
  animate: boolean;
  animation?: UsecaseAnimation;
}

export interface UsecaseNote {
  astId: AstId;
  /** `note-<n>`, in statement order. */
  id: string;
  /** The actor or use case it is attached to. */
  target: string;
  label: string;
  labelType: UsecaseLabelType;
}

/** One row of a JSON table (v12's `flattenJsonRows`). */
export interface UsecaseJsonRow {
  /** The key cell: a dotted path; empty on the rows after the first of a scalar array. */
  key: string;
  /** The key, also on those rows (for assistive technology). */
  accessibleKey: string;
  value: string;
}

export interface UsecaseJsonTable {
  astId: AstId;
  id: string;
  /** The parsed object (`JSON.parse`: a repeated key keeps its last value). */
  value: Record<string, unknown>;
  /** Object key order by JSON Pointer, as written (a repeated key keeps its first place). */
  propertyOrder: Record<string, string[]>;
  /** The table rows, depth first in {@link propertyOrder}. */
  rows: UsecaseJsonRow[];
  classes: string[];
  styles: string[];
}

export interface UsecaseClassDef {
  id: string;
  /** As written, in order (`\,` read as `,`). */
  styles: string[];
}

export interface UsecaseModel {
  actors: UsecaseActor[];
  useCases: UsecaseUseCase[];
  boundaries: UsecaseBoundary[];
  relationships: UsecaseRelationship[];
  notes: UsecaseNote[];
  jsonTables: UsecaseJsonTable[];
  /** In first-definition order; a later `classDef` of a name replaces its styles. */
  classDefs: UsecaseClassDef[];
  /** The last `direction`, `LR` by default. */
  direction: UsecaseDirection;
  /** The last `accTitle` / `accDescr`, trimmed; `''` for none. */
  accTitle: string;
  accDescr: string;
  /** The front-matter `title`, drawn above the diagram (D472). */
  title?: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  warnings: Diagnostic[];
}
