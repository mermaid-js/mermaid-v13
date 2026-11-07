import type { DiagramThemeVarDef } from '../../../../../../../../packages/core/src/theme/index.ts';

/**
 * A fixture diagram package's theme vocabulary (spec #414 T0b), in the shape a port writes in
 * `packages/diagram-<type>/src/theme/vocabulary.ts`: core's `THEME_VARIABLES` rows, plus the
 * nested key under the table's section (D540).
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  demoFill: { alias: 'dmf', kind: 'color', usedBy: ['demo'], nested: 'fill' },
  demoText: { alias: 'dmt', kind: 'color', usedBy: ['demo'], nested: 'text' },
  demoGap: { alias: 'dmx', kind: 'length', usedBy: ['demo'] },
  demoPad: { alias: 'dmp', kind: 'padding', usedBy: ['demo'] },
  demoOpacity: { alias: 'dmo', kind: 'opacity', usedBy: ['demo'] },
  demoOn: { alias: 'dmn', kind: 'flag', usedBy: [] },
};
