/**
 * Quadrant chart AST (R-PARSE-8, DESIGN §4.2). Every node has a semantic id and a range into
 * the original source. A statement that a later one overrides draws nothing, so it gets a
 * plain statement id:
 *
 * | element                                                   | id                     |
 * | --------------------------------------------------------- | ---------------------- |
 * | point `A`; later points named `A`                         | `pt:A`; `pt:A@2`, …    |
 * | the last `classDef c` (the one the model keeps)           | `c:c`                  |
 * | the last `quadrant-N`                                     | `q:N`                  |
 * | the last `x-axis` / `y-axis` (it sets the start label)    | `ax:x`, `ax:y`         |
 * | the end label the chart draws (the last one after `-->`)  | `ax:x/end`, `ax:y/end` |
 * | every other statement and end label, in source order      | `st:1`, `st:2`, …      |
 *
 * `st:1` is the header. A point is named by its label, trimmed. `%`, `>`, `@` and `#` in names
 * are percent-encoded.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** A label as the grammar read it: untrimmed (v12's DB trims it), quotes left out. */
export interface QuadrantTextNode {
  text: string;
  /** A markdown string (backticks inside the quotes) starts it. */
  markdown: boolean;
  /** Quotes included. */
  range: Range;
}

/** One style of a point or `classDef` (`radius: 10`), trimmed. */
export interface QuadrantStyleNode {
  text: string;
  range: Range;
}

/** The `quadrantChart` keyword. */
export type QuadrantHeaderNode = AstNode<'Header'>;

/** `title …`, `accTitle: …`, `accDescr: …` or `accDescr { … }`. */
export interface QuadrantTextStatementNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  /** The value, trimmed. */
  text: string;
}

/** `quadrant-N <label>`. */
export interface QuadrantQuadrantNode extends AstNode<'Quadrant'> {
  quadrant: 1 | 2 | 3 | 4;
  label: QuadrantTextNode;
}

/** The end label of an axis, after `-->`. */
export interface QuadrantAxisEndNode extends AstNode<'AxisEnd'> {
  label: QuadrantTextNode;
}

/** `x-axis <start> [--> [<end>]]` or `y-axis …`. */
export interface QuadrantAxisNode extends AstNode<'Axis'> {
  axis: 'x' | 'y';
  /** The start label (left, or bottom). */
  label: QuadrantTextNode;
  /** Whether `-->` follows the start label. */
  arrow: boolean;
  children?: [QuadrantAxisEndNode];
}

/** `<label>[:::class]: [x, y] [styles]`. */
export interface QuadrantPointNode extends AstNode<'Point'> {
  /** The label, trimmed: what the id is built from. */
  name: string;
  label: QuadrantTextNode;
  className?: string;
  classRange?: Range;
  /** The coordinates as written (`0.3`, `1`, `0x5`). */
  x: string;
  y: string;
  styles: QuadrantStyleNode[];
}

/** `classDef <name> <styles>`. */
export interface QuadrantClassDefNode extends AstNode<'ClassDef'> {
  name: string;
  nameRange: Range;
  styles: QuadrantStyleNode[];
}

export type QuadrantStatementNode =
  | QuadrantHeaderNode
  | QuadrantTextStatementNode
  | QuadrantQuadrantNode
  | QuadrantAxisNode
  | QuadrantPointNode
  | QuadrantClassDefNode;

export interface QuadrantDocument extends AstNode<'Document'> {
  children: QuadrantStatementNode[];
}
