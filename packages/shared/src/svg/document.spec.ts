import { describe, expect, it } from 'vitest';
import { streamWriter } from '@mermaid-js/core/svg';
import type { SafeColor, StyleText } from '@mermaid-js/core/svg';
import { cls, openSvgRoot, paletteSlots, styleCache } from './document.ts';
import type { RootContext } from './document.ts';

const ctx = (idPrefix?: () => string): RootContext => ({
  theme: { rootStyleText: () => '' as StyleText, autoDeclarations: () => undefined },
  get idPrefix() {
    return idPrefix?.();
  },
  version: '13.0.0',
});

describe('openSvgRoot', () => {
  it('writes the root at full width, named by its title and description', () => {
    const w = streamWriter();
    openSvgRoot(
      w,
      ctx(() => 'm1'),
      {
        name: 'er erDiagram',
        viewBox: [0, 0, 10, 20],
        maxWidth: true,
        title: 'T',
        desc: 'D',
      }
    );
    w.close();
    expect(w.finish()).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" class="mermaid mermaid-er erDiagram" ' +
        'viewBox="0 0 10 20" width="100%" role="img" aria-roledescription="er" ' +
        'aria-labelledby="m1-title" aria-describedby="m1-desc" data-mermaid-version="13.0.0" ' +
        'style="max-width:10px"><title id="m1-title">T</title><desc id="m1-desc">D</desc></svg>'
    );
  });

  it('writes a fixed size without reading the id prefix', () => {
    const w = streamWriter();
    const prefix = (): string => {
      throw new Error('read');
    };
    openSvgRoot(w, ctx(prefix), {
      name: 'class',
      roleDescription: 'classDiagram',
      viewBox: [1, 2, 10, 20],
      maxWidth: false,
      attrs: { 'font-size': 16 },
    });
    w.close();
    expect(w.finish()).toContain(
      'viewBox="1 2 10 20" width="10" height="20" role="img" aria-roledescription="classDiagram" ' +
        'data-mermaid-version="13.0.0" style="" font-size="16"/>'
    );
  });
});

describe('render helpers', () => {
  it('cls keeps safe class characters', () => {
    expect(cls(['a b', '', 'c-d'])).toBe(' ab c-d');
  });

  it('paletteSlots fills by order or by slot', () => {
    const lists = {
      borderColorArray: ['#111', '#222'] as SafeColor[],
      bkgColorArray: ['#a', '#b', '#c'] as SafeColor[],
    };
    const theme = { palette: (n: keyof typeof lists) => lists[n] };
    expect(paletteSlots(theme)(2)).toEqual({ id: 'color-0', stroke: '#111', fill: '#c' });
    expect(paletteSlots(theme, 'slot')(2)).toEqual({ id: 'color-0', stroke: '#111', fill: '#a' });
  });

  it('styleCache checks each distinct list once', () => {
    const styleOf = styleCache(new Map([['k', ['fill: red']]]), () => undefined);
    expect(styleOf(['k'], [' stroke:blue '])).toBe(styleOf(['k'], ['stroke:blue']));
    expect(styleOf(['k']).shape).toMatchObject({ fill: 'red' });
  });
});
