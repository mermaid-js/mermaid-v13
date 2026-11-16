import { contrastRatio, parseColor } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { renderC4BetaForTest } from '../render/harness.ts';
import { c4TestTheme } from '../test-context.ts';

/**
 * c4-beta's own theme rows (spec #730 T2, D592): `c4<Kind>Color` (an element's text) and
 * `c4<Kind>Border` (its outline) for six kinds, the prototype's literals in light themes and
 * lightened under the dark trait; that an element, and the legend's swatch for it, draw with
 * them; and that the `c4` section's legacy palette colours nothing here.
 */
const KINDS = [
  'Person',
  'SoftwareSystem',
  'Container',
  'Component',
  'InfrastructureNode',
  'External',
] as const;

/** The light values: the prototype's (v12's #7868, whose `...Bkg` is `...Color` here), but for three text colours darkened to 4.5:1 and the component outline darkened to 3:1. */
const LIGHT = {
  Person: ['#08427b', '#073b6f'],
  SoftwareSystem: ['#1168bd', '#3c7fc0'],
  Container: ['#296eb8', '#3c7fc0'],
  Component: ['#216ec8', '#5591ce'],
  InfrastructureNode: ['#6b6b6b', '#5a5a5a'],
  External: ['#6c6c6c', '#8a8a8a'],
} as const;

/** The least contrast of a `Color` (text) on the page: WCAG 2.1 success criterion 1.4.3, level AA. */
const TEXT_CONTRAST = 4.5;
/** The least contrast of a `Border` (outline) on the page: WCAG 2.1 success criterion 1.4.11, level AA. */
const OUTLINE_CONTRAST = 3;

const LIGHT_THEMES = ['default', 'forest', 'neutral', 'base', 'redux', 'redux-color', 'neo'];
const DARK_THEMES = ['dark', 'redux-dark', 'redux-dark-color', 'neo-dark'];

const SOURCE = [
  'c4-beta',
  'legend off',
  'person p "P"',
  'softwareSystem s "S"',
  'container c "C"',
  'component k "K"',
  'infrastructureNode i "I"',
  'softwareSystem x "X" :::external',
].join('\n');

/** The `fill`, `stroke` and text colour an element `id` is drawn with. */
function drawn(svg: string, id: string) {
  const g = svg.slice(svg.indexOf(`data-id="${id}" data-ast="element:${id}"`));
  const [, stroke, fill] = /class="label-container" stroke="([^"]+)"[^>]*? fill="([^"]+)"/.exec(g)!;
  const [, text] = /class="c4-name" fill="([^"]+)"/.exec(g)!;
  return { fill, stroke, text };
}

