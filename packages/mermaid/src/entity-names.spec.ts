// Entity names in labels (#396, D559): the punctuation names draw as their characters, and a
// name core does not know draws as the author wrote it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

const fixture = (path: string): string =>
  readFileSync(new URL(`../../../e2e/diagrams/${path}`, import.meta.url), 'utf8');

/** The text of every `<text>` element, its lines joined by a blank. */
function drawn(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map((m) =>
    (m[1] ?? '')
      .replace(/<\/tspan>\s*<tspan\b[^>]*>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
  );
}

async function render(path: string): Promise<string[]> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const r = await m.render('x', fixture(path));
  expect(r.warnings).toEqual([]);
  return drawn(r.svg);
}

describe('entity names in labels (#396, D559)', () => {
  it('a flowchart draws the punctuation names, and unknown names as written', async () => {
    expect(await render('flowchart/baseline/text/entity-names.mmd')).toEqual(
      expect.arrayContaining([
        'x : y ; $5 | ok',
        '(a) [b] {c}',
        '50% + tax',
        'unknown #bogus; stays',
        'typed &bogus; stays',
      ])
    );
  });

  it('a state diagram draws them in transition and state text', async () => {
    expect(await render('state-diagram-v2/baseline/text/entity-names.mmd')).toEqual(
      expect.arrayContaining(['foo: bar', 'unknown #bogus; stays', 'a ; b #1'])
    );
  });

  it('text output draws the same characters', async () => {
    const m = createMermaid();
    const r = await m.render('x', fixture('flowchart/baseline/text/entity-names.mmd'), {
      format: 'ascii',
    });
    for (const text of ['x : y ; $5 | ok', '(a) [b] {c}', '50% + tax', 'unknown #bogus;'])
      expect(r.text).toContain(text);
    expect(r.text).toContain('typed &bogus;');
  });
});
