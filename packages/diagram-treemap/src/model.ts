/**
 * The treemap model (spec #428): what the parser (#484) produces and the layout (#485) reads.
 * Plain, frozen data in source order (R-ARCH-7). Shared contract of the treemap tickets: change
 * it only additively, and say so in the run notes (`v13/docs/agents/runs/428/GAPS.md`).
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { TextModelFields } from '@mermaid-js/shared/parser/rule';

/**
 * One row of the tree: a section (`"name"`) or a leaf (`"name": value`), as v12's
 * `buildHierarchy` placed it. Duplicate names are all kept, as in v12.
 */
export interface TreemapNode {
  readonly type: 'Section' | 'Leaf';
  /** The name between the quotes, as v12 converted it (no escapes; may be empty). */
  readonly name: string;
  /**
   * A leaf's value as v12 converted it: `parseFloat` of the text with commas removed, so `NaN`
   * for `.` (D402: the layout gives a NaN leaf no area and prints no value). Absent on a
   * section, whose value is the sum the layout computes.
   */
  readonly value?: number;
  /** The `:::name` written after the name or value, defined by a `classDef` or not. */
  readonly classSelector?: string;
  /** 0 for a row at the top (v12's DB level); the layout's d3 depth is one more. */
  readonly depth: number;
  /**
   * The rows under a section, in source order; always empty on a leaf (a row indented under a
   * leaf belongs to the leaf's parent, as in v12).
   */
  readonly children: readonly TreemapNode[];
  /** `node:<name path>` (`node:Root/Child`), `@2`, … for a repeated path (D408). */
  readonly astId: AstId;
}

/** A `classDef` name with every style written for it (a repeat appends, as in v12). */
export interface TreemapClass {
  readonly name: string;
  /**
   * The styles of all its `classDef` lines in source order, split as v12's DB split them (on
   * `;` and `,`, `\,` for a comma). Untrimmed; a `classDef` with no styles adds `''`.
   */
  readonly styles: readonly string[];
  /**
   * The styles v12's `isLabelStyle` took as text styles: those that are a bare text property
   * name (`color`, `font-size`, …), which `color: red` is not.
   */
  readonly textStyles: readonly string[];
  /** `classDef:<name>`: the AST id of its first `classDef`. */
  readonly astId: AstId;
}

export interface TreemapModel extends TextModelFields {
  /** The rows at the top, in source order (v12's `getRoot().children`); several are allowed. */
  readonly roots: readonly TreemapNode[];
  /** Classes in the order of their first `classDef`, defined before or after their use. */
  readonly classes: readonly TreemapClass[];
  /** The AST id of the `title` statement the title comes from; absent for a front-matter title. */
  readonly titleAstId?: AstId;
}

/**
 * The styles v12 wrote on a node of class `name` (its `cssCompiledStyles`): the class's
 * styles, or none when no `classDef` defines it.
 */
export function classStyles(model: TreemapModel, name: string | undefined): readonly string[] {
  if (name === undefined) return [];
  return model.classes.find((c) => c.name === name)?.styles ?? [];
}
