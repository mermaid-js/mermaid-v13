import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * The quadrant chart's theme table (`DiagramPlugin.theme`, D331, spec #414 T1), as the
 * quadrant-graph block of every v12 theme file derives the variables. Fills 2–4 follow
 * `quadrant1Fill`, so a theme that pins it moves them too (D232); points default to `textColor`,
 * the colour v12 points showed (D231). The light redux and neo themes derive the fills from
 * v12's literal `#ececfe`, not from `primaryColor` (D232); their dark themes from `primaryColor`.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      quadrant1Fill: 'primaryColor',
      quadrant2Fill: 'adjust(quadrant1Fill, 5, 5, 5)',
      quadrant3Fill: 'adjust(quadrant1Fill, 10, 10, 10)',
      quadrant4Fill: 'adjust(quadrant1Fill, 15, 15, 15)',
      quadrant1TextFill: 'primaryTextColor',
      quadrant2TextFill: 'adjust(primaryTextColor, -5, -5, -5)',
      quadrant3TextFill: 'adjust(primaryTextColor, -10, -10, -10)',
      quadrant4TextFill: 'adjust(primaryTextColor, -15, -15, -15)',
      quadrantPointFill: 'textColor',
      quadrantPointTextFill: 'primaryTextColor',
      quadrantXAxisTextFill: 'primaryTextColor',
      quadrantYAxisTextFill: 'primaryTextColor',
      quadrantInternalBorderStrokeFill: 'primaryBorderColor',
      quadrantExternalBorderStrokeFill: 'primaryBorderColor',
      quadrantTitleFill: 'primaryTextColor',
    },
  },
  families: {
    redux: {
      rules: { quadrant1Fill: '#ececfe' },
      dark: { rules: { quadrant1Fill: 'primaryColor' } },
    },
    neo: { fallback: 'redux' },
  },
};
