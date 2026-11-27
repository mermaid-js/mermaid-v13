// Label modes per diagram type (#763, #781, D564). The expected texts are what mermaid 12.2.0
// draws: its `markdownToHTML` reads bold and italic, and hands back a list item or a code span
// as written. Bullets and inline code in a mindmap markdown string are v13's own (D56).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corpusLabels, drawnRuns } from './testing/labels.ts';

const { drawnBy, textOf } = corpusLabels(readFileSync);

const render = (path: string): Promise<string[]> => drawnBy(path, drawnRuns);

describe('label modes per diagram type (#763, D564)', () => {
  it('mindmap: list markers and unquoted backticks are drawn as written', async () => {
    const texts = await render('mindmap/baseline/text/list-markers-and-backticks.mmd');
    expect(texts).toEqual([
      'root',
      '- 5 degrees',
      '* starred',
      '- quoted item',
      '`The dog in **the** hog`',
      'The dog in <b>the</b> hog',
      'plain <b>bold</b> and <i>italic</i>',
      '• one item / ◦ two items',
    ]);
  });

  it('mindmap: an unquoted backtick label over two lines keeps its backticks and asterisks', async () => {
    const texts = await render('mindmap/baseline/text/backtick-label-on-two-lines.mmd');
    expect(texts).toEqual([
      '`**Start** with / a second line`',
      '`The dog in **the** hog`',
      'The dog in <b>the</b> hog',
    ]);
  });

  // The fixture sets markdownAlwaysOn (#1368): every state label is markdown, list items and
  // inline code included, also in a state with several description lines.
  it('state: with markdownAlwaysOn, list items, inline code and emphasis in every label', async () => {
    const texts = await render('state-diagram-v2/baseline/text/list-markers-and-backticks.mmd');
    expect(texts).toEqual([
      '• item',
      '<code>code</code>',
      '<b>bold</b> and <i>italic</i>',
      '• one',
      '• two',
      'C',
      'D',
      'E',
      'first line',
      'second <b>line</b>',
      '• note item',
      'a <code>note</code> in backticks',
    ]);
  });

  it('requirement: backticks are drawn, emphasis is read without them', async () => {
    const texts = await render('requirement/baseline/text/backticks-and-emphasis.mmd');
    expect(texts).toEqual([
      '<<Requirement>>',
      '<b>`**bold**`</b>',
      'ID: 1',
      'Text: `*it*`',
      '<<Requirement>>',
      '<b>strong name</b>',
      'ID: 2',
      'Text: - not a <i>bullet</i>',
      '<<Element>>',
      '<b>`code` element</b>',
      'Type: `sim`',
    ]);
  });

  it('class: emphasis in every label but cardinalities, list markers and backticks as written', async () => {
    const texts = await render(
      'class-diagram/baseline/text/list-markers-backticks-and-entities.mmd'
    );
    expect(texts).toEqual([
      'uses B <i>often</i>',
      '1..*',
      '*',
      '<b>An important class</b>',
      '+run() : `fast`',
      '<b>B</b>',
      '- a note item\\nunknown #bogus; stays, : draws',
      '`code` in a note',
    ]);
  });

  it('sequence: a written backslash-n stays text, <br> breaks the line', async () => {
    const texts = await render('sequence/baseline/text/written-backslash-n.mmd');
    expect(texts).toEqual([
      'Al\\nice',
      'Al\\nice',
      'B',
      'B',
      'loop',
      '[l\\nx]',
      'n\\nx',
      'm\\nx',
      'one / two',
      'C:\\new\\path',
    ]);
  });

  it('sequence: text output keeps the written backslash-n', async () => {
    const r = await textOf('sequence/baseline/text/written-backslash-n.mmd');
    for (const text of ['Al\\nice', 'm\\nx', 'n\\nx', 'l\\nx', 'C:\\new\\path'])
      expect(r.text).toContain(text);
  });

  it('requirement: text output draws the backticks', async () => {
    const r = await textOf('requirement/baseline/text/backticks-and-emphasis.mmd');
    for (const text of ['`**bold**`', 'Text: `*it*`', 'Type: `sim`', 'Text: - not a bullet'])
      expect(r.text).toContain(text);
  });
});
