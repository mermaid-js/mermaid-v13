import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * c4-beta's element colours in light themes (spec #730 T2, D592): the prototype's literals, in
 * the order person, software system, container, component, infrastructure node, external. A kind's
 * `Color` is its text and its `Border` its outline (v12's #7868 named the first `...Bkg`). The
 * container, component and external `Color` are the prototype's hue darkened until the text reads
 * at 4.5:1 on the `base` theme's `#f4f4f4`, the least white of the light themes (`#438dd5`, `#85bbf0` and `#999999` read at 3.5, 2.0 and 2.9).
 */
const ELEMENT_LIGHT = {
  c4PersonColor: '#08427b',
  c4PersonBorder: '#073b6f',
  c4SoftwareSystemColor: '#1168bd',
  c4SoftwareSystemBorder: '#3c7fc0',
  c4ContainerColor: '#296eb8',
  c4ContainerBorder: '#3c7fc0',
  c4ComponentColor: '#216ec8',
  c4ComponentBorder: '#78a8d8',
  c4InfrastructureNodeColor: '#6b6b6b',
  c4InfrastructureNodeBorder: '#5a5a5a',
  c4ExternalColor: '#6c6c6c',
  c4ExternalBorder: '#8a8a8a',
} as const;

/**
 * The same hues under the dark trait (D333(b)): the prototype's lightened values, raised until
 * a `Color` reads at 4.5:1 and a `Border` at 3:1 on the dark themes' `#333333` page (a person's
 * `#0b5cab` is 1.9:1 there).
 */
const ELEMENT_DARK = {
  c4PersonColor: '#449ff4',
  c4PersonBorder: '#0a7fe5',
  c4SoftwareSystemColor: '#51a0ec',
  c4SoftwareSystemBorder: '#5a93cb',
  c4ContainerColor: '#60a0dc',
  c4ContainerBorder: '#4e8cc8',
  c4ComponentColor: '#6eaeed',
  c4ComponentBorder: '#649bd2',
  c4InfrastructureNodeColor: '#9e9e9e',
  c4InfrastructureNodeBorder: '#8d8d8d',
  c4ExternalColor: '#bfbfbf',
  c4ExternalBorder: '#b0b0b0',
} as const;

/**
 * C4's theme table (`DiagramPlugin.theme`, D331, D456; `v13/docs/agents/runs/414/CONTRACT.md`).
 * v12 C4 is "fixed style": its relations and boundaries are `#444444` literals
 * (`svgDraw.ts:30-31, 141-142, 167-205`), its title takes the page's `textColor` (the root
 * `fill` of v12's style sheet), and its element palette is config. The light rules are those
 * values, so light themes draw what v12 drew; under a dark theme or `darkMode` (the `dark`
 * trait, never a theme name) relations take `lineColor` and boundaries `nodeBorder`, which v12
 * left dark on dark (D333(b)). The title's `textColor` is already the page's ink in both.
 * Every family takes the same rules: v12 C4 has no theme-name branch, gradient or shadow (D227).
 * The element rows are c4-beta's alone; legacy C4 keeps its config palette (D456).
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      c4RelationColor: '#444444',
      c4BoundaryColor: '#444444',
      c4TitleColor: 'textColor',
      ...ELEMENT_LIGHT,
    },
    dark: {
      c4RelationColor: 'lineColor',
      c4BoundaryColor: 'nodeBorder',
      c4TitleColor: 'textColor',
      ...ELEMENT_DARK,
    },
  },
};
