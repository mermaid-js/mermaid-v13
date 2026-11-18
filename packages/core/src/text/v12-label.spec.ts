import { describe, expect, it } from 'vitest';
import { Style, layoutLabel, tableMeasurer, type FontKey } from './index.ts';
import { v12Label } from './v12-label.ts';

const arial: FontKey = { family: 'Arial', size: 10, weight: 400 };
/** The runs of a v12 Markdown label as `layoutLabel` lays it out, as `[text, style]` per line. */
const runs = (text: string): [string, number][][] =>
  layoutLabel(...withMeasure(text)).lines.map((line) =>
    line.map((r): [string, number] => [r.text, r.style])
  );
const withMeasure = (text: string): Parameters<typeof layoutLabel> => {
  const [shown, mode] = v12Label(text);
  return [shown, arial, Infinity, tableMeasurer, mode];
};
const B = Style.Bold;
const I = Style.Italic;

describe('v12Label', () => {
  it('reads emphasis in a label without a code span', () => {
    expect(v12Label('**a** and *b*')[1].markup).toBe('emphasis');
    expect(runs('**a** and *b*')).toEqual([
      [
        ['a', B],
        [' and ', 0],
        ['b', I],
      ],
    ]);
  });

  it('reads emphasis next to a code span and keeps the span as written (#836)', () => {
    expect(v12Label('**a** `b`')[1].markup).toBe('emphasis');
    expect(runs('**a** `b`')).toEqual([
      [
        ['a', B],
        [' `b`', 0],
      ],
    ]);
    expect(runs('**bold** and `code`')).toEqual([
      [
        ['bold', B],
        [' and `code`', 0],
      ],
    ]);
  });

  it('keeps emphasis markers inside a code span as written', () => {
    expect(runs('`**x**`')).toEqual([[['`**x**`', 0]]]);
    expect(runs('`*x*` and `__y__`')).toEqual([[['`*x*` and `__y__`', 0]]]);
    expect(runs('`_x_` **b**')).toEqual([
      [
        ['`_x_` ', 0],
        ['b', B],
      ],
    ]);
  });

  it('does not close emphasis with a marker inside a code span', () => {
    // The `**` inside the span is text, so the outer `**` pair spans it.
    expect(runs('**a `x**` b**')).toEqual([[['a `x**` b', B]]]);
    // A lone `**` before a span whose `**` would have closed it stays as written.
    expect(runs('**a `b**`')).toEqual([[['**a `b**`', 0]]]);
  });

  it('reads every code span in the label', () => {
    expect(runs('`*a*` *b* `_c_` _d_')).toEqual([
      [
        ['`*a*` ', 0],
        ['b', I],
        [' `_c_` ', 0],
        ['d', I],
      ],
    ]);
  });

  it('reads a span of two backticks, with a single backtick inside it, as one span', () => {
    expect(runs('``a ` **b**`` **c**')).toEqual([
      [
        ['``a ` **b**`` ', 0],
        ['c', B],
      ],
    ]);
  });

  it('reads an unclosed backtick as text, so emphasis after it is read', () => {
    expect(runs('`a **b**')).toEqual([
      [
        ['`a ', 0],
        ['b', B],
      ],
    ]);
    expect(runs('**a** ``b`')).toEqual([
      [
        ['a', B],
        [' ``b`', 0],
      ],
    ]);
  });

  it('decodes character references a code span already holds, as before', () => {
    expect(runs('`a &amp; &#42;b&#42;` **c**')).toEqual([
      [
        ['`a & *b*` ', 0],
        ['c', B],
      ],
    ]);
  });

  it('never shows the character references it adds', () => {
    const [shown] = v12Label('`**x** _y_`');
    expect(shown).not.toMatch(/[*_]/);
    const label = layoutLabel(shown, arial, Infinity, tableMeasurer, v12Label('`**x** _y_`')[1]);
    const text = label.lines.map((l) => l.map((r) => r.text).join('')).join('\n');
    expect(text).toBe('`**x** _y_`');
    expect(text).not.toContain('&#');
    // Measured as the characters drawn, not as the references.
    expect(label.width).toBeCloseTo(tableMeasurer.width('`**x** _y_`', arial, 0), 9);
  });

  it('leaves an underscore inside a word and a math span in a code span as written', () => {
    // An underscore between word characters is never an emphasis marker; icons (`fa:fa-a_b`)
    // and math (`$$x_1$$`) are found in the text before emphasis is read.
    expect(v12Label('`fa:fa-a_b` **c**')[0]).toBe('`fa:fa-a_b` **c**');
    expect(v12Label('`$$x_1 * y$$` **c**')[0]).toBe('`$$x_1 * y$$` **c**');
  });

  it('keeps a label that starts with a list marker plain', () => {
    expect(v12Label('- item **b**')[1].markup).toBe('plain');
    expect(v12Label('* item `c` **b**')[1].markup).toBe('plain');
    expect(v12Label('+ item')[1].markup).toBe('plain');
    expect(runs('- item **b**')).toEqual([[['- item **b**', 0]]]);
  });

  it('drops blank lines between written lines and breaks at the end', () => {
    expect(v12Label('a\n\nb<br>')[0]).toBe('a\nb');
  });
});
