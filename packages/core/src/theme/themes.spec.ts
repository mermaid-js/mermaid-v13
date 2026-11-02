import { describe, expect, it } from 'vitest';
import {
  BASE_VARIABLES,
  THEME_NAMES,
  THEME_VARIABLES,
  composite,
  contrastRatio,
  createTheme,
  loadTheme,
  loadedTheme,
  parseColor,
  resolveThemeName,
  type Rgba,
  type ThemeWarning,
} from './index.ts';

const specs = await Promise.all(THEME_NAMES.map((n) => loadTheme(n)));

// Text drawn on a fill, per the flowchart and core renderers.
const TEXT_ON_FILL: readonly [text: string, fill: string][] = [
  ['primaryTextColor', 'primaryColor'],
  ['secondaryTextColor', 'secondaryColor'],
  ['tertiaryTextColor', 'tertiaryColor'],
  ['nodeTextColor', 'mainBkg'],
  ['titleColor', 'clusterBkg'],
  ['textColor', 'edgeLabelBackground'],
  ['textColor', 'background'],
  ['noteTextColor', 'noteBkgColor'],
  ['errorTextColor', 'background'],
];

describe('built-in themes', () => {
  it('ships redux, default, dark, forest, neutral and base (D64), light and dark', () => {
    expect(specs.map((s) => s.name)).toEqual([...THEME_NAMES]);
    expect(specs.filter((s) => s.dark).map((s) => s.name)).toEqual(['dark']);
  });

  it.each(specs.map((s) => [s.name, s] as const))(
    '%s meets WCAG AA for text on fills (R-THEME-9)',
    (_name, spec) => {
      const t = createTheme(spec, { cssVariables: false });
      const bg = t.rgba('background') as Rgba;
      const failures: string[] = [];
      for (const [text, fill] of TEXT_ON_FILL) {
        const f = t.rgba(fill) as Rgba;
        const under = f[3] < 1 ? composite(f, bg) : f;
        const ratio = contrastRatio(t.rgba(text) as Rgba, under);
        if (!(ratio >= 4.5)) failures.push(`${text} on ${fill}: ${ratio.toFixed(2)}`);
      }
      expect(failures).toEqual([]);
    }
  );

  it.each(specs.map((s) => [s.name, s] as const))(
    '%s resolves every inventory variable to a safe literal',
    (_name, spec) => {
      const t = createTheme(spec, { cssVariables: false });
      for (const [name, def] of Object.entries(THEME_VARIABLES)) {
        const v = t.value(name);
        if (def.kind === 'color') expect(parseColor(v), `${spec.name}.${name}=${v}`).toBeDefined();
        else expect(v, name).not.toBe('');
      }
    }
  );

  it('renders fully from at most 8 base variables (R-THEME-5)', async () => {
    expect(BASE_VARIABLES.length).toBeLessThanOrEqual(8);
    const base = await loadTheme('base');
    expect(base.values).toBeUndefined();
    expect(base.rules).toBeUndefined();
    const vars = {
      primaryColor: '#1d3557',
      secondaryColor: '#a8dadc',
      tertiaryColor: '#f1faee',
      background: '#ffffff',
      primaryTextColor: '#111111',
      lineColor: '#457b9d',
      fontFamily: 'Georgia, serif',
      fontSize: '15px',
    };
    const t = createTheme(base, { themeVariables: vars, cssVariables: false });
    expect(t.value('mainBkg')).toBe('#1d3557');
    // Dark primary: node text flips to the light ink and stays readable.
    expect(t.value('nodeTextColor')).toBe('#ffffff');
    expect(t.value('clusterBkg')).toBe('#f1faee');
    expect(t.value('arrowheadColor')).toBe('#457b9d');
    expect(t.number('fontSize')).toBe(15);
    expect(t.font()).toBe('Georgia, serif');
  });

  it('honours darkMode on the base theme, as v12 does', async () => {
    const base = await loadTheme('base');
    const t = createTheme(base, {
      themeVariables: { darkMode: true, primaryColor: '#202020' },
      cssVariables: false,
    });
    expect(t.dark).toBe(true);
    // Dark rule: borders lighten.
    expect(t.value('primaryBorderColor')).toBe('#4d4d4d');
  });
});

describe('theme names', () => {
  it('defaults to redux, which is always loaded for renderSync (D55)', () => {
    expect(resolveThemeName(undefined)).toEqual({ name: 'redux' });
    expect(loadedTheme('redux')?.name).toBe('redux');
  });

  it('resolves the v12 flowchart section default redux-color to redux, silently', () => {
    const warnings: ThemeWarning[] = [];
    expect(resolveThemeName('redux-color', (w) => warnings.push(w))).toEqual({ name: 'redux' });
    expect(warnings).toEqual([]);
  });

  it('stands in for v12 themes not shipped yet, and unknown names, with a warning', () => {
    const warnings: ThemeWarning[] = [];
    const warn = (w: ThemeWarning) => warnings.push(w);
    expect(resolveThemeName('redux-dark', warn)).toEqual({ name: 'dark' });
    expect(resolveThemeName('purple', warn)).toEqual({ name: 'redux' });
    expect(resolveThemeName('__proto__', warn)).toEqual({ name: 'redux' });
    expect(warnings.map((w) => w.code)).toEqual([
      'THEME_UNAVAILABLE',
      'THEME_UNAVAILABLE',
      'THEME_UNAVAILABLE',
    ]);
  });

  it('auto pairs redux with dark (R-THEME-8)', () => {
    expect(resolveThemeName('auto')).toEqual({ name: 'redux', dark: 'dark' });
  });
});
