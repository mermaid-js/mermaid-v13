import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * State's own theme variables (spec #414 T3, D331, D337): v12 names, so `themeVariables` and the
 * `--mermaid-<name>` CSS variables work as before. `pnpm gen:theme` writes the runtime half to
 * `generated/variables.ts`.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  // Composite states (#192, D120, D126): the body, the title strip and the alternate (nested)
  // body.
  compositeBackground: { alias: 'cbg', kind: 'color', usedBy: ['state'] },
  compositeTitleBackground: { alias: 'ctb', kind: 'color', usedBy: ['state'] },
  altBackground: { alias: 'alb', kind: 'color', usedBy: ['state'] },
};
