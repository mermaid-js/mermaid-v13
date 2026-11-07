import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { perSlot } from './columns.ts';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * Kanban's theme table (`DiagramPlugin.theme`, D331, D374; `v13/docs/agents/runs/414/CONTRACT.md`):
 * `kanbanColumn<n>` is v12's `adjuster(cScale<n>, 10)` (`styles.ts`): khroma's `lighten` by 10,
 * or its `darken` under a dark theme or `themeVariables.darkMode` (the `dark` trait, never a
 * theme name). An author's `cScale<n>` recolours its columns.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: perSlot((n) => `lightenHsl(cScale${n}, 10%)`),
    dark: perSlot((n) => `darkenHsl(cScale${n}, 10%)`),
  },
};
