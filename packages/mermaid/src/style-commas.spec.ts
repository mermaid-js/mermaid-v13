// A comma inside a style value (#1312, D706): the parsers split `style` and `classDef` on every
// comma, as v12 did, and `checkStyle` joins the pieces of a function or a font list back, so
// state, class and flowchart keep the whole value, with no warning. Flowchart's style syntax
// takes no parentheses (as v12), so its fixture has only font lists.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corpusLabels } from './testing/labels.ts';

const { svgOf } = corpusLabels(readFileSync);
const fixture = (type: string) => `${type}/nightly-check/style-comma-values.mmd`;
const COLOURS = [
  'fill="rgb(255, 200, 200)"',
  'stroke="hsl(210, 60%, 40%)"',
  'stroke-width="3px"',
  'font-family="Georgia, &quot;Times New Roman&quot;, serif"',
];
const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  'state-diagram-v2': COLOURS,
  // D has fill and stroke with the same pieces (` 0`, ` 0)`), E two classDefs that share them.
  'class-diagram': [
    ...COLOURS,
    'fill="rgb(255, 0, 0)" stroke="rgb(0, 0, 0)"',
    'fill="rgb(255, 0, 0)" stroke="rgb(10, 0, 0)"',
  ],
  flowchart: [
    'fill="#fcc"',
    'font-family="Georgia, Times New Roman, serif"',
    'font-family="Courier New, monospace"',
  ],
};

describe('a comma inside a style value (#1312, D706)', () => {
  it.each(Object.entries(EXPECTED))('%s keeps each value whole', async (type, attrs) => {
    const { svg, warnings } = await svgOf(fixture(type));
    expect(warnings.filter((w) => w.code.startsWith('STYLE_'))).toEqual([]);
    for (const a of attrs) expect(svg).toContain(a);
  });
});
