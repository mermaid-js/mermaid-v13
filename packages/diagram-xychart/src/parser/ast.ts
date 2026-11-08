/**
 * XY chart AST (R-PARSE-8, DESIGN §4.2). Every statement is a node with a semantic id and a range
 * into the original source. Ids name the statement; a repeated one gets `@2`, `@3`, … in source
 * order (pitfall 9), and the model keeps the last, as v12's DB did:
 *
 * | statement                         | id                              |
 * | --------------------------------- | ------------------------------- |
 * | `xychart [vertical\|horizontal]`  | `header`, `header@2`, …         |
 * | `title …`                         | `title`, `title@2`, …           |
 * | `x-axis …` / `y-axis …`           | `x-axis`, `x-axis@2`; `y-axis`… |
 * | the n-th `bar` or `line` (from 1) | `plot:<n>`                      |
 * | `accTitle: …`                     | `accTitle`, `accTitle@2`, …     |
 * | `accDescr: …` / `accDescr { … }`  | `accDescr`, `accDescr@2`, …     |
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { XyChartPlotKind } from '../model.ts';

/** A text as the grammar read it: words joined without blanks, or a string's contents. */
export interface XyChartTextNode {
  /** Untrimmed, as jison built it (v12's DB trims it). */
  text: string;
  /** A quoted string (its range includes the quotes). */
  quoted: boolean;
  range: Range;
}

/** `xychart` or `xychart-beta`, with the orientation after it. */
export interface XyChartHeaderNode extends AstNode<'Header'> {
  /** `vertical` or `horizontal` as written (any case), when given. */
  orientation?: string;
}

/** `title …` (`Title`), `accTitle: …` (`AccTitle`), `accDescr: …` or `accDescr { … }`. */
export interface XyChartTextStatement<K extends 'Title' | 'AccTitle' | 'AccDescr'>
  extends AstNode<K> {
  /** The value, trimmed. */
  text: string;
  /** `accDescr {` with no closing `}`: v12 read its text, then an empty description. */
  unclosed?: boolean;
}

export type XyChartTextStatementNode =
  | XyChartTextStatement<'Title'>
  | XyChartTextStatement<'AccTitle'>
  | XyChartTextStatement<'AccDescr'>;

/** `<min> --> <max>`, the numbers as written. */
export interface XyChartRangeNode {
  min: string;
  max: string;
  range: Range;
}

/** `x-axis …` or `y-axis …`. */
export interface XyChartAxisNode extends AstNode<'Axis'> {
  axis: 'x' | 'y';
  title?: XyChartTextNode;
  /** `[a, b, …]` (x axis only). */
  categories?: XyChartTextNode[];
  bandRange?: Range;
  data?: XyChartRangeNode;
}

/** One value of a plot, `5` or `5 "label"`. */
export interface XyChartPointNode {
  /** As written (`+2`, `.5`). */
  value: string;
  /** A point label's text, untrimmed. */
  label?: string;
  range: Range;
}

/** `bar …` or `line …`. */
export interface XyChartPlotNode extends AstNode<'Plot'> {
  kind: XyChartPlotKind;
  name?: XyChartTextNode;
  points: XyChartPointNode[];
}

export type XyChartStatementNode =
  | XyChartHeaderNode
  | XyChartTextStatementNode
  | XyChartAxisNode
  | XyChartPlotNode;

export interface XyChartDocument extends AstNode<'Document'> {
  children: XyChartStatementNode[];
}
