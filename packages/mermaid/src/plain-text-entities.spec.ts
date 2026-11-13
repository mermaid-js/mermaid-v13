// Entity codes in the types that draw plain text (#760, #656, spec #777): gantt, gitGraph,
// treeView and railroad draw `#35;`, `#quot;` and `#9829;` as their characters, in SVG and in
// text output, and a name core does not know as the author wrote it (D559).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

const fixture = (path: string): string =>
  readFileSync(new URL(`../../../e2e/diagrams/${path}`, import.meta.url), 'utf8');

/** The text of every `<text>` element as a reader sees it, its lines joined by a blank. */
function drawn(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map((m) =>
    (m[1] ?? '')
      .replace(/<\/tspan>\s*<tspan\b[^>]*>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
  );
}

async function svgTexts(path: string): Promise<string[]> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const r = await m.render('x', fixture(path));
  expect(r.warnings).toEqual([]);
  return drawn(r.svg);
}

async function textOutput(path: string): Promise<string> {
  const r = await createMermaid().render('x', fixture(path), { format: 'ascii' });
  return r.text;
}

describe('entity codes in plain-text diagrams (#760, #656, D559)', () => {
  it('a gantt chart draws them in the title, a section name and task labels', async () => {
    expect(await svgTexts('gantt/baseline/text/entity-codes.mmd')).toEqual(
      expect.arrayContaining([
        'Heart ♥ title',
        'Sec #A ♥',
        'Heart ♥ test',
        'Amp & lt <b> "q"',
        'unknown #bogus; stays',
      ])
    );
  });

  it('a gitGraph draws them in commit ids, tags and branch names', async () => {
    expect(await svgTexts('git/baseline/text/entity-codes.mmd')).toEqual(
      expect.arrayContaining([
        'a#b/c',
        'heart ♥',
        't#1 ☃',
        'fe/x',
        '<tag> & "q"',
        'unknown #bogus; stays',
      ])
    );
  });

  it('a treeView draws them in names and descriptions', async () => {
    expect(await svgTexts('tree-view/baseline/text/entity-codes.mmd')).toEqual(
      expect.arrayContaining([
        'a ☃ b',
        'c # d',
        'i " j',
        'x ☃ y',
        '<tag> & more',
        'unknown #bogus; stays',
      ])
    );
  });

  it('a treeView draws the same characters in text output', async () => {
    const text = await textOutput('tree-view/baseline/text/entity-codes.mmd');
    for (const shown of ['a ☃ b', 'c # d', 'i " j', 'x ☃ y', '<tag> & more', '#bogus; stays'])
      expect(text).toContain(shown);
    expect(text).not.toMatch(/&#?\w+;/);
  });

  it('a box-drawn treeView draws them, and an unknown name as written', async () => {
    const path = 'tree-view/baseline/text/entity-codes-box.mmd';
    const texts = ['a ☃ b', 'c # d', 'x "q" y', 'unknown #bogus; stays'];
    expect(await svgTexts(path)).toEqual(expect.arrayContaining(texts));
    const text = await textOutput(path);
    for (const shown of texts) expect(text).toContain(shown);
  });

  // What each notation's fixture draws in its terminals.
  const RAILROAD: readonly (readonly [notation: string, terminals: readonly string[]])[] = [
    ['ir', ['a <b> # "q" & c', 'unknown #bogus; stays']],
    ['ebnf', ['<b>bold</b> & <tag> # "q"', 'x ♥ y', 'unknown #bogus; stays']],
    ['abnf', ['a <b> # & c', 'x ♥ y', 'unknown #bogus; stays']],
    ['peg', ['a <b> # "q" & c', 'x ♥ y', 'unknown #bogus; stays']],
  ];

  it.each(RAILROAD)('a railroad diagram (%s) draws them in terminals', async (notation, texts) => {
    const path = `railroad/baseline/${notation}/entity-codes.mmd`;
    expect(await svgTexts(path)).toEqual(expect.arrayContaining([...texts]));
  });

  it.each(RAILROAD)(
    'a railroad diagram (%s) draws the same in text output',
    async (notation, texts) => {
      const text = await textOutput(`railroad/baseline/${notation}/entity-codes.mmd`);
      for (const shown of texts) expect(text).toContain(shown);
      expect(text).not.toMatch(/&#?\w+;/);
    }
  );
});
