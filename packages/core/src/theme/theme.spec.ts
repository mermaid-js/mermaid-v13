import { describe, expect, it } from 'vitest';
import { assertInert, streamWriter, styleText } from '../svg/index.ts';
import { createTheme, loadTheme, type ThemeWarning } from './index.ts';

const base = await loadTheme('base');

describe('createTheme: CSS variables (R-THEME-2, -4)', () => {
  it('references base variables through an alias with the theme value as fallback', () => {
    const t = createTheme(base);
    expect(t.color('primaryColor')).toBe('var(--_p)');
    expect(t.rootStyle()).toEqual({ '--_p': 'var(--mermaid-primaryColor,#fff4dd)' });
  });

  it('derives in CSS from the base aliases, writing only the aliases used', () => {
    const t = createTheme(base);
    t.color('nodeBorder');
    expect(t.rootStyle()).toEqual({
      '--_nb': 'var(--mermaid-nodeBorder,var(--_pb))',
      '--_pb': 'var(--mermaid-primaryBorderColor,color-mix(in srgb,var(--_p) 85%,black))',
      '--_p': 'var(--mermaid-primaryColor,#fff4dd)',
    });
  });

  it('uses an explicit themeVariables value as the literal fallback; the CSS var still wins', () => {
    const t = createTheme(base, { themeVariables: { primaryBorderColor: '#ff0000' } });
    t.color('nodeBorder');
    expect(t.rootStyle()['--_pb']).toBe('var(--mermaid-primaryBorderColor,#ff0000)');
    expect(t.rootStyle()['--_p']).toBeUndefined();
  });

  it('re-derives from an overridden base variable', () => {
    const t = createTheme(base, {
      themeVariables: { primaryColor: '#ffffff' },
      cssVariables: false,
    });
    // color-mix(in srgb, #fff 85%, black) = rgb(216.75 …), written #d9d9d9
    expect(t.color('nodeBorder')).toBe('#d9d9d9');
    expect(t.color('mainBkg')).toBe('#ffffff');
  });

  it('drops unsafe theme variables with a warning and ignores unknown ones', () => {
    const warnings: ThemeWarning[] = [];
    const t = createTheme(base, {
      themeVariables: {
        primaryColor: 'url(javascript:alert(1))',
        lineColor: 'red;}svg{fill:red',
        pie1: '#123456',
        fontFamily: 'x</style><script>',
      },
      cssVariables: false,
      warn: (w) => warnings.push(w),
    });
    expect(t.color('primaryColor')).toBe('#fff4dd');
    expect(t.color('lineColor')).toBe('#0b0b0b');
    expect(warnings.map((w) => w.code)).toEqual([
      'THEME_VARIABLE_DROPPED',
      'THEME_VARIABLE_DROPPED',
      'THEME_VARIABLE_DROPPED',
    ]);
  });

  it('accepts the colour functions on the allow-list, leaving them to CSS', () => {
    const t = createTheme(base, { themeVariables: { primaryColor: 'oklch(70% 0.1 200)' } });
    t.color('mainBkg');
    expect(t.rootStyle()['--_p']).toBe('var(--mermaid-primaryColor,oklch(70% 0.1 200))');
  });
});

describe('createTheme: output.cssVariables false (ADR-4)', () => {
  it('writes literal colours and no root aliases', () => {
    const t = createTheme(base, { cssVariables: false });
    expect(t.color('mainBkg')).toBe('#fff4dd');
    expect(t.color('nodeBorder')).toBe('#d9cfbc');
    expect(t.length('strokeWidth')).toBe(1);
    expect(t.rootStyle()).toEqual({});
  });
});

describe('createTheme: shape tokens (R-THEME-11)', () => {
  it('exposes tokens as CSS variables and as numbers for geometry', () => {
    const t = createTheme(base, { themeVariables: { radius: '8px', strokeWidth: 3 } });
    expect(t.number('radius')).toBe(8);
    expect(t.number('fontSize')).toBe(16);
    expect(t.length('strokeWidth')).toBe('var(--_sw)');
    expect(t.rootStyle()).toEqual({ '--_sw': 'var(--mermaid-strokeWidth,3px)' });
    expect(t.font()).toBe('var(--_ff)');
  });
});

describe('createTheme: author fills get contrasting ink (R-THEME-12)', () => {
  it('keeps the theme ink when it reads, and picks one that does otherwise', () => {
    const t = createTheme(base);
    expect(t.ink('#ffffff')).toBeUndefined();
    expect(t.ink('#f9f')).toBeUndefined();
    expect(t.ink('#000080')).toBe('#ffffff');
    expect(t.ink('darkred')).toBe('#ffffff');
    // Unknown or mostly transparent fills keep the theme ink.
    expect(t.ink('var(--mermaid-x)')).toBeUndefined();
    expect(t.ink('rgba(0,0,0,0.2)')).toBeUndefined();
  });
});

describe('standalone SVG (R-THEME-2)', () => {
  it('renders with no host CSS: every alias carries its fallback, and the output is inert', () => {
    const t = createTheme(base);
    const fill = t.color('mainBkg');
    const stroke = t.color('nodeBorder');
    const width = t.length('strokeWidth');
    // The body is rendered first; rootStyle() then holds every alias it used.
    const w = streamWriter();
    w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', style: styleText(t.rootStyle()) });
    w.leaf('rect', { width: 10, height: 10, fill, stroke, 'stroke-width': width });
    w.close();
    const svg = w.finish();
    assertInert(svg);
    expect(svg).toContain('--_p:var(--mermaid-primaryColor,#fff4dd)');
    expect(svg).toContain('fill="var(--_mb)"');
    // Every var(--_x) used is declared on the root.
    for (const m of svg.matchAll(/var\((--_\w+)\)/g)) expect(svg).toContain(m[1] + ':');
  });
});
