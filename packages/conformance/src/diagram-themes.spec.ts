import { createTheme, loadTheme, type DiagramThemeTable } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { DIAGRAM_TABLES, VOCABULARY, everyTable } from './diagram-themes.ts';

const table: DiagramThemeTable = {
  vars: {
    demoFill: { alias: 'dmf', kind: 'color' },
    demoGap: { alias: 'dmx', kind: 'length' },
  },
  rules: { light: { demoFill: 'mix(mainBkg, black, 20%)' } },
  families: { classic: { tokens: { demoGap: 4 } }, redux: { tokens: { demoGap: 8 } } },
};

describe('the diagram theme tables the theme specs pass (spec #414 T0b)', () => {
  it('has every first-party type, and core’s vocabulary among the names', () => {
    expect(Object.keys(DIAGRAM_TABLES).sort()).toEqual(
      [
        'class',
        'er',
        'flowchart',
        'gantt',
        'gitgraph',
        'journey',
        'mindmap',
        'pie',
        'quadrant',
        'sequence',
        'state',
        'timeline',
        'xychart',
      ].sort()
    );
    expect(VOCABULARY.mainBkg?.kind).toBe('color');
  });

  it("answers a table's variable from that table and the rest from core", async () => {
    const spec = await loadTheme('redux');
    const all = everyTable(spec, { cssVariables: false }, { demo: table, none: undefined });
    const own = createTheme(spec, { cssVariables: false, diagram: table });
    const core = createTheme(spec, { cssVariables: false });
    expect(all.value('demoFill')).toBe(own.value('demoFill'));
    expect(all.number('demoGap')).toBe(8);
    expect(core.value('demoFill')).toBe('currentColor');
    expect(all.value('mainBkg')).toBe(core.value('mainBkg'));
    expect(all.palette('cScale')).toEqual(core.palette('cScale'));
    expect(all.dark).toBe(false);
  });
});
