/**
 * Flowchart's theme table (`DiagramPlugin.theme`, D331, spec #414 T4): keyed by family, never by
 * theme name, so a new theme that declares a family draws flowcharts with no entry here.
 */
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * v12 neo (`*-margin` markers in 12.2.0 `markers.js` and `lineWithOffset.ts`), sizes in px, a
 * gap the space between the node outline and the nearest point of the arrowhead. Circle:
 * viewBox 10 into 14, refX 12.25, so the gap is 2.25×1.4. Cross: viewBox 15 into 12 (scale
 * 0.8), arms from 1 to 14 so 13×0.8 = 10.4 drawn, stroke 2.5×0.8, refX 17.7 past the arm end
 * at 14, so the gap is 3.7×0.8.
 *
 * Padding: v12 neo, with v13's earlier redux circle values. Subroutine, cylinder, lean /
 * trapezoid and asymmetric shapes have their own v12 padding (`subroutine.ts`, `cylinder.ts`,
 * `leanRight.ts`, `trapezoid.ts`, `rectLeftInvArrow.ts` at fa796a943), as totals; v12 neo
 * asymmetric is 21 / 12 per side.
 */
const NEO = {
  circleArrowheadSize: 14,
  circleArrowheadGap: 3.15,
  crossArrowheadSize: 10.4,
  crossArrowheadGap: 2.96,
  crossArrowheadStrokeWidth: 2,
  stadiumPaddingX: 40,
  stadiumPaddingY: 24,
  doubleCircleGap: 12,
  doubleCirclePadding: 16,
  circleMinDiameter: 44,
  subroutinePaddingX: 28,
  subroutinePaddingY: 12,
  cylinderPaddingX: 24,
  cylinderPaddingY: 24,
  leanPaddingX: '2 * padding',
  leanPaddingY: 'padding',
  oddPaddingX: 42,
  oddPaddingY: 24,
};

/**
 * v12 classic. Circle: viewBox 10 into 11, refX 11, gap 1×1.1. Cross: viewBox 11 into 11, arms
 * from 1 to 10 so 9 drawn, refX 12 past the arm end at 10, gap 2. Padding follows the diagram's
 * `padding` config (`flowchart.padding`), with no circle minimum.
 */
const CLASSIC = {
  circleArrowheadSize: 11,
  circleArrowheadGap: 1.1,
  crossArrowheadSize: 9,
  crossArrowheadGap: 2,
  crossArrowheadStrokeWidth: 2,
  stadiumPaddingX: 'padding',
  stadiumPaddingY: 'padding',
  doubleCircleGap: 5,
  doubleCirclePadding: 'padding',
  circleMinDiameter: 0,
  subroutinePaddingX: 'padding',
  subroutinePaddingY: 'padding',
  cylinderPaddingX: 'padding',
  cylinderPaddingY: 'padding',
  leanPaddingX: 'padding',
  leanPaddingY: 'padding',
  oddPaddingX: 'padding',
  oddPaddingY: 'padding',
};

export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: { light: {} },
  // D181: neo draws the redux family's v12 `look: neo` geometry.
  families: {
    classic: { tokens: CLASSIC },
    redux: { tokens: NEO },
    neo: { fallback: 'redux' },
  },
};
