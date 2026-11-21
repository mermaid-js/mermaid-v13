import type { Warning } from '@mermaid-js/core';
import { describe, expect, it } from 'vitest';
import { C4_COLOR_INVALID } from '../codes.ts';
import { renderC4BetaForTest } from '../render/harness.ts';
import { c4TestConfig, c4TestContext, c4TestTheme } from '../test-context.ts';
import { layoutC4Beta } from './layout.ts';
import { betaPaints } from './paint.ts';
import { parseC4Beta } from './parser.ts';

/**
 * What `style` paints in c4-beta (spec #730): the colours of an element, a boundary and a relation
 * a style targets, which statement wins, and that a refused colour is dropped with a warning. The
 * legend's swatches are in `legend.spec.ts`; that a swatch and its element agree over every fixture
 * is in `packages/conformance`.
 */
const PAGE = 'var(--_bg)';
const PERSON = { fill: PAGE, stroke: 'var(--_c4peb)' };
const CONTAINER = { fill: PAGE, stroke: 'var(--_c4cob)' };
const PERSON_TEXT = 'var(--_c4pec)';
const CONTAINER_TEXT = 'var(--_c4coc)';

/** The part of `svg` from the group `marker` opens. */
const from = (svg: string, marker: string): string => svg.slice(svg.indexOf(marker));

/** An element's body colours and its name's text colour. */
function element(svg: string, id: string) {
  const g = from(svg, `data-id="${id}" data-ast="element:${id}"`);
  const [, stroke, fill] = /class="label-container" stroke="([^"]+)"[^>]*? fill="([^"]+)"/.exec(g)!;
  const [, text] = /class="c4-name" fill="([^"]+)"/.exec(g)!;
  return { fill, stroke, text };
}

/** A boundary's frame colours and its label's text colour. */
function boundary(svg: string, id: string) {
  const g = from(svg, `<g class="c4-boundary" data-id="${id}"`);
  const [, fill, stroke] = /<rect[^>]*? fill="([^"]+)" stroke="([^"]+)"/.exec(g)!;
  const [, text] = /class="c4-boundary-label"[^>]*? fill="([^"]+)"/.exec(g)!;
  return { fill, stroke, text };
}

/** A relation's line, dash, arrowhead and label colours. */
function relation(svg: string, id: string) {
  const g = from(svg, `<g class="c4-relation" data-id="${id.replace('>', '&gt;')}"`);
  const line = /<path class="c4-rel[^"]*"[^>]*>/.exec(g)![0];
  return {
    stroke: /stroke="([^"]+)"/.exec(line)![1],
    dash: /stroke-dasharray="([^"]+)"/.exec(line)?.[1],
    head: /<path class="marker"[^>]*? fill="([^"]+)"/.exec(g)![1],
    text: /<g class="edgeLabel"[^>]*><rect[^>]*><text[^>]*? fill="([^"]+)"/.exec(g)![1],
    border: /<g class="edgeLabel"[^>]*><rect[^>]*? stroke="([^"]+)"/.exec(g)![1],
  };
}

const render = async (...lines: string[]) =>
  (await renderC4BetaForTest(['c4-beta', 'legend off', ...lines].join('\n'))).svg;

describe('what a style paints on an element', () => {
  it('paints the fill, the outline and the text of every element carrying the tag', async () => {
    const svg = await render(
      'style hot fill:#b91c1c, stroke:#7f1d1d, color:#fefefe',
      'person a "A" :::hot',
      'container b "B" :::hot',
      'container c "C"'
    );
    const hot = { fill: '#b91c1c', stroke: '#7f1d1d', text: '#fefefe' };
    expect(element(svg, 'a')).toEqual(hot);
    expect(element(svg, 'b')).toEqual(hot);
    expect(element(svg, 'c')).toEqual({ ...CONTAINER, text: CONTAINER_TEXT });
  });

  it('draws the outline in the fill when the style gives only a fill, and keeps the fill for only a stroke', async () => {
    const svg = await render(
      'style a fill:#112233',
      'style b stroke:#445566',
      'person x "X" :::a',
      'person y "Y" :::b'
    );
    expect(element(svg, 'x')).toEqual({ fill: '#112233', stroke: '#112233', text: PAGE });
    expect(element(svg, 'y')).toEqual({ fill: PAGE, stroke: '#445566', text: PERSON_TEXT });
  });

  it('paints a kind, and a tag over it', async () => {
    const svg = await render(
      'style container fill:#0b5cab, stroke:#0a4d91',
      'style hot fill:#b91c1c',
      'container a "A"',
      'container b "B" :::hot',
      'person p "P"'
    );
    expect(element(svg, 'a')).toMatchObject({ fill: '#0b5cab', stroke: '#0a4d91' });
    expect(element(svg, 'b')).toMatchObject({ fill: '#b91c1c', stroke: '#0a4d91' });
    expect(element(svg, 'p')).toMatchObject(PERSON);
  });

  it('lets the last tag of an element win each key, whatever the order of the statements', async () => {
    const svg = await render(
      'style b fill:#0000ff',
      'style a fill:#ff0000, stroke:#00ff00',
      'person p "P" :::a :::b',
      'person q "Q" :::b :::a'
    );
    expect(element(svg, 'p')).toMatchObject({ fill: '#0000ff', stroke: '#00ff00' });
    expect(element(svg, 'q')).toMatchObject({ fill: '#ff0000', stroke: '#00ff00' });
  });

  it('lets a later statement for one tag replace an earlier key and keep the rest', async () => {
    const svg = await render(
      'style t fill:#111111, stroke:#222222',
      'style t fill:#333333',
      'person p "P" :::t'
    );
    expect(element(svg, 'p')).toMatchObject({ fill: '#333333', stroke: '#222222' });
  });

  it('leaves an element a style does not target, and a style that names no colour, as drawn', async () => {
    const svg = await render(
      'style odd shape:cylinder',
      'style gone fill:#111111',
      'person p "P" :::odd'
    );
    expect(element(svg, 'p')).toEqual({ ...PERSON, text: PERSON_TEXT });
  });

  it('paints the tag `external` over the external palette', async () => {
    const svg = await render('style external fill:#123456', 'softwareSystem e "E" :::external');
    expect(element(svg, 'e')).toMatchObject({ fill: '#123456', stroke: '#123456' });
  });
});