describe('the c4-beta element rows', () => {
  it.each(LIGHT_THEMES)('are the prototype literals in %s', async (name) => {
    const theme = await c4TestTheme(name);
    for (const kind of KINDS)
      expect([theme.value(`c4${kind}Color`), theme.value(`c4${kind}Border`)], kind).toEqual(
        LIGHT[kind]
      );
  });

  it.each([...LIGHT_THEMES, ...DARK_THEMES])(
    'draw every text colour at 4.5:1 on the page in %s',
    async (name) => {
      const theme = await c4TestTheme(name);
      const page = parseColor(String(theme.value('background')))!;
      for (const kind of KINDS)
        expect(
          contrastRatio(parseColor(String(theme.value(`c4${kind}Color`)))!, page),
          kind
        ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    }
  );

  it.each([...LIGHT_THEMES, ...DARK_THEMES])(
    'draw every outline at 3:1 on the page in %s',
    async (name) => {
      const theme = await c4TestTheme(name);
      const page = parseColor(String(theme.value('background')))!;
      for (const kind of KINDS)
        expect(
          contrastRatio(parseColor(String(theme.value(`c4${kind}Border`)))!, page),
          kind
        ).toBeGreaterThanOrEqual(OUTLINE_CONTRAST);
    }
  );

  it.each(DARK_THEMES)('read on the page in %s', async (name) => {
    const theme = await c4TestTheme(name);
    const page = parseColor(String(theme.value('background')))!;
    for (const kind of KINDS) {
      const ratio = (variable: string): number =>
        contrastRatio(parseColor(String(theme.value(variable)))!, page);
      expect(ratio(`c4${kind}Color`), `${kind} text`).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      expect(ratio(`c4${kind}Border`), `${kind} outline`).toBeGreaterThanOrEqual(OUTLINE_CONTRAST);
    }
  });
});

describe('an element is an outline on the page, in its kind’s colours', () => {
  it('takes its fill from the page, its outline from `Border` and its text from `Color`', async () => {
    const { svg } = await renderC4BetaForTest(SOURCE);
    const page = 'var(--_bg)';
    expect(drawn(svg, 'p')).toEqual({ fill: page, stroke: 'var(--_c4peb)', text: 'var(--_c4pec)' });
    expect(drawn(svg, 's')).toEqual({ fill: page, stroke: 'var(--_c4ssb)', text: 'var(--_c4ssc)' });
    expect(drawn(svg, 'c')).toEqual({ fill: page, stroke: 'var(--_c4cob)', text: 'var(--_c4coc)' });
    expect(drawn(svg, 'k')).toEqual({ fill: page, stroke: 'var(--_c4cmb)', text: 'var(--_c4cmc)' });
    expect(drawn(svg, 'i')).toEqual({ fill: page, stroke: 'var(--_c4inb)', text: 'var(--_c4inc)' });
  });

  it('takes the external rows for an element tagged `external`, whatever its kind', async () => {
    const { svg } = await renderC4BetaForTest(SOURCE);
    expect(drawn(svg, 'x')).toMatchObject({ stroke: 'var(--_c4exb)', text: 'var(--_c4exc)' });
  });

  it('declares the root alias of each row it draws, with the light literal as its fallback', async () => {
    const { svg } = await renderC4BetaForTest(SOURCE);
    for (const [kind, alias] of [
      ['Person', 'c4pe'],
      ['SoftwareSystem', 'c4ss'],
      ['Container', 'c4co'],
      ['Component', 'c4cm'],
      ['InfrastructureNode', 'c4in'],
      ['External', 'c4ex'],
    ] as const) {
      const [color, border] = LIGHT[kind];
      expect(svg, kind).toContain(`--_${alias}c:var(--mermaid-c4${kind}Color,${color})`);
      expect(svg, kind).toContain(`--_${alias}b:var(--mermaid-c4${kind}Border,${border})`);
    }
  });

  it('draws the dark values under a dark theme', async () => {
    const { svg } = await renderC4BetaForTest(SOURCE, { config: { theme: 'neo-dark' } });
    expect(svg).toContain('--_c4peb:var(--mermaid-c4PersonBorder,#0a7fe5)');
    expect(svg).toContain('--_c4pec:var(--mermaid-c4PersonColor,#449ff4)');
  });
});

describe('what wins over a theme row', () => {
  it('is, in order: the theme row, a `style` for the kind, then the styles of its tags', async () => {
    const source = [
      'c4-beta',
      'legend off',
      'style person stroke:#222222',
      'style hot stroke:#333333',
      'person plain "Plain"',
      'person kind "Kind"',
      'person tagged "Tagged" :::hot',
      'container other "Other"',
    ].join('\n');
    const config = { themeVariables: { c4PersonBorder: '#111111', c4ContainerBorder: '#444444' } };
    const { svg } = await renderC4BetaForTest(source, { config });
    // The author's `themeVariables` set the row: it is the fallback of the root's alias.
    expect(svg).toContain('--_c4peb:var(--mermaid-c4PersonBorder,#111111)');
    expect(drawn(svg, 'plain').stroke).toBe('#222222');
    expect(drawn(svg, 'kind').stroke).toBe('#222222');
    expect(drawn(svg, 'tagged').stroke).toBe('#333333');
    expect(drawn(svg, 'other').stroke).toBe('var(--_c4cob)');
    expect(svg).toContain('--_c4cob:var(--mermaid-c4ContainerBorder,#444444)');
  });

  it('is not the legacy palette: `c4.<kind>_bg_color` and `_border_color` colour nothing', async () => {
    const config = {
      c4: {
        person_bg_color: '#ff0001',
        person_border_color: '#ff0002',
        system_bg_color: '#ff0003',
        container_bg_color: '#ff0004',
        external_person_bg_color: '#ff0005',
      },
    };
    const { svg, warnings } = await renderC4BetaForTest(SOURCE, { config });
    expect(svg).not.toMatch(/ff000\d/i);
    expect(drawn(svg, 'p')).toMatchObject({ fill: 'var(--_bg)', stroke: 'var(--_c4peb)' });
    expect(warnings).toEqual([]);
  });
});

describe('the legend swatch of a kind', () => {
  it('shows the colours of its elements, an infrastructure node apart from a container', async () => {
    const { svg } = await renderC4BetaForTest(
      [
        'c4-beta',
        'container c "C"',
        'infrastructureNode i "I"',
        'softwareSystem x "X" :::external',
      ].join('\n')
    );
    const legend = svg.slice(svg.indexOf('<g class="c4-legend">'));
    const swatches = [
      ...legend.matchAll(/c4-legend-swatch"[^>]*? fill="([^"]+)" stroke="([^"]+)"/g),
    ].map(([, fill, stroke]) => ({ fill, stroke }));
    expect(swatches).toEqual([
      { fill: 'var(--_bg)', stroke: 'var(--_c4cob)' },
      { fill: 'var(--_bg)', stroke: 'var(--_c4inb)' },
      { fill: 'var(--_bg)', stroke: 'var(--_c4exb)' },
    ]);
  });
});
