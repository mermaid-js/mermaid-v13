import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';

/** An e2e flowchart fixture, `e2e/diagrams/flowchart/<path>.mmd`. */
const fixture = (path: string): string =>
  readFileSync(join(import.meta.dirname, '../../../e2e/diagrams/flowchart', `${path}.mmd`), 'utf8');

async function draw(text: string, config?: Record<string, unknown>) {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m.render('mermaid-0', text);
}

/** Each drawn `<text>` as its words and its number of lines (a wrapped line has its own `y`). */
const texts = (svg: string): { text: string; lines: number }[] =>
  [...svg.matchAll(/<text\b([^>]*)>(.*?)<\/text>/gs)].map((t) => ({
    text: t[2]!.replace(/<[^>]*>/g, ''),
    lines: Math.max(1, new Set(t[2]!.match(/<tspan\b[^>]*\sy="[^"]*"/g)).size),
  }));

describe('flowchart: ignored features warn (#357)', () => {
  it('raises one EDGE_ANIMATION_IGNORED per ignored feature, naming it', async () => {
    const { warnings } = await draw(fixture('pr-check/edge-animation-ignored'));
    const ignored = warnings.filter((w) => w.code === 'EDGE_ANIMATION_IGNORED');
    expect(ignored.map((w) => /`(animate|animation)`/.exec(w.message)?.[1]).sort()).toEqual([
      'animate',
      'animation',
    ]);
  });

  it('warns once however many edges use the feature', async () => {
    const { warnings } = await draw(
      fixture('nightly-check/classic/03-40-should-add-edge-animation')
    );
    expect(warnings.filter((w) => w.code === 'EDGE_ANIMATION_IGNORED')).toHaveLength(1);
  });

  it('does not warn when no edge is animated', async () => {
    const { warnings } = await draw('flowchart LR\n A --> B');
    expect(warnings.filter((w) => w.code === 'EDGE_ANIMATION_IGNORED')).toEqual([]);
  });
});

describe('flowchart: markdownAutoWrap (#357)', () => {
  const whole = 'a really long markdown label that would wrap at the default width of the diagram';
  const source = `flowchart TD\n A["\`${whole}\`"]`;

  it('wraps a markdown label by default', async () => {
    const { svg } = await draw(source);
    expect(texts(svg)[0]!.lines).toBeGreaterThan(1);
  });

  it('keeps a markdown label on one line when markdownAutoWrap is false', async () => {
    const { svg } = await draw(source, { markdownAutoWrap: false });
    expect(texts(svg)).toEqual([{ text: whole, lines: 1 }]);
  });

  it('keeps every markdown label of the fixture, edge labels included, on one line', async () => {
    const { svg } = await draw(
      fixture('nightly-check/v2/07-should-wrap-edge-labels-markdownautowrap-false-htmllabels-true')
    );
    const markdown = texts(svg).filter((t) => /markdown/i.test(t.text));
    expect(markdown.length).toBeGreaterThanOrEqual(2);
    expect(markdown.map((t) => t.lines)).toEqual(markdown.map(() => 1));
  });
});
