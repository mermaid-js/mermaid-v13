import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: c4 reads them all (c4-beta is the same package). */
const C4: readonly string[] = ['c4'];

/**
 * C4's theme variables (D331, D456): the colours v12 C4 drew as literals or took from the page,
 * so that dark themes can recolour them. Legacy C4's element palette stays config (`<type>_bg_color`,
 * `<type>_border_color`); c4-beta's is the twelve `c4<Kind>Color` and `c4<Kind>Border` rows
 * (spec #730 T2). The rules are on the table (`table.ts`). `pnpm gen:theme` writes
 * `generated/variables.ts` from them.
 *
 * - `c4RelationColor`: relation lines, their arrowheads and their text (v12 `#444444`);
 * - `c4BoundaryColor`: boundary frames and their header text (v12 `#444444`);
 * - `c4TitleColor`: the diagram's title (v12: the page's `textColor`, which its `<text>` took);
 * - `c4<Kind>Color` and `c4<Kind>Border`, for a c4-beta person, softwareSystem, container,
 *   component, infrastructureNode and external element: its text, and its outline.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  c4RelationColor: { alias: 'c4r', kind: 'color', usedBy: C4 },
  c4BoundaryColor: { alias: 'c4b', kind: 'color', usedBy: C4 },
  c4TitleColor: { alias: 'c4t', kind: 'color', usedBy: C4 },
  c4PersonColor: { alias: 'c4pec', kind: 'color', usedBy: C4 },
  c4PersonBorder: { alias: 'c4peb', kind: 'color', usedBy: C4 },
  c4SoftwareSystemColor: { alias: 'c4ssc', kind: 'color', usedBy: C4 },
  c4SoftwareSystemBorder: { alias: 'c4ssb', kind: 'color', usedBy: C4 },
  c4ContainerColor: { alias: 'c4coc', kind: 'color', usedBy: C4 },
  c4ContainerBorder: { alias: 'c4cob', kind: 'color', usedBy: C4 },
  c4ComponentColor: { alias: 'c4cmc', kind: 'color', usedBy: C4 },
  c4ComponentBorder: { alias: 'c4cmb', kind: 'color', usedBy: C4 },
  c4InfrastructureNodeColor: { alias: 'c4inc', kind: 'color', usedBy: C4 },
  c4InfrastructureNodeBorder: { alias: 'c4inb', kind: 'color', usedBy: C4 },
  c4ExternalColor: { alias: 'c4exc', kind: 'color', usedBy: C4 },
  c4ExternalBorder: { alias: 'c4exb', kind: 'color', usedBy: C4 },
};
