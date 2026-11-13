/**
 * C4BetaModel: the plain-data result of a c4-beta parse (spec #730), and the input of its
 * layout. It is separate from `C4Model`, which is gated against v12's `c4Db`: c4-beta marks an
 * element external by a tag and decides what is a boundary after the parse.
 *
 * - elements in statement order, a parent before its children; text as written inside the
 *   quotes with `\` escapes resolved, `''` where a statement leaves a field out;
 * - an element with children, a `group` and a `deploymentNode` is a boundary;
 * - relations in statement order. `a <-- b` is stored as `b → a`, so ranks follow meaning;
 * - AST ids: `element:<id>`, `rel:<from>-><to>` with `@2`, `@3` for repeats, `style:<n>`.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** What follows `c4-beta`; `context` when it is left out. */
export type C4BetaKind = 'context' | 'container' | 'component' | 'dynamic' | 'deployment';

export type C4BetaElementKind =
  | 'person'
  | 'softwareSystem'
  | 'container'
  | 'component'
  | 'group'
  | 'deploymentNode'
  | 'infrastructureNode';

export type C4BetaDirection = 'TB' | 'BT' | 'LR' | 'RL';

/** Whether a relation's end carries an arrowhead. */
export type C4BetaHead = 'none' | 'arrow';

export interface C4BetaElement {
  readonly id: string;
  readonly kind: C4BetaElementKind;
  readonly name: string;
  readonly description: string;
  /** Empty for a person and a software system, which have none. */
  readonly technology: string;
  /** Only a deployment node's; absent otherwise. */
  readonly instances?: string;
  readonly tags: readonly string[];
  /** The id of the element whose body holds this one. */
  readonly parent?: string;
  readonly boundary: boolean;
  readonly ast: AstId;
}

export interface C4BetaRelation {
  readonly from: string;
  readonly to: string;
  readonly start: C4BetaHead;
  readonly end: C4BetaHead;
  readonly description: string;
  readonly technology: string;
  /** The step of a relation in a `dynamic` diagram. */
  readonly step?: number;
  readonly tags: readonly string[];
  readonly ast: AstId;
}

/** `style <target> key:value, …`: the target is a tag or an element kind. */
export interface C4BetaStyle {
  readonly target: string;
  readonly entries: readonly { readonly key: string; readonly value: string }[];
  readonly ast: AstId;
}

export interface C4BetaModel {
  readonly kind: C4BetaKind;
  readonly direction: C4BetaDirection;
  readonly legend: boolean;
  /** The last `title` statement's text; absent without one. */
  readonly title?: string;
  readonly accTitle: string;
  readonly accDescr: string;
  readonly elements: readonly C4BetaElement[];
  readonly relations: readonly C4BetaRelation[];
  readonly styles: readonly C4BetaStyle[];
  readonly warnings: readonly Diagnostic[];
}
