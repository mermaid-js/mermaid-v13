/**
 * Class-diagram AST (R-PARSE-8, DESIGN §4.2). Every node has a semantic id built from the
 * user's names, and a range into the original source:
 *
 * | element                                   | id                        |
 * | ----------------------------------------- | ------------------------- |
 * | a mention of class `A` (k-th: `@k`)       | `n:A`, `n:A@2`            |
 * | the k-th attribute or method of class `A` | `m:A#1`, `m:A#2`          |
 * | relationship `A -- B` (k-th: `#k`)        | `e:A>B`, `e:A>B#2`        |
 * | namespace `A.B` (reopened: `@k`)          | `s:A.B`, `s:A.B@2`        |
 * | the k-th note                             | `note:1`                  |
 * | the k-th other statement                  | `st:1` (the header), …    |
 *
 * Class names are the names without their generic type (`A` for `A~T~`); namespace names are
 * qualified (`outer.inner`). `%`, `>`, `@` and `#` in names are percent-encoded.
 */
import type { AstCallback, AstNode, Range } from '@mermaid-js/core/parser-kit';

/** Text as written (`["label"]`, a quoted string), and its range, quotes included. */
export interface ClassTextNode {
  text: string;
  range: Range;
}

/**
 * One mention of a class name: in `class A`, a relationship end, `A : member`, `note for A`,
 * `<<annotation>> A`, or a bare `A` line.
 */
export interface ClassRefNode extends AstNode<'ClassRef'> {
  /** The name as written, generic type included (`A~T~`). */
  name: string;
  /** The class id (`A`). */
  classId: string;
}

/** One attribute or method: a class-body line, or the text of `A : member`. */
export interface ClassMemberNode extends AstNode<'Member'> {
  /** The line as written, trimmed. */
  text: string;
}

/** `class A`, with its label, CSS class, annotation and body. Its id is its name's mention. */
export interface ClassStmt extends AstNode<'Class'> {
  name: string;
  classId: string;
  nameRange: Range;
  label?: ClassTextNode;
  /** `class A:::name`. */
  cssClass?: string;
  /** `class A <<name>>`. */
  annotation?: string;
  /** The `{ … }` body, braces included. */
  bodyRange?: Range;
  /** Attributes and methods of the body, in order. */
  children: ClassMemberNode[];
}

/** `A "1" *-- "many" B : label`. */
export interface ClassRelationStmt extends AstNode<'Relation'> {
  /** The two end mentions. */
  children: [ClassRefNode, ClassRefNode];
  /** The arrow (`<|--`, `..>`, …). */
  arrowRange: Range;
  startLabel?: ClassTextNode;
  endLabel?: ClassTextNode;
  label?: ClassTextNode;
}

/** `A : member`: the class mention, then the member (none for an annotation or empty text). */
export interface ClassMemberStmt extends AstNode<'MemberStatement'> {
  children: [ClassRefNode] | [ClassRefNode, ClassMemberNode];
}

/** `namespace A { … }`, with the classes, notes and namespaces inside. */
export interface ClassNamespaceStmt extends AstNode<'Namespace'> {
  /** Qualified id. */
  name: string;
  label?: ClassTextNode;
  children: (ClassStmt | ClassNoteStmt | ClassNamespaceStmt)[];
}

/** `note "text"`, `note for A "text"`. */
export interface ClassNoteStmt extends AstNode<'Note'> {
  text: ClassTextNode;
  /** The model's note id (`note0`, …). */
  noteId: string;
  children: [] | [ClassRefNode];
}

/** `<<interface>> A`. */
export interface ClassAnnotationStmt extends AstNode<'Annotation'> {
  annotation: string;
  children: [ClassRefNode];
}

export type ClassSimpleKind =
  | 'Header'
  | 'Style'
  | 'ClassDef'
  | 'CssClass'
  | 'Click'
  | 'Direction'
  | 'AccTitle'
  | 'AccDescr';

/** A statement without children: the header, `style`, `classDef`, `cssClass`, clicks, … */
export interface ClassSimpleStmt extends AstNode<ClassSimpleKind> {
  /** Names the statement refers to (classes, CSS classes), as written. */
  refs: string[];
  /** `callback` and `click … call`: what the interactions plugin binds (DESIGN §12.3). */
  callback?: AstCallback;
  /** `link` and `click … href` (Click only): the URL as written, and its target. */
  url?: string;
  target?: string;
  /** A click's tooltip (Click only). */
  tooltip?: string;
}

export type ClassStatementNode =
  | ClassStmt
  | ClassRelationStmt
  | ClassMemberStmt
  | ClassRefNode
  | ClassNamespaceStmt
  | ClassNoteStmt
  | ClassAnnotationStmt
  | ClassSimpleStmt;

export interface ClassDocument extends AstNode<'Document'> {
  children: ClassStatementNode[];
}
