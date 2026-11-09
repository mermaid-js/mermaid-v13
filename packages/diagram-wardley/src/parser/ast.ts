/**
 * Wardley AST (R-PARSE-8, DESIGN §4.2 adapted, D427). Every node has a semantic id and a range
 * into the original source, from its first token to its last (the line break after it is not
 * part of it):
 *
 * | element                                        | id                                       |
 * | ---------------------------------------------- | ---------------------------------------- |
 * | `wardley-beta`                                 | `wardley`                                |
 * | `anchor A […]`, `component A […]`              | `node:A`, a repeat `node:A@2`, …         |
 * | `component c […]` inside `pipeline P { … }`    | `node:P_c` (v12's id), a repeat `@2`     |
 * | `A -> B` (any arrow, port or none)             | `link:A->B`, a repeat `link:A->B@2`      |
 * | `evolve A 0.8`                                 | `evolve:A` (`@2` …)                      |
 * | `pipeline P { … }`                             | `pipeline:P` (`@2` …)                    |
 * | the k-th `note "…" […]` (from 1)               | `note:k`                                 |
 * | `annotation 3, […] "…"`                        | `annotation:3` (`@2` for a repeat)       |
 * | `annotations […]`                              | `annotations` (`@2` …)                   |
 * | `accelerator A […]`, `deaccelerator A […]`     | `accelerator:A`, `deaccelerator:A` (`@2`)|
 * | `size […]`, `evolution …`                      | `size`, `evolution` (`@2` …)             |
 * | `title …`, `accTitle: …`, `accDescr …`         | `title`, `accTitle`, `accDescr` (`@2` …) |
 *
 * Names are the converted values (a quoted name without its quotes). `%`, `>`, `@` and `#` in
 * them are percent-encoded (`%25`, `%3E`, `%40`, `%23`), as core's ids do, so the `->` of a link
 * id and the `@n` of a repeat are never part of a name. Node ids count anchors, components and
 * pipeline children together, by the node id v12 gives them: the model's node keeps the id of
 * its first statement (pitfall 9).
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { WardleyStrategy } from '../model.ts';

/** A name (`STRING`, `ID` or `NAME_WITH_SPACES`): the converted value and the token's range. */
export interface WardleyName {
  /** Unquoted and unescaped for a string; as written otherwise. */
  value: string;
  /** The name token, quotes included (the symbol's range, D191). */
  range: Range;
}

/** A coordinate or other number: its value and the token's range. */
export interface WardleyNumber {
  value: number;
  range: Range;
}

/** `wardley-beta`. */
export type WardleyHeaderNode = AstNode<'Header'>;

/** `size [width, height]`. */
export interface WardleySizeNode extends AstNode<'Size'> {
  width: WardleyNumber;
  height: WardleyNumber;
}

/** One stage of `evolution`: `Name`, `Name@0.3`, `Name / Second`. */
export interface WardleyStage {
  name: WardleyName;
  boundary?: WardleyNumber;
  secondName?: WardleyName;
}

/** `evolution A -> B -> …`. */
export interface WardleyEvolutionNode extends AstNode<'Evolution'> {
  stages: WardleyStage[];
}

/** `label [x, y]`, the signs applied. */
export interface WardleyLabelOffset {
  x: number;
  y: number;
  range: Range;
}

/** `anchor Name [visibility, evolution]`. */
export interface WardleyAnchorNode extends AstNode<'Anchor'> {
  name: WardleyName;
  visibility: WardleyNumber;
  evolution: WardleyNumber;
}

/** `component Name [visibility, evolution] label […] (strategy) inertia`. */
export interface WardleyComponentNode extends AstNode<'Component'> {
  name: WardleyName;
  visibility: WardleyNumber;
  evolution: WardleyNumber;
  label?: WardleyLabelOffset;
  strategy?: WardleyStrategy;
  inertia: boolean;
}

/** `component Name [evolution] label […]` inside a pipeline. */
export interface WardleyPipelineComponentNode extends AstNode<'PipelineComponent'> {
  name: WardleyName;
  evolution: WardleyNumber;
  label?: WardleyLabelOffset;
}

/** `pipeline Parent { … }`. */
export interface WardleyPipelineNode extends AstNode<'Pipeline'> {
  parent: WardleyName;
  children: WardleyPipelineComponentNode[];
}

/** `A -> B`, with its ports, arrow and label as written. */
export interface WardleyLinkNode extends AstNode<'Link'> {
  from: WardleyName;
  to: WardleyName;
  /** `+<>`, `+>` or `+<` after the source. */
  fromPort?: string;
  /** The arrow's text: `->`, `-->`, `-.->`, `>` or `+'…'` with `<>`, `<` or `>`. */
  arrow?: string;
  toPort?: string;
  /** The `; label` text, trimmed (v12's value converter). */
  linkLabel?: string;
}

/** `evolve Name target`. */
export interface WardleyEvolveNode extends AstNode<'Evolve'> {
  name: WardleyName;
  target: WardleyNumber;
}

/** `note "text" [visibility, evolution]`. */
export interface WardleyNoteNode extends AstNode<'Note'> {
  text: string;
  visibility: WardleyNumber;
  evolution: WardleyNumber;
}

/** `annotations [visibility, evolution]`. */
export interface WardleyAnnotationsNode extends AstNode<'Annotations'> {
  visibility: WardleyNumber;
  evolution: WardleyNumber;
}

/** `annotation n, [visibility, evolution] "text"`. */
export interface WardleyAnnotationNode extends AstNode<'Annotation'> {
  number: WardleyNumber;
  visibility: WardleyNumber;
  evolution: WardleyNumber;
  text: string;
}

/** `accelerator Name [visibility, evolution]` or `deaccelerator …`. */
export interface WardleyAcceleratorNode extends AstNode<'Accelerator' | 'Deaccelerator'> {
  name: WardleyName;
  visibility: WardleyNumber;
  evolution: WardleyNumber;
}

/** `title …`, `accTitle: …` and `accDescr …`; `text` is the converted value. */
export interface WardleyTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export type WardleyStatementNode =
  | WardleyHeaderNode
  | WardleySizeNode
  | WardleyEvolutionNode
  | WardleyAnchorNode
  | WardleyComponentNode
  | WardleyLinkNode
  | WardleyEvolveNode
  | WardleyPipelineNode
  | WardleyNoteNode
  | WardleyAnnotationsNode
  | WardleyAnnotationNode
  | WardleyAcceleratorNode
  | WardleyTextNode;

export interface WardleyDocument extends AstNode<'Document'> {
  children: WardleyStatementNode[];
}
