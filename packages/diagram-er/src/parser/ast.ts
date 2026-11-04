/**
 * ER AST (R-PARSE-8, DESIGN §4.2). Every node has a semantic id built from the user's names,
 * or `<kind>:<n>` for statements without a name, and a range into the original source:
 *
 * | element                              | id                   |
 * | ------------------------------------ | -------------------- |
 * | entity `A` (first mention)           | `n:A`                |
 * | its later mentions                   | `n:A@2`, `n:A@3`, …  |
 * | attribute `x` of `A`                 | `a:A.x`, then `#2`   |
 * | relationship `A ||--o{ B`            | `e:A>B`, then `#2`   |
 * | subgraph `G`                         | `s:G`, then `@2`     |
 * | `style`, `classDef`, `class`, …      | `style:1`, …         |
 *
 * In attribute ids `.` is percent-encoded too (`%2E`), so `a:A.b.c` cannot be read two ways.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** `type name PK, FK "comment"` inside `{ … }`. */
export interface ErAttributeNode extends AstNode<'Attribute'> {
  name: string;
  nameRange: Range;
}

/** One mention of an entity: `A`, `A[alias]`, `A:::cls`, `A { … }`, or an end of a relationship. */
export interface ErEntityNode extends AstNode<'Entity'> {
  name: string;
  nameRange: Range;
  alias?: string;
  aliasRange?: Range;
  /** `:::a,b` class names, as written. */
  classNames?: string[];
  /** `{ … }`, braces included. */
  blockRange?: Range;
  children?: ErAttributeNode[];
}

/** `A ||--o{ B : label`; its children are the two entity mentions. */
export interface ErRelationshipNode extends AstNode<'Relationship'> {
  from: string;
  to: string;
  /** The cardinalities and line, e.g. `||--o{`. */
  relRange: Range;
  label: string;
  labelRange: Range;
  children: [ErEntityNode, ErEntityNode];
}

export interface ErSubgraphNode extends AstNode<'Subgraph'> {
  name: string;
  nameRange: Range;
  title?: string;
  children: ErStatementNode[];
}

export type ErSimpleKind = 'Style' | 'ClassDef' | 'Class' | 'Direction' | 'AccTitle' | 'AccDescr';

/** A statement without children; `refs` are the entity, subgraph and class names it names. */
export interface ErSimpleNode extends AstNode<ErSimpleKind> {
  refs: string[];
}

/** The `erDiagram` keyword. */
export type ErHeaderNode = AstNode<'Header'>;

export type ErStatementNode =
  | ErHeaderNode
  | ErEntityNode
  | ErRelationshipNode
  | ErSubgraphNode
  | ErSimpleNode;

export interface ErDocument extends AstNode<'Document'> {
  children: ErStatementNode[];
}
