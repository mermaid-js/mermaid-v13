import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * Requirement's own theme variables (spec #520 T4, D331, D435): v12's names, so
 * `themeVariables` and the `--mermaid-<name>` CSS variables work as documented, and v13's
 * relation geometry, the family tokens that replace v12's `look: neo` branches (D152, D153).
 * `pnpm gen:theme` writes the runtime half to `generated/variables.ts`.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  // D435: the five documented variables v12 declared but never drew, and the two added.
  requirementBackground: { alias: 'rqb', kind: 'color', usedBy: ['requirement'] },
  requirementBorderColor: { alias: 'rqc', kind: 'color', usedBy: ['requirement'] },
  requirementBorderSize: { alias: 'rqs', kind: 'length', usedBy: ['requirement'] },
  requirementTextColor: { alias: 'rqt', kind: 'color', usedBy: ['requirement'] },
  relationLabelBackground: { alias: 'rqlb', kind: 'color', usedBy: ['requirement'] },
  relationColor: { alias: 'rqrc', kind: 'color', usedBy: ['requirement'] },
  relationLabelColor: { alias: 'rqlc', kind: 'color', usedBy: ['requirement'] },
  // Relation geometry (D152), read as numbers at render time: the line's width, the markers'
  // stroke width and the chevron's scale. The layout's marker room follows the last two.
  relationStrokeWidth: { alias: 'rqw', kind: 'length', usedBy: ['requirement'] },
  relationMarkerStrokeWidth: { alias: 'rqmw', kind: 'length', usedBy: ['requirement'] },
  relationArrowScale: { alias: 'rqas', kind: 'length', usedBy: ['requirement'] },
};
