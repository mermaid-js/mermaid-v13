import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: c4 reads them all. */
const C4: readonly string[] = ['c4'];

/**
 * C4's theme variables (D331, D456): the colours v12 C4 drew as literals or took from the page,
 * so that dark themes can recolour them. The element palette stays config (`<type>_bg_color`,
 * `<type>_border_color`). The rules are on the table (`table.ts`). `pnpm gen:theme` writes
 * `generated/variables.ts` from them.
 *
 * - `c4RelationColor`: relation lines, their arrowheads and their text (v12 `#444444`);
 * - `c4BoundaryColor`: boundary frames and their header text (v12 `#444444`);
 * - `c4TitleColor`: the diagram's title (v12: the page's `textColor`, which its `<text>` took).
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  c4RelationColor: { alias: 'c4r', kind: 'color', usedBy: C4 },
  c4BoundaryColor: { alias: 'c4b', kind: 'color', usedBy: C4 },
  c4TitleColor: { alias: 'c4t', kind: 'color', usedBy: C4 },
};
