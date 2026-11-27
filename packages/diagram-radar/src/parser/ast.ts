/**
 * Radar AST (R-PARSE-8, DESIGN §4.2 adapted). Every node has a semantic id and a range into the
 * original source (ranges start at the first character after the blanks before them):
 *
 * | element                                | id                                      |
 * | -------------------------------------- | --------------------------------------- |
 * | `radar-beta` (`:`)                     | `radar`                                 |
 * | `axis A["Label"]` (one per name)       | `axis:A`, a repeat `axis:A@2`, …        |
 * | `curve c{…}`                           | `curve:c`, a repeat `curve:c@2`, …      |
 * | a detailed entry `A: 1` in `curve:c`   | `curve:c>A` (a repeat `curve:c>A@2`)    |
 * | the k-th positional entry (from 0)     | `curve:c#k`                             |
 * | an option `ticks 5`                    | `opt:ticks`, a repeat `opt:ticks@2`, …  |
 * | `title …`, `accTitle: …`, `accDescr …` | `title`, `accTitle`, `accDescr` (`@2`…) |
 *
 * Entries take the id of their curve as prefix, so the entries of `curve:c@2` are
 * `curve:c@2>A` and `curve:c@2#0`. Names are ASCII `[\w-]` (D357), so nothing needs
 * percent-encoding. The model's axes and curves keep the id of their own node (pitfall 9).
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** `radar-beta`, `radar-beta:` or `radar-beta :`. */
export type RadarHeaderNode = AstNode<'Header'>;

/** `A` or `A["Label"]`, from the name to the `]`. */
export interface RadarAxisNode extends AstNode<'Axis'> {
  name: string;
  nameRange: Range;
  /** The `["…"]` label after conversion; absent when there is none. */
  label?: string;
  /** Set when the label is a markdown string (see `RadarAxis.markdown`). */
  markdown?: true;
}

/** One value of a curve: `1` (positional) or `A: 1` / `A 1` (detailed). */
export interface RadarEntryNode extends AstNode<'Entry'> {
  /** The axis name of a detailed entry, as written. */
  axis?: string;
  axisRange?: Range;
  value: number;
  valueRange: Range;
}

/** `c["Label"]{…}`, from the name to the `}`. */
export interface RadarCurveNode extends AstNode<'Curve'> {
  name: string;
  nameRange: Range;
  label?: string;
  /** As for `RadarAxisNode.markdown`. */
  markdown?: true;
  children: RadarEntryNode[];
}

/** `showLegend true`, `ticks 5`, `max 10`, `min 0` or `graticule polygon`. */
export interface RadarOptionNode extends AstNode<'Option'> {
  name: 'showLegend' | 'ticks' | 'max' | 'min' | 'graticule';
  value: boolean | number | string;
  valueRange: Range;
}

/** `title …`, `accTitle: …` and `accDescr …`; `text` is the converted value. */
export interface RadarTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export type RadarStatementNode =
  | RadarHeaderNode
  | RadarAxisNode
  | RadarCurveNode
  | RadarOptionNode
  | RadarTextNode;

export interface RadarDocument extends AstNode<'Document'> {
  children: RadarStatementNode[];
}
