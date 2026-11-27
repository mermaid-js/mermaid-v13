import { describe, expect, it } from 'vitest';
import { Style } from '@mermaid-js/core/text';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import type { BlockLayout } from './layout/types.ts';
import { parseBlock } from './parser/index.ts';
import { renderBlockForTest } from './render/harness.ts';

/**
 * Block labels by the label rule (#1368, #1401): a shape, a block arrow, a composite header and
 * an edge label take a markdown string `"`…`"`, which the model marks and the layout reads as
 * markdown. Any other label is plain, unless `markdownAlwaysOn` makes every label markdown.
 */
const ALWAYS = '---\nconfig:\n  markdownAlwaysOn: true\n---\n';
const ALWAYS_BLOCK = '---\nconfig:\n  block:\n    markdownAlwaysOn: true\n---\n';

/** Each run of a label as `text` or `text:b`/`text:i` for bold/italic, lines joined by `|`. */
const runs = (label: MeasuredLabel | undefined): string =>
  (label?.lines ?? [])
    .map((line) =>
      line
        .map((r) => {
          const marks =
            ((r.style & Style.Bold) !== 0 ? 'b' : '') + ((r.style & Style.Italic) !== 0 ? 'i' : '');
          return r.text + (marks ? `:${marks}` : '');
        })
        .join('')
    )
    .join('|');

const blockRuns = (layout: BlockLayout, id: string): string =>
  runs(layout.blocks.find((b) => b.id === id)?.label?.text);
const edgeRuns = (layout: BlockLayout): string => runs(layout.edges[0]?.label?.text);
const code = (w: { code: string }): string => w.code;

const SOURCE = [
  'block',
  '  a["`**shape** _ital_`"]',
  '  b("**bold** _ital_")',
  '  d["a `code` b"]',
  '  e["<b>bold</b><br>H<sub>2</sub>O"]',
  '  f["one\\ntwo"]',
  '  g<["`**arrow**`"]>(right)',
  '  h -- "`**edge**`" --> i',
  '  block:k["`**group**`"]',
  '    l',
  '  end',
].join('\n');

/** One plain label of every kind, each with emphasis marks. */
const PLAIN = [
  'block',
  '  p["**shape** _ital_"]',
  '  q<["**arrow** _ital_"]>(right)',
  '  r -- "**edge** _ital_" --> s',
  '  block:k["**group** _ital_"]',
  '    l',
  '  end',
].join('\n');

describe('block markdown strings (#1401): the parser', () => {
  it('takes a markdown string in a shape, a block arrow, a composite and an edge label', () => {
    const { model, diagnostics } = parseBlock(SOURCE);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const all = [...model.blocks, ...model.blocks.flatMap((b) => b.children)];
    const mark = (id: string) => all.find((b) => b.id === id);
    expect(mark('a')).toMatchObject({ label: '**shape** _ital_', markdown: true });
    expect(mark('g')).toMatchObject({ label: '**arrow**', markdown: true, type: 'block_arrow' });
    expect(mark('k')).toMatchObject({ label: '**group**', markdown: true, type: 'composite' });
    expect(model.edges[0]).toMatchObject({ label: '**edge**', markdown: true });
    for (const id of ['b', 'd', 'e', 'f', 'h', 'i', 'l'])
      expect(mark(id)?.markdown, id).toBeUndefined();
  });

  it('a later plain label replaces a markdown string and its mark, and the other way', () => {
    const later = parseBlock('block\n  a["`**x**`"]\n  a["y"]\n  b["y"]\n  b["`**x**`"]').model;
    expect(later.blocks.map((b) => [b.label, b.markdown])).toEqual([
      ['y', undefined],
      ['**x**', true],
    ]);
  });

  it('still rejects bare backticks, which are no quoted label, as v12', () => {
    for (const body of ['a[`x`]', 'a<[`x`]>(right)', 'a -- `x` --> b']) {
      const errors = parseBlock('block\n  ' + body).diagnostics.filter(
        (d) => d.severity === 'error'
      );
      expect(errors, body).not.toEqual([]);
    }
  });

  it('a mention without a label keeps the markdown string', () => {
    const { model } = parseBlock('block\n  a["`**x**`"]\n  a --> b');
    expect(model.blocks[0]).toMatchObject({ label: '**x**', markdown: true });
  });
});

