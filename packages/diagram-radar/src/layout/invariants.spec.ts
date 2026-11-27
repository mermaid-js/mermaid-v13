import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { RadarModel } from '../model.ts';
import { radar as plugin } from '../plugin.ts';
import { FIXTURES } from './fixtures.ts';
import { layoutRadar, type RadarLayout } from './index.ts';
import { radarLayoutViolations } from './invariants.ts';

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

const lay = (m: RadarModel, radar: Record<string, unknown> = {}): RadarLayout =>
  layoutRadar(m, {
    config: { radar } as unknown as ResolvedConfig,
    measurer: tableMeasurer,
    theme: createTheme(spec, { diagram: plugin.theme }),
  });

const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { marginTop: 100, axisScaleFactor: 0.5 },
  { width: 300, height: 800, marginLeft: 0, marginRight: 0, axisLabelFactor: 1.5 },
  { axisScaleFactor: 2, curveTension: 1, marginBottom: 0 },
];
const GRATICULES = ['circle', 'polygon'] as const;

describe('radar layout invariants (R-LAYOUT-3)', () => {
  for (const [name, m] of Object.entries(FIXTURES))
    for (const graticule of GRATICULES)
      it.each(CONFIGS)(`${name}, ${graticule}: %o`, (radar) => {
        const g = { ...m, options: { ...m.options, graticule } };
        expect(radarLayoutViolations(g, lay(g, radar))).toEqual([]);
      });
});

describe('radarLayoutViolations catches', () => {
  const m = FIXTURES.grades!;
  const ok = (): RadarLayout => lay(m);
  const broken = (f: (l: RadarLayout) => RadarLayout): string[] =>
    radarLayoutViolations(m, f(ok()));

  it('a NaN anywhere', () => {
    expect(broken((l) => ({ ...l, radius: Number.NaN }))).toContain('layout.radius is NaN');
  });

  it('a spoke off its angle', () => {
    const v = broken((l) => ({
      ...l,
      spokes: l.spokes.map((s, i) => (i === 1 ? { ...s, angle: 0 } : s)),
    }));
    expect(v.some((x) => x.startsWith('spoke 1'))).toBe(true);
  });

  it('a curve point off its spoke or past the radius', () => {
    const off = broken((l) => ({
      ...l,
      curves: l.curves.map((c) => ({ ...c, points: [...c.points.slice(1), c.points[0]!] })),
    }));
    expect(off.some((x) => x.includes('curve 0, point 0'))).toBe(true);
    const past = broken((l) => ({ ...l, radius: l.radius / 2 }));
    expect(past.some((x) => x.includes('past the radius'))).toBe(true);
  });

  it('a ring at the wrong radius', () => {
    const v = broken((l) => ({
      ...l,
      rings: l.rings.map((r) => ({ ...r, radius: r.radius + 1 })),
    }));
    expect(v.some((x) => x.startsWith('ring 1'))).toBe(true);
  });

  it('legend rows not 20 apart, a wrong slot, input order lost', () => {
    const v = broken((l) => ({
      ...l,
      legend: [...l.legend].reverse(),
      curves: l.curves.map((c) => ({ ...c, slot: c.slot + 1 })),
    }));
    expect(v).toEqual(
      expect.arrayContaining([
        'legend row 0 is curve 1',
        'curve 0 has slot 1',
        expect.stringContaining('legend rows 0 and 1'),
      ])
    );
  });

  it('a legend row on an axis label (D614)', () => {
    const v = broken((l) => {
      const { x, y } = l.spokes[0]!.label;
      return {
        ...l,
        legend: l.legend.map((r) =>
          r.index === 1
            ? { ...r, swatch: { ...r.swatch, x, y }, label: { ...r.label, x: x + 16, y } }
            : r
        ),
      };
    });
    expect(v).toContain("legend row 1 meets spoke 0's label");
  });

  it('a title on an axis label (#1257, D739)', () => {
    const v = broken((l) => {
      const { y } = l.spokes[0]!.label;
      return { ...l, title: { ...l.title!, y: y - 1 } };
    });
    expect(v).toContain("the title meets spoke 0's label");
  });

  it('a skipped curve drawn, and contents outside the bounds', () => {
    const v = broken((l) => ({
      ...l,
      curves: [],
      bounds: { ...l.bounds, width: l.bounds.width / 2 },
    }));
    expect(v).toEqual(
      expect.arrayContaining([
        'drawn curves  for drawable curves 0,1',
        expect.stringContaining('outside the bounds'),
      ])
    );
  });
});
