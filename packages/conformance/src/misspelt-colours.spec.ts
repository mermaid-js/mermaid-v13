/**
 * #1195: a misspelt colour in a `style`, `classDef`, `linkStyle` or `todayMarker` statement is
 * ignored with `STYLE_VALUE_DROPPED`, in every type that has one of them. One corpus fixture per
 * type is rendered through `render()` as written and again with its style colours misspelt; the
 * misspelt colour must not reach the SVG. c4-beta has its own check (`c4beta/style-colours.spec.ts`).
 *
 * The second half does the same for the colours an author gives outside those statements: a
 * sequence `rect`, legacy C4's `Update…Style`, config colours and `themeVariables` (D690).
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

/** Fixtures whose every class is used once. */
const CLASS_FIXTURES = {
  agentflow: 'agentflow/baseline/palette/style-beats-the-palette.mmd',
  er: 'er-diagram/baseline/styles.mmd',
  flowchart: 'flowchart/pr-check/4-classdef-style.mmd',
  swimlane: 'swimlanes/pr-check/classdef-and-class-statements.mmd',
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
  return {
    svg: r.svg,
    warnings: r.warnings,
    dropped: r.warnings.filter((w) => w.code === 'STYLE_VALUE_DROPPED'),
  };
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

describe('#1195: a misspelt `color` of a classDef', () => {
  it.each(['agentflow', 'er', 'flowchart', 'swimlane'] as const)(
    'warns once in %s',
    async (type) => {
      const source = readFileSync(join(DIAGRAMS, CLASS_FIXTURES[type]), 'utf8');
      // A misspelling of its own for each class, as equal styles are checked once.
      const misspelt = source.replace(/^(\s*classDef\s+(\w+)\s+).*$/gm, '$1color:rebeccapurpel$2');
      const { dropped, svg } = await render(misspelt);
      expect(svg).not.toContain('rebeccapurpel');
      expect(dropped.map((w) => /"(\w+)"/.exec(w.message)![1]).sort()).toEqual(
        misspelt.match(/rebeccapurpel\w+/g)!.sort()
      );
    }
  );
});

/** One corpus fixture per way to give a colour outside a style statement, and its warning. */
const AUTHOR_FIXTURES = {
  'a sequence rect': [
    'sequence/nightly-check/should-render-a-single-and-nested-rects.mmd',
    'STYLE_VALUE_DROPPED',
  ],
  'C4 Update…Style and boundary colours': [
    'c4/baseline/styles/update-styles.mmd',
    'C4_COLOR_INVALID',
  ],
  'journey config': ['journey/baseline/config/colours.mmd', 'STYLE_VALUE_DROPPED'],
  'sankey config': ['sankey/baseline/config/values-hidden-colours.mmd', 'SANKEY_COLOR_INVALID'],
  'railroad config': ['railroad/nightly-check/ir-railroad-config.mmd', 'RAILROAD_CONFIG_INVALID'],
  themeVariables: ['swimlanes/pr-check/custom-theme-variables.mmd', 'THEME_VARIABLE_DROPPED'],
} as const;

describe.each(Object.entries(AUTHOR_FIXTURES))(
  'D690: misspelt colours in %s',
  (_, [file, code]) => {
    const source = readFileSync(join(DIAGRAMS, file), 'utf8');
    /** `source` with every quoted hex colour and every `rgb()` replaced by `colour`. */
    const given = (colour: string): string =>
      source.replace(
        /(['"])#[\da-f]{6}\1|rgb\([^)]*\)/gi,
        (_m, quote = '') => quote + colour + quote
      );

    it('draws a spelt colour, without a warning', async () => {
      const { svg, warnings } = await render(given('rebeccapurple'));
      expect(svg).toContain('rebeccapurple');
      expect(warnings.filter((w) => w.code === code)).toEqual([]);
    });

    it('ignores a misspelt one, with a warning', async () => {
      const { svg, warnings } = await render(given('rebeccapurpel'));
      expect(svg).not.toContain('rebeccapurpel');
      const warned = warnings.find((w) => w.code === code);
      expect(warned?.message).toContain('"rebeccapurpel"');
    });

    // `#` starts a comment in a sequence diagram.
    it.skipIf(file.startsWith('sequence/'))('ignores a malformed hex colour', async () => {
      const { svg, warnings } = await render(given('#12345'));
      expect(svg).not.toContain('#12345"');
      expect(svg).not.toContain('#12345)');
      expect(warnings.some((w) => w.code === code && w.message.includes('"#12345"'))).toBe(true);
    });
  }
);
