/**
 * The types that draw their outlines through `w.outline` (D302): each type's own
 * `src/<type>/outline.ts` exports its case as `outline`, found here in folder-name order, so a
 * type that adopts the hook adds its file and edits no shared list. `outline-identity.spec.ts`
 * checks every case's corpus is byte-identical while no drawer draws; `outline-roles.spec.ts`
 * checks the roles of each case that names them.
 */
import type { OutlineRole } from '@mermaid-js/core/svg';
import type { DiagramPlugin } from 'mermaid';
import { exportsOnly, importTypeFiles } from './type-files.ts';

export interface OutlineCase {
  /** The type's plugin, as `createMermaid` registers it. */
  readonly plugin: DiagramPlugin<unknown, unknown>;
  /** The type's fixture folders under `e2e/diagrams`. */
  readonly dirs: readonly string[];
  /**
   * The roles the type passes `w.outline`, when it has adopted the hook with roles; a type with
   * none (sequence) is in the identity check only.
   */
  readonly roles?: readonly OutlineRole[];
  /** Shapes the type keeps plain besides the shared ones (arrowheads, label backgrounds). */
  readonly plain?: readonly RegExp[];
}

/** Every outlining type's case, by its folder name. */
export const OUTLINE_CASES: ReadonlyMap<string, OutlineCase> = new Map(
  (
    await importTypeFiles('outline.ts', (module, where) => {
      exportsOnly(module, where, ['outline']);
      return module.outline as OutlineCase;
    })
  ).map(({ dir, module }) => [dir, module])
);
