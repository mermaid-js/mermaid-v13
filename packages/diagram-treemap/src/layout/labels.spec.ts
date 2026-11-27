/**
 * Treemap labels by the label rule (#1368, #1403): the title, section and leaf labels are read by
 * core's label handler and fitted as one block of lines and runs; a label that reads as one line
 * of text in one style is fitted and drawn as one string, as before (D405). With
 * `markdownAlwaysOn` every label is markdown and takes the block path; the rest holds in both
 * modes.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { parseTreemap } from '../parser/index.ts';
import type { TreemapModel, TreemapNode } from '../model.ts';
import { treemapTestTheme } from '../test-context.ts';
import { context, leaf, model, section } from './fixtures.ts';
import { layoutTreemap } from './index.ts';
import type { TreemapLayoutContext } from './layout.ts';
import type { TreemapText } from './types.ts';

let theme: Theme;
beforeAll(async () => {
  theme = await treemapTestTheme();
});

const MODES: readonly [string, (ctx: TreemapLayoutContext) => TreemapLayoutContext][] = [
  ['default', (ctx) => ctx],
  ['markdownAlwaysOn', (ctx) => ({ ...ctx, config: { ...ctx.config, markdownAlwaysOn: true } })],
];

const md = (node: TreemapNode): TreemapNode => ({ ...node, markdown: true });

/** A text's lines, a bold run as `[b:…]` and an italic run as `[i:…]`, lines joined by ` / `. */
function shown(t: TreemapText | undefined): string | undefined {
  if (!t) return undefined;
  if (!t.block) return t.text;
  return t.block.lines
    .map((line) =>
      line
        .map((r) =>
          r.italic ? `[i:${r.text}]` : r.bold && t.font.weight < 700 ? `[b:${r.text}]` : r.text
        )
        .join('')
    )
    .join(' / ');
}

describe('treemap labels in the default mode', () => {
  it('draws plain markdown markers and a code span as written, as one string', () => {
    for (const name of ['leaf **bold** _ital_', 'leaf a `code` b', '`leaf **bold**`']) {
      const label = layoutTreemap(model([leaf(name, 1)]), context(theme)).leaves[0]!.label;
      expect(label?.text).toBe(name);
      expect(label?.block).toBeUndefined();
    }
  });

  it('warns once per label that holds markdown it does not read', () => {
    const codes: string[] = [];
    const ctx = { ...context(theme), warn: (w: { code: string }) => void codes.push(w.code) };
    layoutTreemap(model([section('s **b**', leaf('a', 1)), leaf('`c **d**`', 1)]), ctx);
    expect(codes).toEqual(['MARKDOWN_NOT_READ']);
  });
});

describe('treemap labels with markdownAlwaysOn', () => {
  const on = (): TreemapLayoutContext => MODES[1]![1](context(theme));

  it('reads every label kind as markdown', () => {
    const l = layoutTreemap(
      model([section('section **bold** _ital_', leaf('leaf **bold** _ital_', 1))], {
        title: 'title **bold** _ital_',
      }),
      on()
    );
    expect(shown(l.title)).toBe('title [b:bold] [i:ital]');
    expect(shown(l.sections[0]!.label)).toBe('section bold [i:ital]');
    expect(shown(l.leaves[0]!.label)).toBe('leaf [b:bold] [i:ital]');
  });

  it('fits a markdown leaf as the default mode fits the same text, or hides it', () => {
    const name = 'a **long** label '.repeat(6);
    const plain = name.replaceAll('**', '');
    const fit = (n: string, ctx: TreemapLayoutContext) =>
      layoutTreemap(model([leaf(n, 1), leaf('b', 9)]), ctx).leaves.find((x) => x.node.name === n)!;
    // The half-em measurer gives bold no extra width: the sizes match.
    expect(fit(name, on()).label?.font.size).toBe(fit(plain, context(theme)).label?.font.size);
    const tiny = layoutTreemap(model([leaf(name, 1), leaf('b', 4000)]), on()).leaves.find(
      (x) => x.node.name === name
    )!;
    expect(tiny.label).toBeUndefined();
  });
});

