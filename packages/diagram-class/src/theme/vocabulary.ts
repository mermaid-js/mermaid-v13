import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * Class's own theme variables (spec #414 T2, D331): v12 names (and v13's marker geometry), so
 * `themeVariables` and the `--mermaid-<name>` CSS variables work as before. `pnpm gen:theme`
 * writes the runtime half to `generated/variables.ts`.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  // v12 `classText`: every text of a class diagram but notes and namespace titles.
  classText: { alias: 'ct', kind: 'color', usedBy: ['class'] },
  // Relationship marker geometry (D152), read as numbers at render time.
  classMarkerStrokeWidth: { alias: 'cmw', kind: 'length', usedBy: ['class'] },
  classFilledMarkerStrokeWidth: { alias: 'cfw', kind: 'length', usedBy: ['class'] },
  extensionMarkerLength: { alias: 'eml', kind: 'length', usedBy: ['class'] },
  extensionMarkerGap: { alias: 'emg', kind: 'length', usedBy: ['class'] },
  compositionMarkerGap: { alias: 'cmg', kind: 'length', usedBy: ['class'] },
  dependencyMarkerGap: { alias: 'dmg', kind: 'length', usedBy: ['class'] },
  // A relationship's multiplicities (v12 `.edgeTerminals { font-size: 11px }`).
  classTerminalFontSize: { alias: 'ctf', kind: 'length', usedBy: ['class'] },
};
