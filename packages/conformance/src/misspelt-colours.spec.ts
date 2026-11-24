/**
 * #1195: a misspelt colour in a `style`, `classDef`, `linkStyle` or `todayMarker` statement is
 * ignored with `STYLE_VALUE_DROPPED`, in every type that has one of them. One corpus fixture per
 * type is rendered through `render()` as written and again with its style colours misspelt; the
 * misspelt colour must not reach the SVG. c4-beta has its own check (`c4beta/style-colours.spec.ts`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMermaid, type InitializeConfig } from 'mermaid';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { REPO_ROOT } from './corpus.ts';

const DIAGRAMS = join(REPO_ROOT, 'e2e/diagrams');

const FIXTURES = {
  agentflow: 'agentflow/baseline/palette/style-beats-the-palette.mmd',
  block: 'block/nightly-check/should-style-statements-and-class-statements.mmd',
  class:
    'class-diagram/nightly-check/should-render-a-simple-class-diagram-with-style-definition.mmd',
  er: 'er-diagram/baseline/styles.mmd',
  flowchart: 'flowchart/visual-check/13-should-render-color-of-styled-nodes.mmd',
  gantt: 'gantt/nightly-check/should-style-today-marker.mmd',
  requirement:
    'requirement/nightly-check/requirements-with-styles-applied-from-style-statement-neo-look-redux-dark-theme.mmd',
  state:
    'state-diagram-v2/nightly-check/v2-can-have-multiple-classes-applied-to-multiple-states.mmd',
  swimlane: 'swimlanes/pr-check/style-and-linkstyle-statements.mmd',
  treemap: 'treemap/nightly-check/12-should-apply-classdef-fill-color-to-leaf-nodes.mmd',
  usecase: 'usecase/nightly-check/07-edge-styles-and-animation.mmd',
  venn: 'venn/nightly-check/13-should-render-a-complex-venn-with-labels-text-nodes-and-styles.mmd',
} as const;

const RE_STATEMENT = /^\s*(?:style|classDef|linkStyle|todayMarker)\b.*$/gm;
const RE_COLOUR = /\b(fill|stroke|color)(\s*:\s*)(?:#\w+|\w+(?:\([^)]*\))?)/g;

/** `source` with every colour of its style statements replaced by `colour`. */
const recoloured = (source: string, colour: string): string =>
  source.replace(RE_STATEMENT, (line) => line.replace(RE_COLOUR, `$1$2${colour}`));

async function render(source: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true } as InitializeConfig);
  const r = await m.render('misspelt', source);
  return { svg: r.svg, dropped: r.warnings.filter((w) => w.code === 'STYLE_VALUE_DROPPED') };
}

// The gantt fixture's today marker is drawn on its own dates only.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('1010-10-10') });
});
afterAll(() => {
  vi.useRealTimers();
});

describe.each(Object.entries(FIXTURES))('#1195: misspelt style colours in %s', (_type, file) => {
  const source = readFileSync(join(DIAGRAMS, file), 'utf8');

  it('draws a spelt colour, without a warning', async () => {
    const { svg, dropped } = await render(recoloured(source, 'rebeccapurple'));
    expect(svg).toContain('rebeccapurple');
    expect(dropped).toEqual([]);
  });

  it.each(['rebeccapurpel', '#12345'])('ignores %s, with a warning', async (colour) => {
    const { svg, dropped } = await render(recoloured(source, colour));
    expect(svg).not.toContain(colour);
    expect(dropped[0]?.message).toContain(JSON.stringify(colour));
  });
});
