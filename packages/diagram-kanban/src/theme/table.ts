import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { perSlot } from './columns.ts';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

const lighter = perSlot((n) => `lightenHsl(cScale${n}, 10%)`);

/**
 * Kanban's theme table (`DiagramPlugin.theme`, D331, D374, D741;
 * `v13/docs/agents/runs/414/CONTRACT.md`): `kanbanColumn<n>` is v12's `adjuster(cScale<n>, 10)`
 * (`styles.ts`): khroma's `lighten` by 10, or its `darken` under the `dark` trait (a dark theme or
 * `themeVariables.darkMode`, never a theme name). The classic family's dark theme (`dark`)
 * lightens, as v12 did, where v12 never set `darkMode` (D741): its family entry applies over the
 * table's dark rules, even with an author's `darkMode`. `neo-dark`, `redux-dark` and
 * `redux-dark-color` darken (D374). An author's `cScale<n>` recolours its columns.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: lighter,
    dark: perSlot((n) => `darkenHsl(cScale${n}, 10%)`),
  },
  families: { classic: { dark: { rules: lighter } } },
};
