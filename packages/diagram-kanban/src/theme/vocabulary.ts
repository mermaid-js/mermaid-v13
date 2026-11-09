import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: kanban reads them all. */
const KANBAN: readonly string[] = ['kanban'];

/**
 * Kanban's theme variables (D331, D374): one column colour per `cScale` slot, `kanbanColumn<n>`
 * (column k, from 1, takes slot `(k + 1) mod 12`; `columns.ts`). The rules are on the table
 * (`table.ts`). `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  kanbanColumn0: { alias: 'kbc0', kind: 'color', usedBy: KANBAN },
  kanbanColumn1: { alias: 'kbc1', kind: 'color', usedBy: KANBAN },
  kanbanColumn2: { alias: 'kbc2', kind: 'color', usedBy: KANBAN },
  kanbanColumn3: { alias: 'kbc3', kind: 'color', usedBy: KANBAN },
  kanbanColumn4: { alias: 'kbc4', kind: 'color', usedBy: KANBAN },
  kanbanColumn5: { alias: 'kbc5', kind: 'color', usedBy: KANBAN },
  kanbanColumn6: { alias: 'kbc6', kind: 'color', usedBy: KANBAN },
  kanbanColumn7: { alias: 'kbc7', kind: 'color', usedBy: KANBAN },
  kanbanColumn8: { alias: 'kbc8', kind: 'color', usedBy: KANBAN },
  kanbanColumn9: { alias: 'kbc9', kind: 'color', usedBy: KANBAN },
  kanbanColumn10: { alias: 'kbc10', kind: 'color', usedBy: KANBAN },
  kanbanColumn11: { alias: 'kbc11', kind: 'color', usedBy: KANBAN },
};

/**
 * Names the sources build at run time, which the theme usedBy scan for literals can't see:
 * `paints` in render/paint.ts reads the column colours `columnVar(n)`, `kanbanColumn${n}`.
 */
export const DYNAMIC_READS: readonly string[] = Array.from(
  { length: 12 },
  (_, n) => `kanbanColumn${n}`
);
