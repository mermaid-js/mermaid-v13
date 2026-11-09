import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: journey reads them all. */
const JOURNEY: readonly string[] = ['journey'];

/**
 * The user journey's theme variables (#290, v12 names; spec #414 T1, D331), moved out of core
 * with their aliases: the section and task fills by slot (D241), the face, and the author's actor
 * dot colours, which no theme sets (D249: the renderer then uses `actorColours`).
 * `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  fillType0: { alias: 'jf0', kind: 'color', usedBy: JOURNEY },
  fillType1: { alias: 'jf1', kind: 'color', usedBy: JOURNEY },
  fillType2: { alias: 'jf2', kind: 'color', usedBy: JOURNEY },
  fillType3: { alias: 'jf3', kind: 'color', usedBy: JOURNEY },
  fillType4: { alias: 'jf4', kind: 'color', usedBy: JOURNEY },
  fillType5: { alias: 'jf5', kind: 'color', usedBy: JOURNEY },
  fillType6: { alias: 'jf6', kind: 'color', usedBy: JOURNEY },
  fillType7: { alias: 'jf7', kind: 'color', usedBy: JOURNEY },
  faceColor: { alias: 'jfc', kind: 'color', usedBy: JOURNEY },
  actor0: { alias: 'ja0', kind: 'color', usedBy: JOURNEY },
  actor1: { alias: 'ja1', kind: 'color', usedBy: JOURNEY },
  actor2: { alias: 'ja2', kind: 'color', usedBy: JOURNEY },
  actor3: { alias: 'ja3', kind: 'color', usedBy: JOURNEY },
  actor4: { alias: 'ja4', kind: 'color', usedBy: JOURNEY },
  actor5: { alias: 'ja5', kind: 'color', usedBy: JOURNEY },
};

/**
 * Rows no theme sets, only an author: `actor0`–`actor5` (D249), which win over
 * `journey.actorColours` when set. Unset, they resolve to `currentColor` in every theme.
 */
export const AUTHOR_ONLY: readonly string[] = Array.from({ length: 6 }, (_, i) => `actor${i}`);
