// cspell:ignore Stam Naruto Uzumaki Sasuke
/**
 * Hand-built `RadarModel` fixtures for the layout specs, written as v12 would parse the radar
 * source above each one: the edge cases the specs work by hand. The parser-produced corpus is
 * `packages/conformance/src/radar/layout-corpus.spec.ts`'s, which runs `radarLayoutViolations`
 * over every parsed gate source.
 */
import type { RadarAxis, RadarCurve, RadarModel, RadarOptions } from '../model.ts';

export const axis = (name: string, label = name): RadarAxis => ({
  name,
  label,
  astId: `axis:${name}`,
});

/** A curve with positional entries. */
export const curve = (name: string, values: readonly number[], label = name): RadarCurve => ({
  name,
  label,
  entries: values.map((value, k) => ({ value, astId: `curve:${name}#${k}` })),
  astId: `curve:${name}`,
});

const OPTIONS: RadarOptions = {
  showLegend: true,
  ticks: 5,
  max: null,
  min: 0,
  graticule: 'circle',
};

export const model = (
  axes: readonly RadarAxis[],
  curves: readonly RadarCurve[],
  options: Partial<RadarOptions> = {},
  extra: Partial<RadarModel> = {}
): RadarModel => ({
  axes,
  curves,
  options: { ...OPTIONS, ...options },
  accTitle: '',
  accDescr: '',
  warnings: [],
  ...extra,
});

const abc = ['A', 'B', 'C'].map((n) => axis(n));

export const FIXTURES: Readonly<Record<string, RadarModel>> = {
  // radar-beta
  //   title Best Radar Ever
  //   axis A, B, C
  //   curve c1{1, 2, 3}
  simple: model(abc, [curve('c1', [1, 2, 3])], {}, { title: 'Best Radar Ever' }),
  // … curve c1{1, 2, 3}
  //   curve c2{2, 3, 1}
  multiple: model(abc, [curve('c1', [1, 2, 3]), curve('c2', [2, 3, 1])], {}, {}),
  // complex-radar-diagram.mmd: five axes, three curves, ticks 3, max 8, polygon.
  ninjas: model(
    [
      axis('Agility'),
      axis('Speed'),
      axis('Strength'),
      axis('Stam', 'Stamina'),
      axis('Intel', 'Intelligence'),
    ],
    [
      curve('Ninja1', [2, 2, 3, 5, 0], 'Naruto Uzumaki'),
      curve('Ninja2', [2, 3, 4, 1, 5], 'Sasuke'),
      curve('Ninja3', [3, 2, 1, 5, 4]),
    ],
    { ticks: 3, max: 8, min: 0, graticule: 'polygon' },
    { title: 'My favorite ninjas' }
  ),
  // knsv2-03-radar.mmd: six axes, max 100, the front-matter title "Grades".
  grades: model(
    [
      axis('m', 'Math'),
      axis('s', 'Science'),
      axis('e', 'English'),
      axis('h', 'History'),
      axis('g', 'Geography'),
      axis('a', 'Art'),
    ],
    [curve('a', [85, 90, 80, 70, 75, 90], 'Alice'), curve('b', [70, 75, 85, 80, 90, 85], 'Bob')],
    { max: 100 },
    { title: 'Grades' }
  ),
  // A curve with too few entries between two drawn ones: skipped, keeps its index (D356).
  skipped: model(abc, [curve('c1', [1, 2, 3]), curve('c2', [1, 2]), curve('c3', [3, 2, 1])]),
  // max 2, min 2: an empty range draws at the centre (D356).
  emptyRange: model(abc, [curve('c1', [1, 2, 3])], { max: 2, min: 2 }),
  // max 1 min 5: v12's formula puts every point on the radius.
  inverted: model(abc, [curve('c1', [1, 3, 9])], { max: 1, min: 5 }),
  // Values past max and under min clamp to the radius and the centre.
  clamped: model(abc, [curve('c1', [0, 50, 200])], { max: 100, min: 10 }),
  // Thirteen curves: slot 12 is slot 0 again (D353); the legend runs past the canvas (D354).
  many: model(
    abc,
    Array.from({ length: 13 }, (_, i) => curve(`c${i}`, [i, i + 1, i + 2]))
  ),
  // ticks 0, 1.5 and 32, both graticules.
  noTicks: model(abc, [curve('c1', [1, 2, 3])], { ticks: 0 }),
  halfTicks: model(abc, [curve('c1', [1, 2, 3])], { ticks: 1.5 }),
  maxTicks: model(abc, [curve('c1', [1, 2, 3])], { ticks: 32, graticule: 'polygon' }),
  // No axes and no curves: nothing to scale; a polygon graticule draws no ring.
  empty: model([], [], { graticule: 'polygon' }),
  // Axes only.
  axesOnly: model(abc, []),
  // One and two axes: degenerate polygons, still on their spokes.
  one: model([axis('A')], [curve('c1', [1])]),
  two: model([axis('A'), axis('B')], [curve('c1', [1, 2])], { graticule: 'polygon' }),
  // #846: eight axes and two curves; "Axis label 1" at 45° grows right into legend row 1 at
  // v12's position, so the legend moves right of it (D614).
  legendOnLabel: model(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => axis(n, n === 'b' ? 'Axis label 1' : n)),
    [curve('x', [1, 2, 3, 4, 5, 1, 2, 3]), curve('y', [2, 3, 4, 5, 1, 2, 3, 4])]
  ),
  // showLegend false: no rows.
  noLegend: model(abc, [curve('c1', [1, 2, 3])], { showLegend: false }),
  // Long labels and title, wider than the 50 px margins (D354); labels through core label
  // layout: a `<br>` breaks (D355).
  wide: model(
    [
      axis('A', 'An axis label far wider than the fifty px margin'),
      axis('B', 'Two<br>lines'),
      axis('C', 'Third'),
      axis('D', 'Fourth<br>label<br>here'),
    ],
    [
      curve(
        'c1',
        [1, 2, 3, 4],
        'A legend label far wider than the right margin, which v12 clipped'
      ),
    ],
    {},
    { title: 'A title far longer than the six hundred px wide canvas that v12 drew it on, centred' }
  ),
  // A 309-digit entry parses to Infinity (D356: never NaN): without `max` the range is
  // [0, Infinity], so it lands on the radius and every finite value at the centre…
  infinite: model(abc, [curve('c1', [1, Infinity, 3]), curve('c2', [Infinity, 2, 1])]),
  // …and with `max` it clamps to the radius.
  infiniteMax: model(abc, [curve('c1', [1, Infinity, 3])], { max: 4 }),
  // A 309-digit `max` and `min`: an empty range at Infinity draws at the centre.
  infiniteRange: model(abc, [curve('c1', [1, 2, 3])], { max: Infinity, min: Infinity }),
  // Huge values: no overflow.
  huge: model(abc, [curve('c1', [1e308, 1.5e308, 1.7e308])]),
};
