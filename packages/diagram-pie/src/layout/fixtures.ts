/**
 * Hand-built `PieModel` fixtures for the layout specs, written as v12 would parse the pie source
 * above each one. They stand in for parser-produced fixtures until #305 lands.
 */
import type { PieModel, PieSection } from '../model.ts';

export const section = (label: string, value: number): PieSection => ({
  label,
  value,
  astId: `slice:${label}`,
});

export const model = (
  sections: readonly (readonly [string, number])[],
  extra: Partial<PieModel> = {}
): PieModel => ({
  showData: false,
  sections: sections.map(([l, v]) => section(l, v)),
  accTitle: '',
  accDescr: '',
  warnings: [],
  ...extra,
});

export const FIXTURES: Readonly<Record<string, PieModel>> = {
  // pie
  //   "Dogs" : 386
  //   "Cats" : 85.9
  //   "Rats" : 15
  pets: model([
    ['Dogs', 386],
    ['Cats', 85.9],
    ['Rats', 15],
  ]),
  // pie showData title Key elements in Product X
  //   "Calcium" : 42.96 … "Iron" : 5
  showData: model(
    [
      ['Calcium', 42.96],
      ['Potassium', 50.05],
      ['Magnesium', 10.01],
      ['Iron', 5],
    ],
    { showData: true, title: 'Key elements in Product X' }
  ),
  // v12 pieRenderer.spec: a hidden 0.1 slice between shown ones.
  hidden: model([
    ['A', 10],
    ['B', 100],
    ['C', 0.1],
    ['D', 50],
  ]),
  // One section: the slice is the whole circle.
  single: model([['Only', 1]]),
  // pie title Empty
  empty: model([], { title: 'Empty' }),
  // Every value zero: legend rows, no slices.
  zero: model([
    ['A', 0],
    ['B', 0],
  ]),
  // More than twelve sections: the colours wrap; more rows than v12's canvas holds (D224).
  many: model(Array.from({ length: 30 }, (_, i) => [`Section ${i + 1}`, i + 1] as const)),
  // A long title and a long label: wider than v12's canvas (D224).
  wide: model(
    [
      ['A label far longer than the canvas is wide, which v12 clipped on the left', 3],
      ['B', 1],
    ],
    { title: 'A title far longer than the four hundred and fifty px canvas, centred on it' }
  ),
  // Labels through core's label layout (D225): a `<br>` breaks, an entity decodes.
  breaks: model(
    [
      ['First<br>line', 2],
      ['Tom &amp; Jerry', 1],
    ],
    { title: 'Two<br/>lines' }
  ),
};
