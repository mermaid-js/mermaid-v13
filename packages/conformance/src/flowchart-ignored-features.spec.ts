import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';

/** An e2e flowchart fixture, `e2e/diagrams/flowchart/<path>.mmd`. */
const fixture = (path: string): string =>
  readFileSync(join(import.meta.dirname, '../../../e2e/diagrams/flowchart', `${path}.mmd`), 'utf8');

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

const ANIMATION = 'pr-check/edge-animation-ignored';
const features = (warnings: readonly { code: string; message: string }[]): (string | undefined)[] =>
  warnings
    .filter((w) => w.code === 'EDGE_ANIMATION_IGNORED')
    .map((w) => /`(animate|animation)`/.exec(w.message)?.[1])
    .sort();

describe('flowchart: ignored features warn (#357)', () => {
  it('raises one EDGE_ANIMATION_IGNORED per ignored feature, naming it', async () => {
    const { warnings } = await draw(fixture(ANIMATION));
    expect(features(warnings)).toEqual(['animate', 'animation']);
  });

  it('raises the same through prepare() and renderSync()', async () => {
    const { warnings } = await drawPrepared(fixture(ANIMATION));
    expect(features(warnings)).toEqual(['animate', 'animation']);
  });

  it('warns once however many edges use the feature', async () => {
    const { warnings } = await draw(
      fixture('nightly-check/classic/03-40-should-add-edge-animation')
    );
    expect(features(warnings)).toEqual(['animation']);
  });

  it('does not warn when no edge is animated', async () => {
    const { warnings } = await draw(fixture('pr-check/4-classdef-style'));
    expect(features(warnings)).toEqual([]);
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
