import type { DiagramThemeTable } from '../../../../../../../../packages/core/src/theme/index.ts';

/**
 * The fixture's `DiagramPlugin.theme`: its vars are the vocabulary's without `usedBy` (a port
 * imports them from `./generated/variables.ts`), keyed by family, never by theme name (D331).
 */
export const theme: DiagramThemeTable = {
  section: 'demo',
  vars: {
    demoFill: { alias: 'dmf', kind: 'color', nested: 'fill' },
    demoText: { alias: 'dmt', kind: 'color', nested: 'text' },
    demoGap: { alias: 'dmx', kind: 'length' },
    demoPad: { alias: 'dmp', kind: 'padding' },
    demoOpacity: { alias: 'dmo', kind: 'opacity' },
    demoOn: { alias: 'dmn', kind: 'flag' },
  },
  rules: {
    light: { demoFill: 'mix(mainBkg, background, 50%)', demoText: 'textColor' },
    dark: { demoFill: 'mix(mainBkg, background, 30%)' },
  },
  families: {
    classic: { tokens: { demoGap: 4, demoPad: 'padding', demoOpacity: 0.7, demoOn: false } },
    redux: {
      rules: { demoText: 'primaryTextColor' },
      tokens: { demoGap: 8, demoPad: 12, demoOpacity: 1, demoOn: true },
      dark: { values: { demoFill: '#222222' } },
    },
    neo: { fallback: 'redux', tokens: { demoGap: 6 } },
  },
};
