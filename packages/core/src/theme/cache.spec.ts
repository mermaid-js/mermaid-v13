import { describe, expect, it } from 'vitest';
import { createTheme, loadTheme, type DiagramThemeTable, type ThemeWarning } from './index.ts';

const base = await loadTheme('base');
const dark = await loadTheme('dark');

describe('theme value cache', () => {
  it('reuses checked values regardless of input identity, property order or output mode', () => {
    const a = createTheme(base, {
      themeVariables: { primaryColor: ' #123456 ', strokeWidth: 2, cScale: ['red', 'blue'] },
    });
    const b = createTheme(base, {
      cssVariables: false,
      themeVariables: { cScale: 'red,blue', strokeWidth: '2', primaryColor: '#123456' },
    });
    expect(a.value).toBe(b.value);
    expect(a.color('primaryColor')).toBe('var(--_p)');
    expect(b.color('primaryColor')).toBe('#123456');
    expect(b.rootStyleText()).toBe('');
    const { number, value } = b;
    expect(number('strokeWidth')).toBe(2);
    expect(value('primaryColor')).toBe('#123456');
  });

  it('rereads mutable flat, nested, palette and numbered overrides without changing old themes', () => {
    const diagram: DiagramThemeTable = {
      section: 'demo',
      vars: { demoFill: { alias: 'dmf', kind: 'color', nested: 'fill' } },
      rules: { light: { demoFill: 'primaryColor' } },
    };
    const themeVariables = {
      primaryColor: '#112233',
      demo: { fill: 'red' },
      cScale: ['red', 'blue'],
      cScale1: 'green',
    };
    const first = createTheme(base, { diagram, themeVariables });
    expect(first.value('demoFill')).toBe('red');
    expect(first.palette('cScale')).toEqual(['red', 'green']);
    themeVariables.primaryColor = '#445566';
    themeVariables.demo.fill = 'blue';
    themeVariables.cScale[0] = 'yellow';
    themeVariables.cScale1 = 'white';
    const second = createTheme(base, { diagram, themeVariables });
    expect(second.value('primaryColor')).toBe('#445566');
    expect(second.value('demoFill')).toBe('blue');
    expect(second.palette('cScale')).toEqual(['yellow', 'white']);
    expect(first.value('primaryColor')).toBe('#112233');
    expect(first.value('demoFill')).toBe('red');
    expect(first.palette('cScale')).toEqual(['red', 'green']);
  });

  it('checks unsafe values and emits warnings in each call, in that input’s order', () => {
    const warnings: ThemeWarning[][] = [[], []];
    const inputs = [
      { primaryColor: 'url(javascript:x)', lineColor: 'red;}svg{}', cScale: ['url(x)'] },
      { lineColor: 'red;}svg{}', primaryColor: 'url(javascript:x)', cScale: ['url(x)'] },
    ];
    const themes = inputs.map((themeVariables, i) =>
      createTheme(base, { themeVariables, warn: (w) => warnings[i]!.push(w) })
    );
    expect(themes[0]!.value).toBe(themes[1]!.value);
    expect(warnings.map((list) => list.length)).toEqual([3, 3]);
    expect(warnings[0]![0]!.message).toContain('primaryColor');
    expect(warnings[1]![0]!.message).toContain('lineColor');
    expect(warnings[0]![2]!.message).toContain('cScale');
    expect(themes[1]!.value('primaryColor')).toBe('#fff4dd');
  });

  it('isolates used aliases, auto declarations and lazy gradient ids between renders', () => {
    let reads = 0;
    const make = (id: string) =>
      createTheme(base, {
        dark,
        themeVariables: { primaryColor: '#123456', useGradient: true },
        idPrefix: () => {
          reads++;
          return id;
        },
      });
    const a = make('first');
    const b = make('second');
    expect(a.value).toBe(b.value);
    a.color('primaryColor');
    expect(b.autoDeclarations()).toEqual({ light: {}, dark: {} });
    b.length('strokeWidth');
    expect(a.rootStyleText()).toBe('');
    expect(b.rootStyle()).toHaveProperty('--_sw');
    expect(b.autoDeclarations()).toEqual({ light: {}, dark: {} });
    expect(reads).toBe(0);
    expect(a.gradient()?.id).toBe('first-gradient');
    expect(b.gradient()?.id).toBe('second-gradient');
    expect(a.gradient()?.id).toBe('first-gradient');
    expect(reads).toBe(2);
  });

  it('separates spec, dark spec, table, fragment rules and author dark mode', () => {
    const themeVariables = { primaryColor: '#abcdef' };
    const a = createTheme(base, { themeVariables });
    const other = [
      createTheme(dark, { themeVariables }),
      createTheme(base, { themeVariables, dark }),
      createTheme(base, { themeVariables, rules: { extraInk: 'red' } }),
      createTheme(base, { themeVariables, diagram: { vars: {}, rules: { light: {} } } }),
      createTheme(base, { themeVariables: { ...themeVariables, darkMode: true } }),
    ];
    for (const theme of other) expect(theme.value).not.toBe(a.value);
    expect(other[4]!.dark).toBe(true);
    expect(other[2]!.value('extraInk')).toBe('red');
    expect(other[1]!.autoDeclarations()).toEqual({ light: {}, dark: {} });
  });

  it('preserves resolution errors when equivalent overrides reuse a failed resolver', () => {
    const rules = { extraInk: 'notAColourOrVariable', dependentInk: 'extraInk' };
    for (let attempt = 0; attempt < 3; attempt++) {
      const theme = createTheme(base, { rules, themeVariables: { primaryColor: '#abcdef' } });
      for (const name of ['extraInk', 'dependentInk'])
        expect(() => theme.value(name)).toThrowError(
          new SyntaxError('Unknown colour notAColourOrVariable')
        );
      expect(theme.value('primaryColor')).toBe('#abcdef');
    }
  });

  it('bounds retained value variants and reconstructs evicted values correctly', () => {
    const spec = { ...base };
    const first = createTheme(spec, { themeVariables: { strokeWidth: 1 } });
    for (let strokeWidth = 2; strokeWidth < 42; strokeWidth++)
      expect(createTheme(spec, { themeVariables: { strokeWidth } }).number('strokeWidth')).toBe(
        strokeWidth
      );
    const again = createTheme(spec, { themeVariables: { strokeWidth: 1 } });
    expect(again.number('strokeWidth')).toBe(1);
    expect(again.value).not.toBe(first.value);
    expect(first.number('strokeWidth')).toBe(1);
  });
});
