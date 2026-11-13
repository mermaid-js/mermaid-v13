// ER labels read Markdown emphasis, as v12 does for every ER label (#754, D565).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corpusLabels, drawnRuns } from './testing/labels.ts';

const { drawnBy, textOf } = corpusLabels(readFileSync);

const FIXTURE = 'er-diagram/baseline/text/markdown-emphasis.mmd';

describe('Markdown emphasis in ER labels (#754, D565)', () => {
  it('draws bold and italic runs without the markers in every label kind', async () => {
    expect(await drawnBy(FIXTURE, drawnRuns)).toEqual(
      expect.arrayContaining([
        'This <b>is</b> <i>Markdown</i>',
        '<i>Alias</i>',
        '<b>bold</b>',
        '<i>it</i>',
        'a <b>comment</b>',
        '<b>rel</b>',
        'Sales <b>domain</b>',
      ])
    );
  });

  it('keeps an underscore inside a word', async () => {
    const texts = await drawnBy(FIXTURE, drawnRuns);
    expect(texts.filter((text) => text.includes('order'))).toEqual(['order_item', 'order_item']);
  });

  it('text output drops the markers', async () => {
    const { text, warnings } = await textOf(FIXTURE);
    expect(warnings).toEqual([]);
    for (const label of ['This is Markdown', 'Alias', 'bold', 'it', 'a comment', 'rel'])
      expect(text).toContain(label);
    expect(text).toContain('Sales domain');
    expect(text).toContain('order_item');
    expect(text).not.toMatch(/\*|__|_it_|_Markdown_/);
  });

  it('the unicode-text fixture shows no raw markers', async () => {
    expect(
      await drawnBy(
        'er-diagram/visual-check/an-er-diagram-with-unicode-text-default.mmd',
        drawnRuns
      )
    ).toEqual(
      expect.arrayContaining([
        '<b><i>testẽζ➕Ø😀㌕ぼ</i></b>',
        '<b>driversLicense</b>',
        '<b>phone</b>',
        '<i>age</i>',
        'last<i>Name</i>',
      ])
    );
  });
});
