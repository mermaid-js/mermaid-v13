import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * Requirement's theme table (`DiagramPlugin.theme`, D331, spec #520 T4). The rules are what
 * mermaid\@12.2.0 draws (D435): the box fill `mainBkg`, its outline `nodeBorder`, its text and
 * the relation label ink `nodeTextColor` where the theme writes one, else `textColor` (v12
 * `.label text, span`: `nodeTextColor || textColor`; equal to v12 in all eleven themes),
 * the lines and markers `lineColor`, the label tag `edgeLabelBackground` where the theme has
 * no `linkLabelBkg` (v12 `.labelBkg`).
 *
 * The families replace v12's `look: neo` branches (D152, D153). Classic is v12 classic: 1.3px
 * box strokes (`userNodeOverrides`), 1px lines (`.relationshipLine`) and a 20 × 20 chevron and
 * r 9 circle with 1px strokes (`markers.js`, scaled by the 1px line). Redux and neo are v12 neo:
 * box, lines and marker strokes at `strokeWidth` (one token, `relationStrokeWidth`, for the
 * lines and the marker strokes) (`[data-look="neo"].node path`,
 * `.relationshipLine`, the `_neo` markers in user space) and the chevron at 0.8 (its
 * `viewBox 0 0 25 20` in a 20 × 20 marker). The label tag's fill is the theme background in
 * every family (D628): v12's redux `requirementEdgeLabelBackground` literals (GAPS #587) are
 * gone, and an author's `relationLabelBackground` still wins.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      requirementBackground: 'mainBkg',
      requirementBorderColor: 'nodeBorder',
      requirementBorderSize: 'strokeWidth',
      requirementTextColor: 'inline(nodeTextColor, textColor)',
      relationLabelBackground: 'inline(linkLabelBkg, edgeLabelBackground)',
      relationColor: 'lineColor',
      relationLabelColor: 'inline(nodeTextColor, textColor)',
      relationStrokeWidth: 'strokeWidth',
      relationArrowScale: '1',
    },
  },
  families: {
    classic: {
      tokens: {
        requirementBorderSize: 1.3,
        relationStrokeWidth: 1,
        relationArrowScale: 1,
      },
    },
    redux: {
      tokens: { relationArrowScale: 0.8 },
    },
    neo: { fallback: 'redux' },
  },
};