describe('block labels by the label rule (#1368, #1401): the layout', () => {
  it('reads each label kind in the default mode', async () => {
    const { layout, rejected } = await renderBlockForTest(SOURCE);
    expect(rejected).toBeFalsy();
    expect(blockRuns(layout, 'a')).toBe('shape:b ital:i');
    expect(blockRuns(layout, 'b')).toBe('**bold** _ital_');
    expect(blockRuns(layout, 'd')).toBe('a `code` b');
    expect(blockRuns(layout, 'e')).toBe('bold:b|H2O');
    expect(blockRuns(layout, 'f')).toBe('one|two');
    expect(blockRuns(layout, 'g')).toBe('arrow:b');
    expect(blockRuns(layout, 'k')).toBe('group:b');
    expect(edgeRuns(layout)).toBe('edge:b');
  });

  it('draws every plain label kind as written in the default mode', async () => {
    const { layout } = await renderBlockForTest(PLAIN);
    expect(blockRuns(layout, 'p')).toBe('**shape** _ital_');
    expect(blockRuns(layout, 'q')).toBe('**arrow** _ital_');
    expect(blockRuns(layout, 'k')).toBe('**group** _ital_');
    expect(edgeRuns(layout)).toBe('**edge** _ital_');
  });

  for (const [how, front] of [
    ['globally', ALWAYS],
    ['in the block section', ALWAYS_BLOCK],
  ] as const) {
    it(`reads every label kind as markdown with markdownAlwaysOn set ${how}`, async () => {
      const plain = (await renderBlockForTest(front + PLAIN)).layout;
      expect(blockRuns(plain, 'p')).toBe('shape:b ital:i');
      expect(blockRuns(plain, 'q')).toBe('arrow:b ital:i');
      expect(blockRuns(plain, 'k')).toBe('group:b ital:i');
      expect(edgeRuns(plain)).toBe('edge:b ital:i');
      const { layout } = await renderBlockForTest(front + SOURCE);
      expect(blockRuns(layout, 'a')).toBe('shape:b ital:i');
      expect(blockRuns(layout, 'b')).toBe('bold:b ital:i');
      expect(blockRuns(layout, 'd')).not.toContain('`');
      expect(blockRuns(layout, 'e')).toBe('bold:b|H2O');
      expect(blockRuns(layout, 'f')).toBe('one|two');
      expect(blockRuns(layout, 'g')).toBe('arrow:b');
      expect(edgeRuns(layout)).toBe('edge:b');
    });
  }

  it('draws the markdown strings bold in the SVG', async () => {
    const { svg } = await renderBlockForTest(SOURCE);
    for (const word of ['shape', 'arrow', 'edge', 'group'])
      expect(svg).toMatch(new RegExp(`font-weight="bold"[^>]*>${word}<`));
    expect(svg).toContain('**bold** _ital_');
  });

  it('warns for plain labels with emphasis, never with markdownAlwaysOn or markdown strings', async () => {
    const warned = (await renderBlockForTest(PLAIN)).warnings.map(code);
    expect(warned).toContain(MARKDOWN_NOT_READ.code);
    const always = (await renderBlockForTest(ALWAYS + PLAIN)).warnings.map(code);
    expect(always).not.toContain(MARKDOWN_NOT_READ.code);
    const strings = 'block\n  a["`**x**`"]\n  b<["`**y**`"]>(up)\n  c -- "`**z**`" --> d';
    const none = (await renderBlockForTest(strings)).warnings.map(code);
    expect(none).not.toContain(MARKDOWN_NOT_READ.code);
  });
});
