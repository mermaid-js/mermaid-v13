import { describe, expect, it } from 'vitest';
import { CORE_DEFAULTS } from '../config/index.ts';
import { resolveConfig } from '../config/resolve.ts';
import { Style, labelSource, layoutLabel, tableMeasurer, type FontKey } from './index.ts';
import { withoutEndBreaks } from './label-source.ts';
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

const ON: LabelConfig = { markdownAlwaysOn: true };
/** A label read and laid out with `markdownAlwaysOn` set. */
const onRuns = (label: string) => runs(label, {}, ON);

describe('labelSource, markdownAlwaysOn (D734)', () => {
  // Labels whose reading the key must not change: markdown strings, tags, entities and line
  // breaks.
  const SAME = [
    '"`**b**`"',
    '"`**a**\\nb`"',
    '<b>x</b> &lt;y&gt; <i>z</i>',
    'a\\nb',
    'a<br>b',
    'a\n\nb<br>',
    'C:\\new\\path',
    '$$\\neq$$',
  ];

  it('reads every label as a markdown string is read', () => {
    for (const label of ['**b** _i_', 'a `code` b', '- item', '`**b**`', 'plain', 'a\\n- b']) {
      expect(labelSource(label, {}, ON)).toEqual(labelSource(label, { markdown: true }));
      expect(labelSource(label, {}, ON).markup).toBe('markdown');
    }
    expect(onRuns('**b** _i_')).toEqual([
      [
        ['b', B],
        [' ', 0],
        ['i', I],
      ],
    ]);
    expect(onRuns('**b** _i_')).toEqual(runs('"`**b** _i_`"'));
    expect(onRuns('- item')).toEqual(runs('"`- item`"'));
    expect(onRuns('a `code` b')).toEqual(runs('a `code` b', { markdown: true }));
  });

  it('reads markdown strings, tags, entities and line breaks as the default mode does', () => {
    for (const label of SAME) expect(onRuns(label)).toEqual(runs(label));
    expect(labelSource('"`**b**`"', {}, ON)).toEqual(labelSource('"`**b**`"'));
    expect(onRuns('**a**\\nb')).toEqual([[['a', B]], [['b', 0]]]);
  });

  it('changes nothing when off', () => {
    for (const label of [...SAME, '**b** _i_', 'a `code` b', '- item']) {
      expect(labelSource(label, {}, { markdownAlwaysOn: false })).toEqual(labelSource(label));
      expect(labelSource(label, {}, {})).toEqual(labelSource(label));
    }
    expect(labelSource('**b** _i_').markup).toBe('plain');
  });

  it('ignores the deprecated v12Markdown flag, on or off', () => {
    for (const config of [{}, ON]) {
      expect(labelSource('**b**', { v12Markdown: true }, config)).toEqual(
        labelSource('**b**', {}, config)
      );
    }
  });

  describe('read from the resolved config (front matter, directives, diagram sections)', () => {
    const resolve = (
      text: Record<string, unknown> | undefined,
      directives: Record<string, unknown>[] = [],
      initialize?: Record<string, unknown>
    ) => {
      const warnings: unknown[] = [];
      const config = resolveConfig(
        CORE_DEFAULTS,
        initialize,
        text,
        directives,
        { flowchart: {} },
        { warn: (w) => void warnings.push(w), section: 'flowchart' }
      );
      expect(warnings).toEqual([]);
      return config;
    };
    const reads = (config: LabelConfig) => labelSource('**b**', {}, config).markup;

    it('is off by default', () => {
      expect(resolve(undefined).markdownAlwaysOn).toBe(false);
      expect(reads(resolve(undefined))).toBe('plain');
    });

    it('is set at the top level from front matter or a directive', () => {
      expect(reads(resolve({ markdownAlwaysOn: true }))).toBe('markdown');
      expect(reads(resolve(undefined, [{ markdownAlwaysOn: true }]))).toBe('markdown');
    });

    it('takes the diagram section’s value over the top level, both ways', () => {
      // Front matter.
      expect(
        reads(resolve({ markdownAlwaysOn: true, flowchart: { markdownAlwaysOn: false } }))
      ).toBe('plain');
      expect(
        reads(resolve({ markdownAlwaysOn: false, flowchart: { markdownAlwaysOn: true } }))
      ).toBe('markdown');
      expect(reads(resolve({ flowchart: { markdownAlwaysOn: true } }))).toBe('markdown');
      // Directives.
      expect(
        reads(
          resolve(undefined, [{ markdownAlwaysOn: true, flowchart: { markdownAlwaysOn: false } }])
        )
      ).toBe('plain');
      expect(reads(resolve(undefined, [{ flowchart: { markdownAlwaysOn: true } }]))).toBe(
        'markdown'
      );
      // initialize() too.
      expect(reads(resolve(undefined, [], { flowchart: { markdownAlwaysOn: true } }))).toBe(
        'markdown'
      );
    });

    it('lets diagram text win over initialize(), whichever level each sets', () => {
      const init = { flowchart: { markdownAlwaysOn: true } };
      expect(reads(resolve({ markdownAlwaysOn: false }, [], init))).toBe('plain');
      expect(
        reads(resolve({ flowchart: { markdownAlwaysOn: false } }, [], { markdownAlwaysOn: true }))
      ).toBe('plain');
    });

    it('reads another section’s value only for that diagram type', () => {
      expect(reads(resolve({ gantt: { markdownAlwaysOn: true } }))).toBe('plain');
    });
  });
});

describe('withoutEndBreaks', () => {
  it.each([
    ['a<br>', 'a'],
    ['a <br/> \n<BR />  ', 'a'],
    ['<br>', ''],
    ['  <br> ', ''],
    ['', ''],
    ['a<b>', 'a<b>'],
    ['a<br>b', 'a<br>b'],
    ['a <br', 'a <br'],
    ['a>', 'a>'],
    ['>', '>'],
    ['<', '<'],
    ['x<br>>', 'x<br>>'],
    ['a\t\u0001', 'a'],
  ])('%j gives %j', (text, out) => {
    expect(withoutEndBreaks(text)).toBe(out);
  });
});
