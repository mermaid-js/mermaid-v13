import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * The four quadrant fills, each `from` with v12's per-channel offset (D232). Fills 2–4 read the
 * same input as fill 1, not `quadrant1Fill`, so an author who sets `quadrant1Fill` alone moves
 * only quadrant 1, as in v12 (D738).
 */
const fills = (from: string): Readonly<Record<string, string>> => ({
  quadrant1Fill: from,
  quadrant2Fill: `adjust(${from}, 5, 5, 5)`,
  quadrant3Fill: `adjust(${from}, 10, 10, 10)`,
  quadrant4Fill: `adjust(${from}, 15, 15, 15)`,
});

/**
 * The quadrant chart's theme table (`DiagramPlugin.theme`, D331, spec #414 T1), as the
 * quadrant-graph block of every v12 theme file derives the variables. Fills 2–4 derive from the
 * input fill 1 derives from, not from `quadrant1Fill`, so setting that alone moves only quadrant 1
 * (D738, amending D232); points default to `textColor`, the colour v12 points showed (D231). The
 * light redux and neo themes derive the fills from v12's literal `#ececfe`, not from
 * `primaryColor` (D232); their dark themes from `primaryColor`. The fill and the inks read the
 * canvas inputs, which a theme pins where v12 keeps them under a `primaryColor` or
 * `primaryTextColor` override and which follow those colours elsewhere (D656).
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      ...fills('canvasItemBkg'),
      quadrant1TextFill: 'canvasTextColor',
      quadrant2TextFill: 'adjust(canvasTextColor, -5, -5, -5)',
      quadrant3TextFill: 'adjust(canvasTextColor, -10, -10, -10)',
      quadrant4TextFill: 'adjust(canvasTextColor, -15, -15, -15)',
      quadrantPointFill: 'textColor',
      quadrantPointTextFill: 'canvasTextColor',
      quadrantXAxisTextFill: 'canvasTextColor',
      quadrantYAxisTextFill: 'canvasTextColor',
      quadrantInternalBorderStrokeFill: 'primaryBorderColor',
      quadrantExternalBorderStrokeFill: 'primaryBorderColor',
      quadrantTitleFill: 'canvasTextColor',
    },
  },
  families: {
    redux: {
      rules: fills('#ececfe'),
      dark: { rules: fills('primaryColor') },
    },
    neo: { fallback: 'redux' },
  },
};
