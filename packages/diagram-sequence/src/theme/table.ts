/**
 * Sequence's theme table (`DiagramPlugin.theme`, D331, spec #414 T2): keyed by family, never by
 * theme name, so a new theme that declares a family draws sequence diagrams with no entry here.
 */
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * v12 `look: neo` (#194): the participant box corner (`svgDraw.js`); the glyph band of
 * `actorBands.ts` (`GLYPH_BAND_HEIGHT`), which also turns on its band model; the 3 px a message
 * stops short of its target (`sequenceRenderer.ts` `buildMessageModel`); the 15 px taller
 * fragment label tab (`svgDraw.js` `drawLoop`); the 30 px added below a diagram with
 * participants (`sequenceRenderer.ts` viewBox).
 */
const NEO = {
  actorRadius: 6,
  actorGlyphBand: 44,
  messageEndGap: 3,
  labelBoxExtraHeight: 15,
  actorFooterPadding: 30,
};

/** v12 classic: corner 3, no glyph band (per-shape symbols), and none of the neo extras. */
const CLASSIC = {
  actorRadius: 3,
  actorGlyphBand: 0,
  messageEndGap: 0,
  labelBoxExtraHeight: 0,
  actorFooterPadding: 0,
};

export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  // As v12 `theme-base.js` derives them, in every theme.
  rules: {
    light: {
      actorBkg: 'mainBkg',
      actorLineColor: 'actorBorder',
      labelBoxBkgColor: 'actorBkg',
      labelTextColor: 'actorTextColor',
      loopTextColor: 'actorTextColor',
    },
  },
  families: {
    classic: { tokens: CLASSIC },
    redux: { tokens: NEO },
    neo: { fallback: 'redux' },
  },
};
