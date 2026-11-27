import { describe, expect, it } from 'vitest';
import { CORE_DEFAULTS } from '../config/index.ts';
import { resolveConfig } from '../config/resolve.ts';
import { Style, labelSource, layoutLabel, tableMeasurer, type FontKey } from './index.ts';
import type { LabelConfig, LabelSourceOptions } from './label-source.ts';

const arial: FontKey = { family: 'Arial', size: 10, weight: 400 };
const B = Style.Bold;
const I = Style.Italic;

/** A label as written, read by the handler and laid out: `[text, style]` per run, per line. */
const runs = (
  label: string,
  options?: LabelSourceOptions,
  config?: LabelConfig
): [string, number][][] => {
  const source = labelSource(label, options, config);
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

const LEGACY: LabelConfig = { legacyMarkdown: true };
const V12: LabelSourceOptions = { v12Markdown: true };
/** A label of a kind v12 read markdown in, with `legacyMarkdown` set. */
const legacy = (label: string) => labelSource(label, V12, LEGACY);
/** Its runs, as `runs` gives them. */
const legacyRuns = (label: string) => runs(label, V12, LEGACY);

describe('labelSource, legacyMarkdown (D734 compatibility mode)', () => {
  // Labels whose reading the key must not change: tags, entities, a written `\n`, markdown
  // strings, bare backticks, and markdown in a label of a kind v12 did not read it in.
  const SAME = [
    '**b** _i_',
    '<b>x</b> &lt;y&gt;',
    'a\\nb',
    '**a**\\nb',
    'a\n\nb<br>',
    '"`**b**`"',
    '"`**a**\\nb`"',
    '$$\\neq$$',
    'C:\\new\\path',
  ];

  it('ignores the label kind’s flag with the key off', () => {
    for (const label of SAME) {
      expect(labelSource(label, V12)).toEqual(labelSource(label));
      expect(labelSource(label, V12, { legacyMarkdown: false })).toEqual(labelSource(label));
    }
  });

  it('reads a label of a kind without the flag as the default mode does', () => {
    for (const label of SAME) {
      expect(labelSource(label, {}, LEGACY)).toEqual(labelSource(label));
      expect(labelSource(label, { v12Markdown: false }, LEGACY)).toEqual(labelSource(label));
    }
  });

  it('reads plain bold and italic in a label of a kind with the flag, as v12 did', () => {
    expect(legacy('**b** _i_')).toMatchObject({ text: '**b** _i_', markup: 'emphasis' });
    expect(legacyRuns('**b** _i_')).toEqual([
      [
        ['b', B],
        [' ', 0],
        ['i', I],
      ],
    ]);
  });

  it('reads a markdown string as the default mode does', () => {
    expect(legacy('"`**b**`"')).toEqual(labelSource('"`**b**`"'));
    expect(legacy('"`**a**\\nb`"')).toEqual(labelSource('"`**a**\\nb`"'));
    expect(labelSource('**b**', { markdown: true, v12Markdown: true }, LEGACY)).toEqual(
      labelSource('**b**', { markdown: true })
    );
  });

  it('draws bare backticks, tags and entities as the default mode does', () => {
    expect(legacyRuns('`**b**`')).toEqual(runs('`**b**`'));
    expect(legacyRuns('``a``')).toEqual(runs('``a``'));
    expect(legacyRuns('<b>x</b> &lt;y&gt; <i>z</i>')).toEqual(runs('<b>x</b> &lt;y&gt; <i>z</i>'));
    expect(legacyRuns('a<br>b')).toEqual(runs('a<br>b'));
  });

  // v12Label keeps a written `\n` as text (`backslashBreak: false`); the handler breaks there in
  // both modes (D734).
  it('breaks at a written \\n, as the default mode does', () => {
    expect(legacyRuns('a\\nb')).toEqual(runs('a\\nb'));
    expect(legacyRuns('C:\\new\\path')).toEqual(runs('C:\\new\\path'));
    expect(legacyRuns('**a**\\n_b_')).toEqual([[['a', B]], [['b', I]]]);
    expect(legacyRuns('`a\\nb`')).toEqual([[['`a', 0]], [['b`', 0]]]);
    expect(legacyRuns('- a\\nb')).toEqual([[['- a', 0]], [['b', 0]]]);
    expect(legacy('$$\\neq$$').text).toBe('$$\\neq$$');
  });

  it('reads the key from a resolved config, set in front matter or a directive', () => {
    const plain = resolveConfig(CORE_DEFAULTS);
    expect(plain.legacyMarkdown).toBe(false);
    expect(labelSource('**b**', V12, plain)).toEqual(labelSource('**b**'));
    const warnings: unknown[] = [];
    const warn = (w: unknown) => void warnings.push(w);
    const front = resolveConfig(CORE_DEFAULTS, undefined, LEGACY, [], undefined, { warn });
    const directive = resolveConfig(CORE_DEFAULTS, undefined, undefined, [LEGACY], undefined, {
      warn,
    });
    expect(warnings).toEqual([]);
    for (const config of [front, directive]) {
      expect(labelSource('**b**', V12, config)).toMatchObject({ markup: 'emphasis' });
      expect(labelSource('**b**', {}, config)).toEqual(labelSource('**b**'));
    }
  });

  // `v12-label.spec.ts`'s cases, read through the handler's compatibility branch.
  describe('v12’s markdown reading', () => {
    it('reads emphasis in a label without a code span', () => {
      expect(legacy('**a** and *b*').markup).toBe('emphasis');
      expect(legacyRuns('**a** and *b*')).toEqual([
        [
          ['a', B],
          [' and ', 0],
          ['b', I],
        ],
      ]);
    });

    it('reads emphasis next to a code span and keeps the span as written (#836)', () => {
      expect(legacy('**a** `b`').markup).toBe('emphasis');
      expect(legacyRuns('**a** `b`')).toEqual([
        [
          ['a', B],
          [' `b`', 0],
        ],
      ]);
      expect(legacyRuns('**bold** and `code`')).toEqual([
        [
          ['bold', B],
          [' and `code`', 0],
        ],
      ]);
    });

    it('keeps emphasis markers inside a code span as written', () => {
      expect(legacyRuns('`**x**`')).toEqual([[['`**x**`', 0]]]);
      expect(legacyRuns('`*x*` and `__y__`')).toEqual([[['`*x*` and `__y__`', 0]]]);
      expect(legacyRuns('`_x_` **b**')).toEqual([
        [
          ['`_x_` ', 0],
          ['b', B],
        ],
      ]);
    });

    it('does not close emphasis with a marker inside a code span', () => {
      expect(legacyRuns('**a `x**` b**')).toEqual([[['a `x**` b', B]]]);
      expect(legacyRuns('**a `b**`')).toEqual([[['**a `b**`', 0]]]);
    });

    it('reads every code span in the label', () => {
      expect(legacyRuns('`*a*` *b* `_c_` _d_')).toEqual([
        [
          ['`*a*` ', 0],
          ['b', I],
          [' `_c_` ', 0],
          ['d', I],
        ],
      ]);
    });

    it('reads a span of two backticks, with a single backtick inside it, as one span', () => {
      expect(legacyRuns('``a ` **b**`` **c**')).toEqual([
        [
          ['``a ` **b**`` ', 0],
          ['c', B],
        ],
      ]);
    });

    it('reads an unclosed backtick as text, so emphasis after it is read', () => {
      expect(legacyRuns('`a **b**')).toEqual([
        [
          ['`a ', 0],
          ['b', B],
        ],
      ]);
      expect(legacyRuns('**a** ``b`')).toEqual([
        [
          ['a', B],
          [' ``b`', 0],
        ],
      ]);
    });

    it('decodes character references a code span already holds', () => {
      expect(legacyRuns('`a &amp; &#42;b&#42;` **c**')).toEqual([
        [
          ['`a & *b*` ', 0],
          ['c', B],
        ],
      ]);
    });

    it('never shows the character references it adds', () => {
      const source = legacy('`**x** _y_`');
      expect(source.text).not.toMatch(/[*_]/);
      const label = layoutLabel(source.text, arial, Infinity, tableMeasurer, source);
      const text = label.lines.map((l) => l.map((r) => r.text).join('')).join('\n');
      expect(text).toBe('`**x** _y_`');
      expect(text).not.toContain('&#');
      expect(label.width).toBeCloseTo(tableMeasurer.width('`**x** _y_`', arial, 0), 9);
    });

    it('leaves an underscore inside a word and a math span in a code span as written', () => {
      expect(legacy('`fa:fa-a_b` **c**').text).toBe('`fa:fa-a_b` **c**');
      expect(legacy('`$$x_1 * y$$` **c**').text).toBe('`$$x_1 * y$$` **c**');
    });

    it('keeps a label that starts with a list marker plain', () => {
      expect(legacy('- item **b**').markup).toBe('plain');
      expect(legacy('* item `c` **b**').markup).toBe('plain');
      expect(legacy('+ item').markup).toBe('plain');
      expect(legacyRuns('- item **b**')).toEqual([[['- item **b**', 0]]]);
    });

    it('drops blank lines between written lines and breaks at the end', () => {
      expect(legacy('a\n\nb<br>').text).toBe('a\nb');
    });
  });
});
