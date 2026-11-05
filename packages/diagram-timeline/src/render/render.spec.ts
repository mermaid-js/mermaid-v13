import { beforeAll, describe, expect, it } from 'vitest';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import * as fx from '../layout/fixtures.ts';
import type { TimelineModel } from '../model.ts';
import { renderViolations } from './properties.fixtures.ts';
import { renderForTest, type RenderedForTest } from './testing.fixtures.ts';

/**
 * Render properties of the timeline renderer (spec #291 T4) over the hand-built fixtures, both
 * directions, every theme and `theme: 'auto'`, and config away from its defaults. The same
 * properties and the AST round-trip run over the parsed corpus in
 * `packages/conformance/src/timeline/render.spec.ts` (the package reads no files).
 */
const MODELS: readonly (readonly [string, TimelineModel])[] = Object.entries(fx.FIXTURES).flatMap(
  ([name, m]) => [
    [`${name} ${m.direction}`, m] as const,
    [`${name} ${fx.turned(m).direction}`, fx.turned(m)] as const,
  ]
);

const CONFIGS: readonly (readonly [string, Record<string, unknown>])[] = [
  ...[...THEME_NAMES, 'auto'].map((theme) => [theme, { theme }] as const),
  [
    'options changed',
    {
      theme: 'base',
      timeline: { leftMargin: 10, padding: 0, disableMulticolor: true, useMaxWidth: false },
      themeVariables: { cScale0: '#ff0000', cScaleLabel1: '#00ff00', fontSize: '30px' },
    },
  ],
  ['redux, gradient on', { theme: 'redux-color', themeVariables: { useGradient: true } }],
  // Every fallback colour is declared on the root, also when a palette is emptied.
  ['empty cScale lists', { theme: 'default', themeVariables: { cScale: [], cScaleLabel: [] } }],
  ['empty border palette', { theme: 'redux-color', themeVariables: { borderColorArray: [] } }],
];

interface Case {
  readonly id: string;
  readonly model: TimelineModel;
  readonly config: Record<string, unknown>;
  readonly r: RenderedForTest;
}

const cases: Case[] = [];
beforeAll(async () => {
  for (const [cname, config] of CONFIGS)
    for (const [mname, model] of MODELS)
      cases.push({
        id: `${mname}, ${cname}`,
        model,
        config,
        r: await renderForTest(model, { config }),
      });
}, 120_000);

describe('timeline render properties', () => {
  it('renders every fixture in every configuration', () => {
    expect(cases.length).toBe(MODELS.length * CONFIGS.length);
  });

  it('holds well-formed, inert, no NaN, ids, bounding box, data-ast and declared aliases', () => {
    for (const c of cases) expect(renderViolations(c.r, c.model), c.id).toEqual([]);
  });

  it('is deterministic: rendering again writes the same bytes (R-ARCH-6)', async () => {
    for (const c of cases)
      expect((await renderForTest(c.model, { config: c.config })).svg, c.id).toBe(c.r.svg);
  });
});

describe('renderViolations', () => {
  it('catches each broken property', async () => {
    const good = await renderForTest(fx.sections, { config: { theme: 'redux' } });
    const broken = (svg: string) => renderViolations({ ...good, svg }, fx.sections);
    expect(broken(good.svg.replace('</svg>', ''))[0]).toMatch(/^not well-formed/);
    expect(broken(good.svg.replace('x1="', 'x1="NaN" y0="'))).toContain('writes NaN');
    expect(
      broken(good.svg.replace('<g class="taskWrapper"', '<g id="x" class="taskWrapper"'))
    ).toContain('writes the id x');
    expect(
      broken(
        good.svg
          .replace('data-ast="ev:1.1"', 'data-ast="ev:1.1" data-x="1"')
          .replace('<text data-id="ev:1.1"', '<text data-ast="ev:1.1" data-id="ev:1.1"')
      )
    ).toContain('ev:1.1 has 2 data-ast elements');
    expect(broken(good.svg.replace(' data-ast="per:2"', ''))).toContain(
      'per:2 has 0 data-ast elements'
    );
    const far = good.svg.replace(/<line x1="[\d.]+"/, '<line x1="99999"');
    expect(broken(far).some((v) => v.includes('outside the viewBox'))).toBe(true);
    expect(broken(good.svg.replace('stroke="var(--_nb)"', 'stroke="var(--_zz)"'))).toContain(
      'refers to --_zz, which the root does not declare'
    );
    expect(
      broken(good.svg.replace('<g class', '<script/><g class')).some((v) =>
        v.startsWith('not inert')
      )
    ).toBe(true);
  });
});

describe('timeline render cost', () => {
  // Pitfall 19: one lookup per box. TD draws one connector per event; with every event under
  // one period, a scan of the period's connectors per event was quadratic. The spec counts the
  // renderer's reads of connector fields, which is exact where a timing ratio is noisy.
  const stack = (n: number) =>
    fx.turned(fx.timeline([['2000', ...Array.from({ length: n }, (_, i) => `e${i}`)]]));
  const reads = async (n: number) => {
    let count = 0;
    const r = await renderForTest(stack(n), {
      config: { theme: 'default' },
      mapLayout: (l) => ({
        ...l,
        connectors: l.connectors.map(
          (c) =>
            new Proxy(c, {
              get(target, key, receiver) {
                count++;
                return Reflect.get(target, key, receiver) as unknown;
              },
            })
        ),
      }),
    });
    return { count, svg: r.svg };
  };

  it('renders 5,000 events under one TD period, reading each connector a fixed number of times', async () => {
    const big = await reads(5000);
    expect(big.svg.match(/class="eventWrapper"/g)).toHaveLength(5000);
    expect(big.svg.match(/class="arrowhead"/g)).toHaveLength(5001);
    const small = await reads(2500);
    // Twice the events, twice the reads; the scan read about 5000² more.
    expect(big.count / small.count).toBeCloseTo(2, 1);
    expect(big.count / 5000).toBeLessThan(40);
  }, 60_000);
});
