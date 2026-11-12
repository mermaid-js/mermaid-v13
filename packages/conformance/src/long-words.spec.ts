import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';

/**
 * Long words in labels, through the public `render()`, over the issues' examples in the e2e
 * corpus (#649, #394). A word wider than its wrap width stays whole where v12's HTML labels
 * kept it whole (no `overflow-wrap`), and a hyphen in the text is a break opportunity, as in
 * v12's HTML labels.
 */
const fixture = (path: string): string =>
  readFileSync(join(REPO_ROOT, 'e2e/diagrams', path), 'utf8');

async function svgOf(source: string): Promise<string> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return (await m.render('long-words', source)).svg;
}

/** The text of every `<text>` element, its `<tspan>` lines joined with ' / '. */
function textsOf(svg: string): string[] {
  const out: string[] = [];
  for (const [, body] of svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) {
    const spans = [...(body as string).matchAll(/<tspan\b[^>]*>([^<]*)<\/tspan>/g)].map(
      (m) => m[1] as string
    );
    out.push(spans.length > 0 ? spans.join(' / ') : (body as string).replace(/<[^>]*>/g, ''));
  }
  return out;
}

const WORD = 'Supercalifragilisticexpialidociousness';

describe('a word wider than its wrap width stays whole, as in v12 (#649)', () => {
  it.each([
    ['usecase/pr-check/long-word-stays-whole.mmd', WORD],
    ['state-diagram-v2/pr-check/long-word-stays-whole.mmd', WORD],
    ['mindmap/pr-check/long-word-stays-whole.mmd', WORD],
    ['agentflow/pr-check/long-word-stays-whole.mmd', 'translate_to_swedish'],
    // D557: journey and timeline widen the box to the word instead of overflowing it.
    ['journey/pr-check/long-word-stays-whole.mmd', WORD],
    ['timeline/pr-check/long-word-stays-whole.mmd', WORD],
    ['timeline/pr-check/long-word-stays-whole-td.mmd', WORD],
  ])('%s', async (path, word) => {
    const texts = textsOf(await svgOf(fixture(path)));
    expect(texts).toContain(word);
    // No line of any label is a piece of the word.
    for (const t of texts)
      for (const line of t.split(' / '))
        if (line !== word) expect(line.length > 2 && word.startsWith(line), line).toBe(false);
  });
});

describe('flowchart labels break after a hyphen, not inside a word (#394)', () => {
  it('breaks after the hyphen that fills the line, and never before a digit', async () => {
    const texts = textsOf(
      await svgOf(fixture('flowchart/pr-check/hyphenated-words-break-at-the-hyphen.mmd'))
    );
    expect(texts).toEqual(
      expect.arrayContaining([
        'subcontainer- / sibling',
        'half-rounded- / rectangle',
        'state-machine- / controller',
      ])
    );
    for (const t of texts) {
      const lines = t.split(' / ');
      // Every line but the last ends at a hyphen, and none starts with one.
      for (const line of lines.slice(0, -1)) expect(line.endsWith('-'), t).toBe(true);
      for (const line of lines) expect(line.startsWith('-'), t).toBe(false);
      // '2020-01-15' is not broken.
      if (t.includes('2020')) expect(t.startsWith('2020-01-15-'), t).toBe(true);
    }
  });
});
