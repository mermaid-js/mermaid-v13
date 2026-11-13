// Label modes per diagram type (#763, #781, D562). The expected texts are what mermaid 12.2.0
// draws: its `markdownToHTML` reads bold and italic, and hands back a list item or a code span
// as written. Bullets and inline code in a mindmap markdown string are v13's own (D56).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

const fixture = (path: string): string =>
  readFileSync(new URL(`../../../e2e/diagrams/${path}`, import.meta.url), 'utf8');

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/** One run: its text inside `<b>`, `<i>` and `<code>` for bold, italic and monospace. */
function run(tag: string, text: string): string {
  let out = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  if (attr(tag, 'font-family') === 'monospace') out = `<code>${out}</code>`;
  if (attr(tag, 'font-style') === 'italic') out = `<i>${out}</i>`;
  if (attr(tag, 'font-weight') === 'bold') out = `<b>${out}</b>`;
  return out;
}

/** Every `<text>` element: its runs marked by style, its lines joined by ` / `. */
function drawn(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map((m) => {
    const body = m[1] ?? '';
    if (!body.includes('<tspan')) return run('', body);
    let out = '';
    for (const t of body.matchAll(/(<tspan\b[^>]*>)(.*?)<\/tspan>/gs)) {
      const tag = t[1] ?? '';
      if (out !== '' && attr(tag, 'y') !== undefined) out += ' / ';
      out += run(tag, t[2] ?? '');
    }
    return out;
  });
}

async function render(path: string): Promise<string[]> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const r = await m.render('x', fixture(path));
  expect(r.warnings).toEqual([]);
  return drawn(r.svg);
}

describe('label modes per diagram type (#763, D562)', () => {
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

  it('state: emphasis only, and none in a state with several description lines', async () => {
    const texts = await render('state-diagram-v2/baseline/text/list-markers-and-backticks.mmd');
    expect(texts).toEqual([
      '- item',
      '`code`',
      '<b>bold</b> and <i>italic</i>',
      '- one',
      '* two',
      'C',
      'D',
      'E',
      'F',
      'first line / second **line**',
      '- note item',
      'a `note` in backticks',
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
    const m = createMermaid();
    const r = await m.render('x', fixture('sequence/baseline/text/written-backslash-n.mmd'), {
      format: 'ascii',
    });
    for (const text of ['Al\\nice', 'm\\nx', 'n\\nx', 'l\\nx', 'C:\\new\\path'])
      expect(r.text).toContain(text);
  });

  it('requirement: text output draws the backticks', async () => {
    const m = createMermaid();
    const r = await m.render('x', fixture('requirement/baseline/text/backticks-and-emphasis.mmd'), {
      format: 'ascii',
    });
    for (const text of ['`**bold**`', 'Text: `*it*`', 'Type: `sim`', 'Text: - not a bullet'])
      expect(r.text).toContain(text);
  });
});