describe('the legend row of a styled kind', () => {
  it('takes the kind style, as the elements of that kind do', async () => {
    const r = await renderC4BetaForTest(
      [
        'c4-beta',
        'style container fill:#0b5cab, stroke:#0a4d91',
        'person p "P"',
        'container a "A"',
      ].join('\n')
    );
    const legend = from(r.svg, '<g class="c4-legend">');
    const swatches = [
      ...legend.matchAll(/c4-legend-swatch"[^>]*? fill="([^"]+)" stroke="([^"]+)"/g),
    ];
    expect(swatches.map(([, fill, stroke]) => ({ fill, stroke }))).toEqual([
      PERSON,
      { fill: '#0b5cab', stroke: '#0a4d91' },
    ]);
    expect(element(r.svg, 'a')).toMatchObject({ fill: '#0b5cab', stroke: '#0a4d91' });
  });
});

describe('what a style paints on a boundary', () => {
  it('paints the frame, its fill and its header', async () => {
    const svg = await render(
      'style zone fill:#fef3c7, stroke:#b45309, color:#78350f',
      'softwareSystem s "S" :::zone {',
      '  container c "C"',
      '}'
    );
    expect(boundary(svg, 's')).toEqual({ fill: '#fef3c7', stroke: '#b45309', text: '#78350f' });
  });
});

describe('what a style paints on a relation', () => {
  const links = ['person a "A"', 'container b "B"', 'container c "C"'];

  it('paints the line and the arrowhead with the stroke and the label with the colour', async () => {
    const svg = await render(
      'style slow stroke:#0a7a3d, color:#14532d',
      ...links,
      'a --> b : "Calls" "HTTPS" :::slow',
      'b --> c : "Plain" "HTTPS"'
    );
    expect(relation(svg, 'a->b')).toEqual({
      stroke: '#0a7a3d',
      dash: undefined,
      head: '#0a7a3d',
      text: '#14532d',
      border: '#0a7a3d',
    });
    const plain = relation(svg, 'b->c');
    expect(plain.stroke).not.toBe('#0a7a3d');
    expect(plain.text).toBe(plain.stroke);
    expect(plain.border).toBe(plain.stroke);
  });

  it('dashes the line for `line`: 3 for dashed, 2 for dotted, none for solid', async () => {
    const svg = await render(
      'style d line:dashed',
      'style o line:dotted',
      'style s line:solid',
      ...links,
      'a --> b : "D" :::d',
      'a --> c : "O" :::o',
      'b --> c : "S" :::s'
    );
    expect(relation(svg, 'a->b').dash).toBe('3');
    expect(relation(svg, 'a->c').dash).toBe('2');
    // The label's border takes the line's colour, never its dashes (D627).
    expect(svg).not.toMatch(/<g class="edgeLabel"[^>]*><rect[^>]*stroke-dasharray/);
    expect(relation(svg, 'b->c').dash).toBeUndefined();
  });

  it('takes the last tag for each key, as an element does', async () => {
    const svg = await render(
      'style a stroke:#111111, line:dashed',
      'style b stroke:#222222',
      ...links,
      'a --> b : "X" :::a :::b'
    );
    expect(relation(svg, 'a->b')).toMatchObject({ stroke: '#222222', dash: '3' });
  });
});

describe('the theme colours a render reads', () => {
  it('has none for a boundary or a relation the diagram does not draw', async () => {
    const svg = await render('style hot fill:#b91c1c', 'person p "P" :::hot');
    expect(svg).not.toContain('c4BoundaryColor');
    expect(svg).not.toContain('c4RelationColor');
  });
});

describe('a colour the check refuses', () => {
  /** The paints of a model whose style `hot` carries `fill`, a value the grammar would not let through. */
  async function paintedWith(fill: string) {
    const theme = await c4TestTheme('default');
    const warnings: Warning[] = [];
    const ctx = c4TestContext(c4TestConfig(), theme, warnings);
    const parsed = parseC4Beta('c4-beta\nstyle hot fill:#112233\nperson p "P" :::hot').model;
    const model = {
      ...parsed,
      styles: parsed.styles.map((s) => ({ ...s, entries: [{ key: 'fill', value: fill }] })),
    };
    const paints = betaPaints(model, layoutC4Beta(model, ctx), {
      ...ctx,
      idPrefix: '',
      version: '13.0.0-test',
      warn: (w) => void warnings.push(w),
    });
    return { paints, warnings };
  }

  it('is dropped with one C4_COLOR_INVALID, and the kind palette is drawn', async () => {
    const { paints, warnings } = await paintedWith('url(#x)');
    expect(paints.elements.get(0)).toMatchObject(PERSON);
    expect(warnings.map((w) => w.code)).toEqual([C4_COLOR_INVALID]);
    expect(warnings[0]?.message).toContain('`fill:url(#x)` in `style hot` at line 2');
  });
});
