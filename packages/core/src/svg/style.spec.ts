import { describe, expect, it } from 'vitest';
import {
  checkColor,
  checkCssColor,
  checkStyle,
  joinStyle,
  px,
  streamWriter,
  styleText,
  themeRef,
  type SvgWarning,
} from './index.ts';

const collect = () => {
  const warnings: SvgWarning[] = [];
  return { warnings, warn: (w: SvgWarning) => warnings.push(w) };
};

describe('checkStyle', () => {
  it('splits allowed declarations into shape and text presentation attributes', () => {
    const { warnings, warn } = collect();
    const s = checkStyle(
      [
        'fill:#f9f',
        'stroke:#333',
        'stroke-width:4px',
        'rx:10',
        'ry:5px',
        'stroke-dasharray: 5, 5',
        'color:red',
        'font-weight:bold',
        'opacity:0.5',
      ],
      warn
    );
    expect(s.shape).toEqual({
      fill: '#f9f',
      stroke: '#333',
      'stroke-width': '4px',
      rx: '10',
      ry: '5px',
      'stroke-dasharray': '5 5',
      opacity: '0.5',
    });
    expect(s.text).toEqual({ fill: 'red', 'font-weight': 'bold', opacity: '0.5' });
    expect(warnings).toEqual([]);
  });

  it('strips !important and lets later declarations win', () => {
    expect(checkStyle(['fill:red !important', 'fill:blue']).shape).toEqual({ fill: 'blue' });
  });

  it('accepts colour functions and Mermaid variables', () => {
    for (const c of [
      'rgb(1, 2, 3)',
      'rgba(0,0,0,.5)',
      'hsl(120 50% 50%)',
      'oklch(70% 0.1 200)',
      'color-mix(in srgb, red 50%, blue)',
      'var(--mermaid-primaryColor)',
      'var(--_pf, #fff)',
      'transparent',
      '#abcd',
    ]) {
      expect(checkColor(c), c).toBe(c);
    }
  });

  const INJECTIONS = [
    'url(javascript:alert(1))',
    'url (https://evil.example/x.png)',
    'URL(//evil.example/x)',
    'expression(alert(1))',
    'red;background:url(//evil.example/x)',
    'red} body {background:red',
    'red<script>',
    'red/* comment */',
    '@import "x.css"',
    'image-set("x.png" 1x)',
    'javascript:alert(1)',
    'red\\3b background:red',
    'var(--evil)',
    'env(safe-area-inset-top)',
    'attr(data-x)',
    'rgb(1,2,3',
    'red\u0000',
    '"red"',
  ];

  it('drops a misspelt colour, with a warning, and keeps the rest (#1195)', () => {
    for (const v of [
      'redd',
      'lightgren',
      'notacolour',
      '#12',
      '#12345',
      '#1234567',
      '#ggg',
      'red blue',
      'red,blue',
      '12',
      'none none',
    ]) {
      const { warnings, warn } = collect();
      const s = checkStyle([`fill:${v}`, `stroke:${v}`, `color:${v}`, 'stroke-width:2px'], warn);
      expect(s, v).toEqual({ shape: { 'stroke-width': '2px' }, text: {} });
      expect(
        warnings.map((w) => w.code),
        v
      ).toEqual(['STYLE_VALUE_DROPPED', 'STYLE_VALUE_DROPPED', 'STYLE_VALUE_DROPPED']);
    }
  });

  it('is checkCssColor alone, too: trimmed, and a colour CSS knows or nothing (D690)', () => {
    for (const v of ['redd', '#12345', 'red blue', 'calculated', '', 'url(#x)'])
      expect(checkCssColor(v), v).toBeUndefined();
    for (const v of ['red', 'RebeccaPurple', 'none', 'CanvasText', '#f9f8', 'oklch(70% 0.1 200)'])
      expect(checkCssColor(` ${v} `), v).toBe(v);
    // checkColor keeps its wider reading for values no author misspells (theme rules, math, icons).
    expect(checkColor('redd')).toBe('redd');
  });

  it('keeps an earlier colour when a later one is misspelt, as CSS does', () => {
    expect(checkStyle(['fill:red', 'fill:redd']).shape).toEqual({ fill: 'red' });
  });

  it('keeps every form of colour CSS knows, as written (#1195)', () => {
    for (const v of [
      'red',
      'LightGreen',
      'lightslategrey',
      'RebeccaPurple',
      'none',
      'transparent',
      'currentColor',
      'inherit',
      'initial',
      'unset',
      'revert',
      'revert-layer',
      'CanvasText',
      'ButtonFace',
      'Window',
      '#f9f',
      '#f9f8',
      '#ff99ff',
      '#FF99FF80',
      'rgb(1, 2, 3)',
      'rgba(0,0,0,.5)',
      'hsl(none 0% 0%)',
      'hwb(1turn 0% 0%)',
      'oklch(70% 0.1 200)',
      'color-mix(in srgb, red 50%, blue)',
      'light-dark(red, blue)',
      'var(--mermaid-primaryColor)',
      'var(--_pf, #fff)',
    ]) {
      const { warnings, warn } = collect();
      expect(checkStyle([`fill:${v}`, `color:${v}`], warn), v).toEqual({
        shape: { fill: v },
        text: { fill: v },
      });
      expect(warnings, v).toEqual([]);
    }
  });

  it('drops CSS injection in colour values, with a warning', () => {
    for (const v of INJECTIONS) {
      const { warnings, warn } = collect();
      const s = checkStyle([`fill:${v}`, `stroke:${v}`, `color:${v}`], warn);
      expect(s, v).toEqual({ shape: {}, text: {} });
      expect(
        warnings.map((w) => w.code),
        v
      ).toEqual(['STYLE_VALUE_DROPPED', 'STYLE_VALUE_DROPPED', 'STYLE_VALUE_DROPPED']);
    }
  });

  it('drops unsafe values for every other property', () => {
    for (const prop of [
      'stroke-width',
      'rx',
      'ry',
      'stroke-dasharray',
      'font-size',
      'font-family',
      'font-weight',
      'font-style',
      'opacity',
      'text-decoration',
    ]) {
      for (const v of ['url(x)', '1px;x:y', '1px}', 'expression(1)', 'calc(1px)']) {
        const { warnings, warn } = collect();
        expect(checkStyle([`${prop}:${v}`], warn), `${prop}:${v}`).toEqual({ shape: {}, text: {} });
        expect(warnings).toHaveLength(1);
      }
    }
  });

  it('drops properties that are not on the allow-list, with a warning', () => {
    for (const d of [
      'background:red',
      'background-image:url(x)',
      'marker-end:url(#x)',
      'filter:blur(1px)',
      'behavior:url(x.htc)',
      '-moz-binding:url(x)',
      'content:"x"',
      'display:none',
      '__proto__:x',
      'constructor:x',
      'noColon',
    ]) {
      const { warnings, warn } = collect();
      expect(checkStyle([d], warn), d).toEqual({ shape: {}, text: {} });
      expect(
        warnings.map((w) => w.code),
        d
      ).toEqual(['STYLE_PROPERTY_DROPPED']);
    }
  });

  it('keeps fonts with non-ASCII names and quoted families', () => {
    expect(checkStyle(['font-family:"Trebuchet MS", 微软雅黑, sans-serif']).text).toEqual({
      'font-family': '"Trebuchet MS", 微软雅黑, sans-serif',
    });
  });

  describe('a comma inside a value (D706)', () => {
    it('joins the pieces of a function the parser split on its commas', () => {
      const { warnings, warn } = collect();
      // As the state parser splits `fill:rgb(255, 200, 200),stroke:hsl(0, 50%, 40%)`.
      expect(
        checkStyle(['fill:rgb(255', '200', '200)', 'stroke:hsl(0', ' 50%', ' 40%)'], warn).shape
      ).toEqual({ fill: 'rgb(255, 200, 200)', stroke: 'hsl(0, 50%, 40%)' });
      expect(warnings).toEqual([]);
    });

    it('gives the same value whether or not the parser trimmed the pieces', () => {
      expect(checkStyle(['fill:rgb(255', ' 200', ' 200)'])).toEqual(
        checkStyle(['fill:rgb(255', '200', '200)'])
      );
    });

    it('keeps the whole font-family list', () => {
      const { warnings, warn } = collect();
      expect(
        checkStyle(['font-family:Georgia', ' "Times New Roman"', 'serif', 'color:red'], warn).text
      ).toEqual({ 'font-family': 'Georgia, "Times New Roman", serif', fill: 'red' });
      expect(warnings).toEqual([]);
    });

    it('still drops a piece with no colon that follows neither', () => {
      for (const decls of [['fill:red', 'blue'], ['stroke-dasharray:5', '5'], ['blue']]) {
        const { warnings, warn } = collect();
        checkStyle(decls, warn);
        expect(
          warnings.map((w) => w.code),
          decls.join(',')
        ).toEqual(['STYLE_PROPERTY_DROPPED']);
      }
    });

    it('joinStyle joins one statement; checkStyle with joined pieces joins nothing more', () => {
      expect(joinStyle(['font-family:Georgia', ' serif', 'fill:rgb(1', '2', '3)'])).toEqual([
        'font-family:Georgia, serif',
        'fill:rgb(1, 2, 3)',
      ]);
      const { warnings, warn } = collect();
      expect(checkStyle(['font-family:Georgia', 'bold'], warn, true).text).toEqual({
        'font-family': 'Georgia',
      });
      expect(warnings.map((w) => w.code)).toEqual(['STYLE_PROPERTY_DROPPED']);
    });

    it('stops joining once the parentheses are closed', () => {
      expect(checkStyle(['fill:rgb(1', '2', '3)', 'stroke:red']).shape).toEqual({
        fill: 'rgb(1, 2, 3)',
        stroke: 'red',
      });
    });
  });

  it('writes checked values as presentation attributes', () => {
    const s = checkStyle(['fill:#f9f', 'stroke-width:2px']);
    const w = streamWriter();
    w.leaf('rect', { ...s.shape, width: 1 });
    expect(w.finish()).toBe('<rect fill="#f9f" stroke-width="2px" width="1"/>');
  });
});

describe('themeRef and styleText', () => {
  it('build a root style from checked parts', () => {
    expect(
      styleText({
        'max-width': px(120.5),
        '--_pf': themeRef('--mermaid-primaryColor', checkColor('#ECECFF')),
      })
    ).toBe('max-width:120.5px;--_pf:var(--mermaid-primaryColor,#ECECFF)');
  });

  it('refuse names and values that are not allowed', () => {
    expect(() => themeRef('--a);background:url(x')).toThrow(TypeError);
    expect(() => themeRef('primaryColor')).toThrow(TypeError);
    // @ts-expect-error -- values must be branded
    expect(() => styleText({ background: 'red' })).toThrow(TypeError);
    // @ts-expect-error -- values must be branded
    expect(() => styleText({ fill: 'red;x:url(y)' })).toThrow(TypeError);
  });
});
