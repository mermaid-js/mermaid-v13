import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * Requirement's theme table (`DiagramPlugin.theme`, D331, spec #520 T4). The rules are what
 * mermaid\@12.2.0 draws (D435): the box fill `mainBkg`, its outline `nodeBorder`, its text and
 * the relation label ink `nodeTextColor` (v12 `.label text, span`: `nodeTextColor || textColor`),
 * the lines and markers `lineColor`, the label chip `edgeLabelBackground` where the theme has
 * no `linkLabelBkg` (v12 `.labelBkg`).
 *
 * The families replace v12's `look: neo` branches (D152, D153). Classic is v12 classic: 1.3px
 * box strokes (`userNodeOverrides`), 1px lines (`.relationshipLine`) and a 20 × 20 chevron and
 * r 9 circle with 1px strokes (`markers.js`, scaled by the 1px line). Redux and neo are v12 neo:
 * box, lines and marker strokes at `strokeWidth` (`[data-look="neo"].node path`,
 * `.relationshipLine`, the `_neo` markers in user space) and the chevron at 0.8 (its
 * `viewBox 0 0 25 20` in a 20 × 20 marker). The four redux themes set v12's
 * `requirementEdgeLabelBackground`, which `.labelBkg` reads before `edgeLabelBackground`:
 * white, or `#16141f` in the dark ones (GAPS #587); neo has none.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      requirementBackground: 'mainBkg',
      requirementBorderColor: 'nodeBorder',
      requirementBorderSize: 'strokeWidth',
      requirementTextColor: 'nodeTextColor',
      relationLabelBackground: 'inline(linkLabelBkg, edgeLabelBackground)',
      relationColor: 'lineColor',
      relationLabelColor: 'nodeTextColor',
      relationStrokeWidth: 'strokeWidth',
      relationMarkerStrokeWidth: 'strokeWidth',
      relationArrowScale: '1',
    },
  },
  families: {
    classic: {
      tokens: {
        requirementBorderSize: 1.3,
        relationStrokeWidth: 1,
        relationMarkerStrokeWidth: 1,
        relationArrowScale: 1,
      },
    },
    redux: {
      rules: { relationLabelBackground: '#ffffff' },
      tokens: { relationArrowScale: 0.8 },
      dark: { rules: { relationLabelBackground: '#16141f' } },
    },
    neo: {
      fallback: 'redux',
      rules: { relationLabelBackground: 'inline(linkLabelBkg, edgeLabelBackground)' },
      dark: { rules: { relationLabelBackground: 'inline(linkLabelBkg, edgeLabelBackground)' } },
    },
  },
};
