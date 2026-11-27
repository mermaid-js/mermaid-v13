import { describe, expect, it } from 'vitest';
import { Style } from '@mermaid-js/core/text';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import { fixtureSource } from './layout/mmd.fixtures.ts';
import type { BlockLayout } from './layout/types.ts';
import { parseBlock } from './parser/index.ts';
import { renderBlockForTest } from './render/harness.ts';

/**
 * Block labels by the label rule (D734) and block's markdown strings (D736): a shape, a block
 * arrow and an edge label take `"`…`"`, which the model marks and the layout reads as markdown.
 * Any other label is plain. No block label kind read markdown in v12, so `legacyMarkdown`
 * changes nothing.
 */
const COMPAT = '---\nconfig:\n  legacyMarkdown: true\n---\n';

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

describe('block markdown strings (D736): the parser', () => {
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

describe('block labels by the label rule (D734, D736): the layout', () => {
  for (const [mode, front] of [
    ['the default mode', ''],
    ['legacyMarkdown', COMPAT],
  ] as const) {
    it(`reads each label kind in ${mode}`, async () => {
      const { layout, rejected } = await renderBlockForTest(front + SOURCE);
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
  }

  it('draws the markdown strings bold in the SVG, in both modes alike', async () => {
    const plain = await renderBlockForTest(SOURCE);
    const compat = await renderBlockForTest(COMPAT + SOURCE);
    expect(plain.svg).toMatch(/font-weight="bold"[^>]*>shape</);
    expect(plain.svg).toMatch(/font-weight="bold"[^>]*>arrow</);
    expect(plain.svg).toMatch(/font-weight="bold"[^>]*>edge</);
    expect(plain.svg).toMatch(/font-weight="bold"[^>]*>group</);
    expect(plain.svg).toContain('**bold** _ital_');
    expect(compat.svg).toBe(plain.svg);
  });

  it('draws the compatibility-mode fixture as the default one', async () => {
    const plain = await renderBlockForTest(fixtureSource('pr-check/label-syntax')!);
    const compat = await renderBlockForTest(fixtureSource('pr-check/label-syntax-compat')!);
    expect(plain.rejected || compat.rejected).toBeFalsy();
    expect(compat.svg).toBe(plain.svg);
  });
});
