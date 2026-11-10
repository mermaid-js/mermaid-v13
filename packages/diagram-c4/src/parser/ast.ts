/**
 * C4 AST (R-PARSE-8, DESIGN §4.2, D458): one node per element, boundary, relation and `Update…`
 * statement, in source order, each with a semantic id and a range into the original source.
 * Boundaries hold the statements between their braces.
 *
 * | statement                                  | id                    |
 * | ------------------------------------------ | --------------------- |
 * | `Person(a, …)` (any element macro)         | `element:a`           |
 * | the k-th element statement with alias `a`  | `element:a@k`         |
 * | `Boundary(b, …) {` (any boundary or node)  | `boundary:b`, `@k`    |
 * | `Rel(a, b, …)` (any relation macro)        | `rel:a->b`, `@k`      |
 * | the n-th `Update…` statement               | `style:n`             |
 *
 * `%`, `>`, `@` and `#` in an alias are percent-encoded. A later statement of a merged element,
 * boundary or relation is a reference to the first, whose id the model item carries. A relation
 * v12 dropped (fewer than three arguments) has no node.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** One argument of a macro, as written. */
export interface C4Argument {
  /** The name of a `$name="value"` argument, trimmed. */
  name?: string;
  /** The value, trimmed (`''` for an empty argument). */
  value: string;
  /** From the argument's first character (its quote or `$`) to its last. */
  range: Range;
}

interface C4Macro<T extends string> extends AstNode<T> {
  /** The macro as written, e.g. `Person_Ext`, `Rel_Up`. */
  macro: string;
  args: C4Argument[];
}

export interface C4ElementNode extends C4Macro<'Element'> {
  alias: string;
}

export interface C4BoundaryNode extends C4Macro<'Boundary'> {
  alias: string;
  children: C4StatementNode[];
}

export interface C4RelationNode extends C4Macro<'Relation'> {
  from: string;
  to: string;
}

/** `UpdateElementStyle`, `UpdateRelStyle` or `UpdateLayoutConfig`. */
export type C4StyleNode = C4Macro<'Style'>;

export type C4StatementNode = C4ElementNode | C4BoundaryNode | C4RelationNode | C4StyleNode;

export interface C4Document extends AstNode<'Document'> {
  children: C4StatementNode[];
}
