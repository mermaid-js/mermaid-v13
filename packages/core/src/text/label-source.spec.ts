import { describe, expect, it } from 'vitest';
import { Style, labelSource, layoutLabel, tableMeasurer, type FontKey } from './index.ts';
import type { LabelSourceOptions } from './label-source.ts';

const arial: FontKey = { family: 'Arial', size: 10, weight: 400 };
const B = Style.Bold;

/** A label as written, read by the handler and laid out: `[text, style]` per run, per line. */
const runs = (label: string, options?: LabelSourceOptions): [string, number][][] => {
  const source = labelSource(label, options);
  return layoutLabel(source.text, arial, Infinity, tableMeasurer, source).lines.map((line) =>
    line.map((r): [string, number] => [r.text, r.style])
  );
};

describe('labelSource, default mode (D734)', () => {
  it('reads a quoted markdown string as markdown, without its wrapper', () => {
    expect(labelSource('"`**b**`"')).toMatchObject({ text: '**b**', markup: 'markdown' });
    expect(labelSource('  "`**b**`" ')).toMatchObject({ text: '**b**', markup: 'markdown' });
    expect(runs('"`**b**`"')).toEqual([[['b', B]]]);
  });

  it('draws bare backticks as written: they are no markdown string (D733)', () => {
    expect(labelSource('`**b**`')).toMatchObject({ text: '`**b**`', markup: 'plain' });
    expect(runs('`**b**`')).toEqual([[['`**b**`', 0]]]);
  });

  it('keeps a quoted label with a backtick inside the outer pair plain (D710)', () => {
    expect(labelSource('"`a `b` c`"')).toMatchObject({ markup: 'plain' });
  });

  it('reads a label a parser already found to be a markdown string as markdown', () => {
    expect(labelSource('**b**', { markdown: true })).toMatchObject({
      text: '**b**',
      markup: 'markdown',
    });
    expect(runs('**b**', { markdown: true })).toEqual([[['b', B]]]);
  });

  it('reads any other label as plain: tags draw, entities decode, markdown stays text', () => {
    expect(labelSource('**b** _i_')).toMatchObject({ text: '**b** _i_', markup: 'plain' });
    expect(runs('**b** _i_')).toEqual([[['**b** _i_', 0]]]);
    expect(runs('<b>x</b> &lt;y&gt;')).toEqual([
      [
        ['x', B],
        [' <y>', 0],
      ],
    ]);
  });

  it('ignores the label kind’s v12 profile', () => {
    expect(labelSource('**b**', { v12Markdown: true })).toEqual(labelSource('**b**'));
  });

  describe('line breaks', () => {
    it('drops blank lines between written lines', () => {
      expect(runs('a\n\nb')).toEqual([[['a', 0]], [['b', 0]]]);
      expect(runs('a\n  \n\nb')).toEqual([[['a', 0]], [['b', 0]]]);
      expect(runs('"`a\n\nb`"')).toEqual([[['a', 0]], [['b', 0]]]);
    });

    it('drops the breaks at the end', () => {
      expect(runs('a<br>')).toEqual([[['a', 0]]]);
      expect(runs('a<br/>  ')).toEqual([[['a', 0]]]);
      expect(runs('a<br> <BR />\n')).toEqual([[['a', 0]]]);
      expect(runs('a\\n')).toEqual([[['a', 0]]]);
    });

    it('breaks at a written \\n in a plain label', () => {
      expect(runs('a\\nb')).toEqual([[['a', 0]], [['b', 0]]]);
      expect(runs('a\\Nb')).toEqual([[['a', 0]], [['b', 0]]]);
      expect(runs('C:\\new\\path')).toEqual([[['C:', 0]], [['ew\\path', 0]]]);
    });

    it('breaks at a written \\n in a markdown string', () => {
      expect(runs('"`**a**\\nb`"')).toEqual([[['a', B]], [['b', 0]]]);
      expect(runs('**a**\\nb', { markdown: true })).toEqual([[['a', B]], [['b', 0]]]);
    });

    it('breaks at a written \\n as at <br>', () => {
      expect(runs('a\\nb')).toEqual(runs('a<br>b'));
      expect(runs('a\\n\\nb')).toEqual(runs('a<br><br>b'));
    });

    it('keeps a \\n in math, which inline spans read', () => {
      expect(labelSource('$$\\det A \\neq 0$$').text).toBe('$$\\det A \\neq 0$$');
      expect(labelSource('x\\n$$\\neq$$').text).toBe('x<br>$$\\neq$$');
      expect(runs('$$\\neq$$')).toEqual([[['$$\\neq$$', 0]]]);
      expect(runs('"`$$\\neq$$`"')).toEqual([[['$$\\neq$$', 0]]]);
    });
  });
});
