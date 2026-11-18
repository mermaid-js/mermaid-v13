import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';

/** An e2e flowchart fixture, `e2e/diagrams/flowchart/<path>.mmd`. */
const fixture = (path: string): string =>
  readFileSync(join(REPO_ROOT, 'e2e/diagrams/flowchart', `${path}.mmd`), 'utf8');

const mermaid = () => {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m;
};

const draw = (text: string) => mermaid().render('mermaid-0', text);

/** `prepare()` then `renderSync()`, the path a host that lays out first takes. */
async function drawPrepared(text: string) {
  const m = mermaid();
  await m.prepare(text);
  return m.renderSync(text);
}

/** Each drawn `<text>` as its words and its number of lines (a wrapped line has its own `y`). */
const texts = (svg: string): { text: string; lines: number }[] =>
  [...svg.matchAll(/<text\b([^>]*)>(.*?)<\/text>/gs)].map((t) => ({
    text: t[2]!.replace(/<[^>]*>/g, ''),
    lines: Math.max(1, new Set(t[2]!.match(/<tspan\b[^>]*\sy="[^"]*"/g)).size),
  }));

const ANIMATION = 'pr-check/edge-animation';

/** Each edge group of `svg`, by its `data-id`: its `<animate>` and its line's start tag. */
const edges = (svg: string): Map<string, { animate?: string; line: string }> =>
  new Map(
    [...svg.matchAll(/<g class="edge [^>]*data-id="([^"]*)"[^>]*>(.*?)<\/g>/gs)].map((g) => [
      g[1]!,
      { animate: /<animate\b[^>]*>/.exec(g[2]!)?.[0], line: /<path\b[^>]*>/.exec(g[2]!)![0] },
    ])
  );

const animate = (seconds: number): string =>
  `<animate attributeName="stroke-dashoffset" from="900" to="0" dur="${seconds}" repeatCount="indefinite"/>`;

describe('flowchart: edge animation (#918, D606)', () => {
  it('animates an edge with animate or animation as v12 did: fast in 20 s, slow in 50 s', async () => {
    const { svg } = await draw(fixture(ANIMATION));
    const drawn = edges(svg);
    expect(drawn.get('e1')?.animate).toBe(animate(20));
    expect(drawn.get('e2')?.animate).toBe(animate(20));
    expect(drawn.get('e3')?.animate).toBe(animate(50));
  });

  it("gives the animated line v12's 9,5 dashes with round caps, a dotted one too", async () => {
    const { svg } = await draw(fixture(ANIMATION));
    for (const id of ['e1', 'e2', 'e3']) {
      const { line } = edges(svg).get(id)!;
      expect(line, id).toContain('stroke-dasharray="9,5"');
      expect(line, id).not.toContain('stroke-linecap');
    }
  });

  it('leaves an edge without the metadata still', async () => {
    const { svg } = await draw(fixture(ANIMATION));
    const still = [...edges(svg)].filter(([id]) => !/^e\d$/.test(id));
    expect(still).toHaveLength(1);
    expect(still[0]![1].animate).toBeUndefined();
    expect(still[0]![1].line).not.toContain('stroke-dasharray');
    expect(svg.match(/<animate\b/g)).toHaveLength(3);
  });

  it('draws the same through prepare() and renderSync()', async () => {
    const text = fixture(ANIMATION);
    expect((await drawPrepared(text)).svg).toBe((await draw(text)).svg);
  });

  it('no longer warns that the animation is ignored, and writes no style sheet', async () => {
    const { svg, warnings } = await draw(fixture(ANIMATION));
    expect(warnings.filter((w) => w.code === 'EDGE_ANIMATION_IGNORED')).toEqual([]);
    expect(svg).not.toContain('<style');
  });

  it("replaces a linkStyle dash pattern on an animated edge, as v12's !important did", async () => {
    const { svg } = await draw(fixture('nightly-check/classic/03-40-should-add-edge-animation'));
    const animated = [...edges(svg).values()].filter((e) => e.animate);
    expect(animated.map((e) => e.animate).sort()).toEqual([animate(20), animate(50)]);
    for (const e of animated) expect(e.line).toContain('stroke-dasharray="9,5"');
  });
});

describe('flowchart: markdownAutoWrap (#357)', () => {
  // The two fixtures have the same labels; only `markdownAutoWrap` differs (true, false).
  const wrapped = fixture(
    'nightly-check/v2/05-should-wrap-edge-labels-markdownautowrap-true-htmllabels-true'
  );
  const unwrapped = fixture(
    'nightly-check/v2/07-should-wrap-edge-labels-markdownautowrap-false-htmllabels-true'
  );
  const markdown = (svg: string) => texts(svg).filter((t) => /markdown/i.test(t.text));

  it('wraps a markdown label by default', async () => {
    const lines = markdown((await draw(wrapped)).svg).map((t) => t.lines);
    expect(Math.max(...lines)).toBeGreaterThan(1);
  });

  it('keeps every markdown label, edge labels included, on one line when false', async () => {
    const lines = markdown((await draw(unwrapped)).svg).map((t) => t.lines);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines).toEqual(lines.map(() => 1));
  });

  it('keeps the explicit line breaks of the visual-check fixture', async () => {
    const { svg } = await draw(
      fixture('visual-check/should-not-auto-wrap-when-markdownautowrap-is-false')
    );
    const node = texts(svg).find((t) => t.text.includes('angular_velocity'));
    expect(node?.lines).toBe(4);
  });
});
