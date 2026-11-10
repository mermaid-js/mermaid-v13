/**
 * What the usecase parser hands the model builder (`build.ts`), one draft per statement part,
 * and what the builder gives back. Labels and names are as v12's lexer read them (entity
 * placeholders kept); ranges are source ranges.
 */
import type { Range, RelatedInfo } from '@mermaid-js/core/parser-kit';
import type {
  UsecaseActorType,
  UsecaseAnimation,
  UsecaseArrowType,
  UsecaseBoundaryType,
  UsecaseDirection,
  UsecaseLabelType,
  UsecaseRelationshipType,
  UsecaseShape,
} from '../model.ts';
import type { UsecaseElementKind } from './ast.ts';

/** A label as v12's lexer read it (entity placeholders kept; the model shows them). */
export interface LabelDraft {
  raw: string;
  type: UsecaseLabelType;
}

export interface PropertyDraft {
  key: string;
  value: string | boolean;
  /** The key (without quotes). */
  range: Range;
}

export interface MetadataDraft {
  properties: PropertyDraft[];
}

export interface Named {
  id: string;
  label: LabelDraft;
  /** The name: the id, or the text between the quotes of a quoted name. */
  range: Range;
  /** The id was made from a quoted label. */
  generated: boolean;
}

export interface ElementDraft extends Named {
  kind: 'actor' | 'usecase';
  parent?: { id: string; range: Range };
  shape?: UsecaseShape;
  metadata?: MetadataDraft;
  stereotype?: string;
  classes: string[];
}

export interface BoundaryDraft extends Named {
  classes: string[];
}

export interface JsonDraft {
  id: string;
  range: Range;
  value: Record<string, unknown>;
  propertyOrder: Record<string, string[]>;
  classes: string[];
}

export interface EndpointDraft extends Named {
  /** The mention declares the element (a label, metadata or a stereotype). */
  declaration: boolean;
  /** It has `:::` classes. */
  classes: boolean;
}

export interface RelationshipDraft {
  /** The relation's AST id. */
  astId: string;
  source: EndpointDraft;
  target: EndpointDraft;
  /** From the edge id or the arrow to the end of the target. */
  range: Range;
  explicitId?: { id: string; range: Range };
  type: UsecaseRelationshipType;
  arrowType: UsecaseArrowType;
  label?: LabelDraft;
  minlen: number;
}

export interface NoteDraft {
  astId: string;
  target: string;
  targetRange: Range;
  label: LabelDraft;
}

export interface MetadataAssignment {
  target: string;
  targetRange: Range;
  metadata: MetadataDraft;
}

/** The resolved model, before AST ids. Labels are still as v12's lexer read them. */
export interface Built {
  actors: {
    id: string;
    label: LabelDraft;
    type: UsecaseActorType;
    icon?: string;
    business: boolean;
    stereotype?: string;
    parentId?: string;
    classes: string[];
    styles: string[];
  }[];
  useCases: {
    id: string;
    label: LabelDraft;
    shape: UsecaseShape;
    business: boolean;
    stereotype?: string;
    parentId?: string;
    classes: string[];
    styles: string[];
  }[];
  boundaries: {
    id: string;
    label: LabelDraft;
    type: UsecaseBoundaryType;
    members: string[];
    classes: string[];
    styles: string[];
  }[];
  relationships: {
    astId: string;
    id: string;
    explicitId: boolean;
    source: string;
    target: string;
    type: UsecaseRelationshipType;
    arrowType: UsecaseArrowType;
    label?: LabelDraft;
    minlen: number;
    classes: string[];
    styles: string[];
    animate: boolean;
    animation?: UsecaseAnimation;
  }[];
  notes: { astId: string; id: string; target: string; label: LabelDraft }[];
  jsonTables: (JsonDraft & { styles: string[] })[];
  classDefs: { id: string; styles: string[] }[];
  direction: UsecaseDirection;
  accTitle: string;
  accDescr: string;
  /** Every id the diagram defines, with its kind and whether it was made from a label. */
  symbols: ReadonlyMap<string, { kind: UsecaseElementKind; generated: boolean; label?: string }>;
}

export interface BuildReport {
  error(code: string, message: string, range: Range, related?: RelatedInfo[]): void;
}
