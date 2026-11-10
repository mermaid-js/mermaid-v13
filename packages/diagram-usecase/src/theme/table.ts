/**
 * Usecase's theme table (`DiagramPlugin.theme`, D331, D474; `v13/docs/agents/runs/414/CONTRACT.md`):
 * v12's eight role colours (`styles.ts:51-60`), keyed by nothing but the palettes, never by a
 * theme name. v12 reads them flat, so there is no section (D335).
 *
 * - **Actors, use cases, include and extend lines** (D474): v12's redux-color writes each as a
 *   slot of its palettes (`borderColorArray` 5, 1, 10, 2 and `bkgColorArray` 5, 1;
 *   redux-dark-color the borders and lines only, its `bkgColorArray` is empty), and no other
 *   theme writes any. `slot(p, n, fallback)` reads the slot where the palette is non-empty, else
 *   v12's fallback (`actorBkg`, `actorBorder`, `mainBkg`, `nodeBorder`, `lineColor`), so every
 *   theme matches v12 and an author's palette is followed.
 * - **Boundaries**: v12's fallbacks `clusterBkg` and `clusterBorder`. redux-color's own fill
 *   (`#FAFAFC`) is no slot and no trait separates the theme from redux (D331), so it is a
 *   family-rule approximation, redux's `clusterBkg` (D474, D541; listed in the usecase theme
 *   oracle spec); its border and redux-dark-color's equal `clusterBorder`. Neither theme paints
 *   them: with a palette each boundary takes its own slot (`render/paint.ts`, v12
 *   `styles.ts:110-124`).
 */
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      usecaseActorBkg: 'slot(bkgColorArray, 5, actorBkg)',
      usecaseActorBorder: 'slot(borderColorArray, 5, actorBorder)',
      usecaseBkg: 'slot(bkgColorArray, 1, mainBkg)',
      usecaseBorder: 'slot(borderColorArray, 1, nodeBorder)',
      usecaseBoundaryBkg: 'clusterBkg',
      usecaseBoundaryBorder: 'clusterBorder',
      usecaseIncludeLine: 'slot(borderColorArray, 10, lineColor)',
      usecaseExtendLine: 'slot(borderColorArray, 2, lineColor)',
    },
  },
};
