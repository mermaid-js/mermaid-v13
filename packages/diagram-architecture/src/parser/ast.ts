/**
 * Architecture AST (R-PARSE-8, DESIGN §4.2 adapted, D508). Every node has a semantic id and a
 * range into the original source, from its first token to its last (the line break after it is
 * not part of it; a `title`'s leading blanks are not either):
 *
 * | element                                  | id                                         |
 * | ---------------------------------------- | ------------------------------------------ |
 * | `architecture-beta`                      | `architecture`                             |
 * | `service a …`                            | `service:a`, a repeat `service:a@2`, …     |
 * | `junction j …`                           | `junction:j` (`@2` …)                      |
 * | `group g …`                              | `group:g` (`@2` …)                         |
 * | `a:R -- L:b` (any arrow, label, group)   | `edge:a->b`, a repeat of the pair `@2`, …  |
 * | the n-th `align …` (from 1)              | `align:n`                                  |
 * | `title …`, `accTitle: …`, `accDescr …`   | `title`, `accTitle`, `accDescr` (`@2` …)   |
 *
 * Ids are ASCII `\w` and `-`, never ending in `-`, so `->` and `@` never occur in one and
 * nothing needs percent-encoding. The model keeps the id of the declaration that registered
 * the element (pitfall 9).
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { ArchitectureSide } from '../model.ts';

/** An id and the token's range (a symbol's range, D508). */
export interface ArchitectureName {
  value: string;
  range: Range;
}

/** A converted value (icon, label, text icon) and its token's range. */
export interface ArchitectureText {
  value: string;
  range: Range;
  /** Set when a label or text icon was written as a quoted markdown string (#1368). */
  markdown?: true;
}

/** `architecture-beta`. */
export type ArchitectureHeaderNode = AstNode<'Header'>;

/** `group id(icon)[Label] in parent`. */
export interface ArchitectureGroupNode extends AstNode<'Group'> {
  name: ArchitectureName;
  icon?: ArchitectureText;
  label?: ArchitectureText;
  parent?: ArchitectureName;
}

/** `service id(icon)[Label] in group` or `service id "text"[Label] in group`. */
export interface ArchitectureServiceNode extends AstNode<'Service'> {
  name: ArchitectureName;
  icon?: ArchitectureText;
  /** A text icon (`"…"`), unquoted and unescaped. */
  iconText?: ArchitectureText;
  label?: ArchitectureText;
  parent?: ArchitectureName;
}

/** `junction id in group`. */
export interface ArchitectureJunctionNode extends AstNode<'Junction'> {
  name: ArchitectureName;
  parent?: ArchitectureName;
}

/** One end of an edge: `id{group}:R` on the left, `L:id{group}` on the right. */
export interface ArchitectureEdgeEnd {
  name: ArchitectureName;
  side: ArchitectureSide;
  sideRange: Range;
  /** An arrowhead (`<` or `>`) at this end. */
  into: boolean;
  /** The `{group}` after the id, when written. */
  group?: Range;
}

/** `a:R --> L:b`, `a:R -[label]- L:b`. */
export interface ArchitectureEdgeNode extends AstNode<'Edge'> {
  lhs: ArchitectureEdgeEnd;
  rhs: ArchitectureEdgeEnd;
  label?: ArchitectureText;
}

/** `align row a b c`. */
export interface ArchitectureAlignmentNode extends AstNode<'Alignment'> {
  direction: 'row' | 'column';
  members: ArchitectureName[];
}

/** `title …`, `accTitle: …` and `accDescr …`; `text` is the converted value. */
export interface ArchitectureTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export type ArchitectureStatementNode =
  | ArchitectureHeaderNode
  | ArchitectureGroupNode
  | ArchitectureServiceNode
  | ArchitectureJunctionNode
  | ArchitectureEdgeNode
  | ArchitectureAlignmentNode
  | ArchitectureTextNode;

export interface ArchitectureDocument extends AstNode<'Document'> {
  children: ArchitectureStatementNode[];
}
