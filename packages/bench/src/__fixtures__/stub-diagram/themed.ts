import { esc } from '@mermaid-js/core/svg';
import type { DiagramThemeTable } from '@mermaid-js/core/theme';

/**
 * A stub diagram with its own theme table (D331, spec #414): twelve variables of several kinds,
 * light and dark rules and family entries, as a port's table holds.
 */
const theme: DiagramThemeTable = {
  section: 'stub',
  vars: {
    stubFill: { alias: 'zf', kind: 'color', nested: 'fill' },
    stubStroke: { alias: 'zs', kind: 'color', nested: 'stroke' },
    stubText: { alias: 'zt', kind: 'color', nested: 'text' },
    stubTitle: { alias: 'zti', kind: 'color' },
    stubAxis: { alias: 'za', kind: 'color' },
    stubGrid: { alias: 'zg', kind: 'color' },
    stubPoint: { alias: 'zp', kind: 'color' },
    stubLegend: { alias: 'zl', kind: 'color' },
    stubGap: { alias: 'zgp', kind: 'length' },
    stubPad: { alias: 'zpd', kind: 'padding' },
    stubOpacity: { alias: 'zo', kind: 'opacity' },
    stubOn: { alias: 'zon', kind: 'flag' },
  },
  rules: {
    light: {
      stubFill: 'mainBkg',
      stubStroke: 'nodeBorder',
      stubText: 'textColor',
      stubTitle: 'primaryTextColor',
      stubAxis: 'lineColor',
      stubGrid: 'mix(lineColor, background, 70%)',
      stubPoint: 'seriesColorArray2',
      stubLegend: 'contrast(background, textColor, primaryTextColor)',
    },
    dark: { stubGrid: 'mix(lineColor, background, 50%)' },
  },
  families: {
    classic: { tokens: { stubGap: 4, stubPad: 'padding', stubOpacity: 0.7, stubOn: false } },
    redux: {
      rules: { stubStroke: 'primaryBorderColor' },
      tokens: { stubGap: 8, stubPad: 12, stubOpacity: 1, stubOn: true },
      dark: { values: { stubTitle: '#eeeeee' } },
    },
    neo: { fallback: 'redux', tokens: { stubGap: 6 } },
  },
};

export const stub = { id: 'stub', escape: esc, theme };