describe.each(MODES)('treemap labels (%s)', (_name, mode) => {
  const lay = (m: TreemapModel) => layoutTreemap(m, mode(context(theme)));
  const leafText = (node: TreemapNode) => lay(model([node])).leaves[0]!.label;

  it('reads a marked markdown string as markdown, without its backticks', () => {
    const label = leafText(md(leaf('`leaf **bold** _ital_`', 1)));
    const runs = label!.block!.lines[0]!;
    expect(runs.map((r) => [r.text, !!r.bold, !!r.italic])).toEqual([
      ['leaf ', false, false],
      ['bold', true, false],
      [' ', false, false],
      ['ital', false, true],
    ]);
  });

  it('draws tags and breaks at <br> and at a written \\n', () => {
    const tags = leafText(leaf('a <b>bold</b><br>H<sub>2</sub>O', 1))!;
    expect(tags.block!.lines.map((l) => l.map((r) => r.text).join(''))).toEqual(['a bold', 'H2O']);
    expect(tags.text).toBe('a bold\nH2O');
    const broken = leafText(leaf('one\\ntwo', 1))!;
    expect(broken.text).toBe('one\ntwo');
    // The block is centred on the leaf, two lines high.
    expect(broken.box.height).toBe(2 * broken.block!.lineHeight);
    expect(broken.box.y + broken.box.height / 2).toBe(broken.y);
  });

  it('shrinks a block to fit and puts the value under it', () => {
    const name = `${'x'.repeat(40)}\\ntwo`;
    const l = lay(model([leaf(name, 1), leaf('b', 1)])).leaves.find((x) => x.node.name === name)!;
    expect(l.label!.font.size).toBeLessThan(38);
    expect(l.valueText!.box.y).toBeGreaterThanOrEqual(l.label!.box.y + l.label!.box.height);
  });

  it('keeps a section label to its first line, with ... after it', () => {
    const s = lay(model([section('section one\\ntwo', leaf('x', 1))])).sections[0]!;
    expect(s.label!.text).toBe('section one...');
    expect(s.label!.block!.left).toBe(true);
    const tags = lay(model([section('a <i>b</i>', leaf('x', 1))])).sections[0]!;
    expect(shown(tags.label)).toBe('a [i:b]');
  });

  it('truncates a styled section label run by run', () => {
    const long = `<i>${'x'.repeat(200)}</i>`;
    const s = lay(model([section(long, leaf('x', 1))])).sections[0]!;
    expect(s.label!.text).toMatch(/^x+\.\.\.$/);
    expect(s.label!.block!.lines[0]![0]!.italic).toBe(true);
    expect(s.label!.box.width).toBeLessThanOrEqual(s.box.width);
  });

  it('truncates a styled leaf label line by line in a complex treemap', () => {
    const leaves = Array.from({ length: 21 }, (_, i) => leaf(`l${i}`, 1));
    leaves[0] = leaf(`<b>${'w'.repeat(400)}</b>\\nshort`, 1);
    const l = lay(model(leaves)).leaves.find((x) => x.node.name.startsWith('<b>'))!;
    expect(l.label!.text).toMatch(/^w+\.\.\.\nshort$/);
    expect(l.label!.block!.lines[0]!.every((r) => r.bold)).toBe(true);
    expect(l.label!.box.width).toBeLessThanOrEqual(l.box.width);
  });

  it('widens the title band by the extra lines of a title', () => {
    const one = lay(model([leaf('a', 1)], { title: 'T' }));
    const two = lay(model([leaf('a', 1)], { title: 'one<br>two' }));
    expect(two.titleBand).toBe(one.titleBand + two.title!.block!.lineHeight);
    expect(two.leaves[0]!.box.y).toBe(one.leaves[0]!.box.y + two.title!.block!.lineHeight);
    expect(two.title!.box.y).toBeGreaterThanOrEqual(0);
    const quoted = lay(model([leaf('a', 1)], { title: '"`a **b**`"' }));
    expect(shown(quoted.title)).toBe('a [b:b]');
  });
});

describe('treemap parser: markdown strings', () => {
  const names = (src: string) => parseTreemap(src).model.roots.map((n) => [n.name, n.markdown]);

  it('marks a name written as "`…`", and only that', () => {
    expect(
      names('treemap-beta\n  "`a **b**`": 1\n  \'`c`\': 1\n  "a `b` c": 1\n  "x": 1\n')
    ).toEqual([
      ['`a **b**`', true],
      ['`c`', undefined],
      ['a `b` c', undefined],
      ['x', undefined],
    ]);
  });
});
