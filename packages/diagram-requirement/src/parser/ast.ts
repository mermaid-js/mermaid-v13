/**
 * Requirement AST (R-PARSE-8, DESIGN §4.2, D437). The document's children are its statements in
 * source order:
 *
 * | element                                   | id                       |
 * | ----------------------------------------- | ------------------------ |
 * | `requirement a { … }` (any of the 6 kinds) | `requirement:a`, `@2`, … |
 * | `element e { … }`                         | `element:e`, `@2`, …     |
 * | `a - traces -> b`, `b <- traces - a`      | `relation:a->b`, `@2`, … |
 * | `classDef c …`                            | `classDef:c`, `@2`, …    |
 * | `style …`, `class …` and `a:::c`          | `style:1`, `class:1`, …  |
 * | `requirementDiagram`, `direction`, `acc…` | `header:1`, `direction:1`, … |
 *
 * A `classDef` with several names takes its id from the first. `%`, `>`, `@` and `#` in names
 * are percent-encoded (`./ids.ts`). A repeated definition gets its own id; the model keeps the
 * first (D434).
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** A name or value as written: an unquoted string (trimmed) or a quoted one. */
export interface RequirementText {
  /** As v12 read it: trimmed when unquoted, without the quotes when quoted. */
  text: string;
  quoted: boolean;
  /** The trimmed text, or the quoted text with its quotes. */
  range: Range;
}

/** One `key: value` line of a body, as written (a repeated key included). */
export interface RequirementFieldNode {
  /** `id`, `text`, `risk`, `verifyMethod`, `type` or `docRef`. */
  key: 'id' | 'text' | 'risk' | 'verifyMethod' | 'type' | 'docRef';
  keyRange: Range;
  /** The value as v12 read it (a risk or method in its display form, `High`). */
  value: string;
  valueRange: Range;
}

interface BoxNode {
  name: RequirementText;
  /** `:::a,b` class names, as written. */
  classNames?: RequirementText[];
  /** `{ … }`, braces included (to the end of what was read when it is not closed). */
  bodyRange?: Range;
  fields: RequirementFieldNode[];
}

/** `requirement a { … }` and the other five kinds; `keyword` is the kind as written. */
export interface RequirementDefNode extends AstNode<'Requirement'>, BoxNode {
  keyword: string;
}

/** `element e { … }`. */
export type ElementDefNode = AstNode<'Element'> & BoxNode;

/** `a - traces -> b` or `b <- traces - a`. */
export interface RelationNode extends AstNode<'Relation'> {
  /** The relationship as v12 stores it: `contains`, `traces`, … */
  kind: string;
  src: RequirementText;
  dst: RequirementText;
}

export type RequirementSimpleKind =
  | 'Header'
  | 'Style'
  | 'ClassDef'
  | 'Class'
  | 'Direction'
  | 'AccTitle'
  | 'AccDescr';

/**
 * A statement with no box of its own. `targets` are the box names it styles or classes (`style`,
 * `class`, `a:::c`); `classNames` the class names it defines or applies.
 */
export interface RequirementSimpleNode extends AstNode<RequirementSimpleKind> {
  targets?: RequirementText[];
  classNames?: RequirementText[];
}

export type RequirementStatementNode =
  | RequirementDefNode
  | ElementDefNode
  | RelationNode
  | RequirementSimpleNode;

export interface RequirementDocument extends AstNode<'Document'> {
  children: RequirementStatementNode[];
}
