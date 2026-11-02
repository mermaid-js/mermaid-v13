import { describe, expect, it } from 'vitest';
import { createTheme, loadTheme } from './index.ts';

const base = await loadTheme('base');

describe('diagram plugin rule tables (DESIGN §12.1)', () => {
  it('adds derived variables a plugin reads, overridable like the built-in ones', () => {
    const rules = { pie1: 'lighten(primaryColor, 20%)', pie2: 'alpha(pie1, 50%)' };
    const t = createTheme(base, { rules });
    t.color('pie2');
    expect(t.rootStyle()).toEqual({
      '--_pie2': 'var(--mermaid-pie2,color-mix(in srgb,var(--_pie1) 50%,transparent))',
      '--_pie1': 'var(--mermaid-pie1,color-mix(in srgb,var(--_p) 80%,white))',
      '--_p': 'var(--mermaid-primaryColor,#fff4dd)',
    });
    const lit = createTheme(base, { rules, cssVariables: false, themeVariables: { pie1: '#000' } });
    expect(lit.color('pie2')).toBe('#00000080');
  });

  it('computes invert and contrast when the theme is built', () => {
    const rules = { a: 'invert(background)', b: 'contrast(#000080, primaryTextColor, white)' };
    const t = createTheme(base, { rules, cssVariables: false });
    expect(t.color('a')).toBe('#0b0b0b');
    expect(t.color('b')).toBe('white');
  });

  it('rejects malformed rules and cycles', () => {
    const bad = (rule: string) => () =>
      createTheme(base, { rules: { x: rule }, cssVariables: false }).color('x');
    expect(bad('mix(primaryColor, black)')).toThrow(/mix takes 3 arguments/);
    expect(bad('blend(primaryColor)')).toThrow(/unknown function blend/);
    expect(bad('mix(primaryColor, black, 15%) junk')).toThrow(/unexpected text/);
    expect(bad('url(javascript:x)')).toThrow(SyntaxError);
    expect(bad('notAColourOrVariable')).toThrow(/Unknown colour/);
    expect(() =>
      createTheme(base, { rules: { x: 'y', y: 'x' }, cssVariables: false }).color('x')
    ).toThrow(/cycle/);
  });

  it('refuses names that are not theme variables', () => {
    expect(() => createTheme(base).color('nope')).toThrow(TypeError);
    expect(() => createTheme(base).color('strokeWidth')).toThrow(/not a colour/);
  });
});
