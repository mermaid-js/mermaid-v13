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

  it('writes invert and contrast as CSS that follows the variable they derive from (R-THEME-4)', () => {
    const rules = { a: 'invert(primaryColor)', b: 'contrast(primaryColor, #333333, white)' };
    const t = createTheme(base, { rules });
    t.color('a');
    t.color('b');
    const root = t.rootStyle();
    expect(root['--_a']).toBe(
      'var(--mermaid-a,color(from var(--_p) srgb calc(1 - r) calc(1 - g) calc(1 - b) / alpha))'
    );
    expect(root['--_b']).toMatch(
      /^var\(--mermaid-b,color\(from color\(from var\(--_p\) srgb-linear /
    );
    expect(root['--_p']).toBe('var(--mermaid-primaryColor,#fff4dd)');
  });

  it('lightenHsl and darkenHsl move HSL lightness as khroma does, in JS and CSS (D117)', () => {
    const rules = { a: 'lightenHsl(primaryColor, 5%)', b: 'darkenHsl(#1f2020, 10%)' };
    const lit = createTheme(base, { rules, cssVariables: false });
    // v12 theme-base: khroma lighten('#fff4dd', 5) = hsl(40.588…, 100%, 98.333…%).
    expect(lit.color('a')).toBe('#fffcf6');
    expect(lit.color('b')).toBe('#060606');
    expect(
      createTheme(base, { rules: { c: 'lightenHsl(#3366cc, 100%)' }, cssVariables: false }).color(
        'c'
      )
    ).toBe('#ffffff');
    const t = createTheme(base, { rules });
    t.color('a');
    t.color('b');
    expect(t.rootStyle()['--_a']).toBe(
      'var(--mermaid-a,hsl(from var(--_p) h s clamp(0, l + 5, 100) / alpha))'
    );
    expect(t.rootStyle()['--_b']).toBe(
      'var(--mermaid-b,hsl(from #1f2020 h s clamp(0, l - 10, 100) / alpha))'
    );
  });

  it('adjust offsets each RGB channel as khroma does, clamped to 0–255, in JS and CSS (D232)', () => {
    const lit = (rule: string) =>
      createTheme(base, { rules: { x: rule }, cssVariables: false }).color('x');
    // v12 theme-base quadrant2Fill: khroma adjust('#fff4dd', { r: 5, g: 5, b: 5 }).
    expect(lit('adjust(primaryColor, 5, 5, 5)')).toBe('#fff9e2');
    expect(lit('adjust(#ececff, -15, -15, -15)')).toBe('#ddddf0');
    expect(lit('adjust(#336699, 10, -20, 0)')).toBe('#3d5299');
    expect(lit('adjust(#0a0a0a, -20, 255, 2.5)')).toBe('#00ff0d');
    expect(lit('adjust(#11223380, 1, 1, 1)')).toBe('#12233480');
    const t = createTheme(base, { rules: { a: 'adjust(primaryColor, 5, -10, 0)' } });
    t.color('a');
    expect(t.rootStyle()['--_a']).toBe(
      'var(--mermaid-a,rgb(from var(--_p) clamp(0, r + 5, 255) clamp(0, g - 10, 255) clamp(0, b + 0, 255) / alpha))'
    );
  });

  it('rejects malformed rules and cycles', () => {
    const bad = (rule: string) => () =>
      createTheme(base, { rules: { x: rule }, cssVariables: false }).color('x');
    expect(bad('mix(primaryColor, black)')).toThrow(/mix takes 3 arguments/);
    expect(bad('blend(primaryColor)')).toThrow(/unknown function blend/);
    expect(bad('mix(primaryColor, black, 15%) junk')).toThrow(/unexpected text/);
    expect(bad('url(javascript:x)')).toThrow(SyntaxError);
    expect(bad('notAColourOrVariable')).toThrow(/Unknown colour/);
    expect(bad('adjust(primaryColor, 5, 5)')).toThrow(/adjust takes 4 arguments/);
    expect(bad('adjust(primaryColor, 5%, 5, 5)')).toThrow(/adjust needs a number/);
    expect(bad('adjust(primaryColor, 256, 0, 0)')).toThrow(/adjust needs a number/);
    expect(bad('lighten(primaryColor, 5)')).toThrow(/lighten needs a percentage/);
    expect(bad('5')).toThrow(SyntaxError);
    expect(() =>
      createTheme(base, { rules: { x: 'y', y: 'x' }, cssVariables: false }).color('x')
    ).toThrow(/cycle/);
  });

  it('refuses names that are not theme variables', () => {
    expect(() => createTheme(base).color('nope')).toThrow(TypeError);
    expect(() => createTheme(base).color('strokeWidth')).toThrow(/not a colour/);
  });
});
