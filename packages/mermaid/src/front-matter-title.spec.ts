// The front-matter title is drawn above flowchart, class, state and ER diagrams as v12's
// `insertTitle` placed it, and where sequence's in-text `title` goes (#753, D652).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { corpusLabels, drawnRuns } from './testing/labels.ts';

const { fixture, textOf } = corpusLabels(readFileSync);

const CASES = [
  {
    path: 'flowchart/nightly-check/dagre/06-should-render-a-flowchart-with-title.mmd',
    section: 'flowchart',
    cls: 'flowchartTitleText',
    text: 'Test Title',
    size: '18',
  },
  {
    path: 'class-diagram/nightly-check/front-matter-title.mmd',
    section: 'class',
    cls: 'classDiagramTitleText',
    text: 'A class diagram title wider than the drawing',
    size: undefined,
  },
  {
    path: 'state-diagram-v2/nightly-check/1433-should-render-a-simple-state-diagram-with-a-title.mmd',
    section: 'state',
    cls: 'statediagramTitleText',
    text: 'simple',
    size: '18',
  },
  {
    path: 'er-diagram/baseline/accessibility.mmd',
    section: 'er',
    cls: 'erDiagramTitleText',
    text: 'Library',
    size: undefined,
  },
] as const;

async function render(path: string, config: Record<string, unknown> = {}) {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m.render('t', fixture(path));
}

/** The attributes of the one `<text>` with class `cls`, and the viewBox. */
function titleOf(svg: string, cls: string) {
  const tags = [...svg.matchAll(new RegExp(`<text class="${cls}"([^>]*)>([^<]*)</text>`, 'g'))];
  expect(tags).toHaveLength(1);
  const attrs = tags[0]![1]!;
  const attr = (name: string) => new RegExp(` ${name}="([^"]*)"`).exec(attrs)?.[1];
  const [vx, vy, vw] = (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);
  return {
    text: tags[0]![2],
    x: Number(attr('x')),
    y: Number(attr('y')),
    size: attr('font-size'),
    viewBox: { x: vx!, y: vy!, width: vw! },
  };
}

describe('the front-matter title in flowchart, class, state and ER (#753, D652)', () => {
  it.each(CASES)('$section draws it as $cls, its baseline titleTopMargin above', async (c) => {
    const { svg, warnings } = await render(c.path);
    expect(warnings).toEqual([]);
    const t = titleOf(svg, c.cls);
    expect(t.text).toBe(c.text);
    expect(t.size).toBe(c.size);
    // v12: `y = -titleTopMargin` (default 25), centred, inside a viewBox grown to hold it.
    expect(t.y).toBe(-25);
    expect(t.viewBox.y).toBeLessThan(-25 - 10);
    expect(t.x).toBeGreaterThan(t.viewBox.x);
    expect(t.x).toBeLessThan(t.viewBox.x + t.viewBox.width);
  });

  it.each(CASES)('$section honours $section.titleTopMargin', async (c) => {
    const { svg } = await render(c.path, { [c.section]: { titleTopMargin: 60 } });
    expect(titleOf(svg, c.cls).y).toBe(-60);
  });

  it('grows the viewBox on both sides for a title wider than the drawing', async () => {
    const t = titleOf((await render(CASES[1].path)).svg, CASES[1].cls);
    expect(t.viewBox.x).toBeLessThan(0);
    expect(t.x - t.viewBox.x).toBeCloseTo(t.viewBox.width / 2, 0);
  });

  it('does not name the diagram: the accessible name stays accTitle (D133)', async () => {
    const { svg } = await render(CASES[3].path);
    expect(svg).toContain('<title id="t-title">Library schema</title>');
  });
});

describe('the front-matter title in sequence (#753, D218, D652)', () => {
  it('is drawn as the in-text title when the text has none', async () => {
    const path = 'sequence/nightly-check/front-matter-title.mmd';
    const { svg, warnings } = await render(path);
    expect(warnings).toEqual([]);
    const stated = fixture(path).replace(
      'sequenceDiagram\n',
      'sequenceDiagram\n  title Checkout\n'
    );
    expect(svg).toContain('class="sequenceTitle"');
    expect(svg).toBe((await createMermaidWith(stated)).svg);
  });
});

// The title follows the label rule (#1368, #1406). YAML has removed one level of quotes, so the
// rule reads the string YAML gives: `'"`…`"'` is a markdown string, `"`…`"` is bare backticks.
// `plain` is what the default mode draws, `on` what `markdownAlwaysOn: true` draws, and `warns`
// whether the default mode gives `MARKDOWN_NOT_READ` (never with the setting on).
const WAYS = [
  {
    way: 'plain',
    yaml: `'T **bold** _ital_'`,
    plain: 'T **bold** _ital_',
    on: 'T <b>bold</b> <i>ital</i>',
    warns: true,
  },
  {
    way: 'markdown string',
    yaml: `'"\`T **bold** _ital_\`"'`,
    plain: 'T <b>bold</b> <i>ital</i>',
    on: 'T <b>bold</b> <i>ital</i>',
    warns: false,
  },
  {
    way: 'bare backticks',
    yaml: `"\`T **bold** _ital_\`"`,
    plain: '`T **bold** _ital_`',
    on: '<code>T **bold** _ital_</code>',
    warns: false,
  },
  {
    way: 'code span',
    yaml: `'T a \`code\` b'`,
    plain: 'T a `code` b',
    on: 'T a <code>code</code> b',
    warns: false,
  },
  {
    way: 'tags',
    yaml: `'T <b>bold</b> <i>ital</i><br>next H<sub>2</sub>O'`,
    plain: 'T <b>bold</b> <i>ital</i> / next H2O',
    on: 'T <b>bold</b> <i>ital</i> / next H2O',
    warns: false,
  },
  {
    way: 'written \\n',
    yaml: `'T one\\ntwo'`,
    plain: 'T one / two',
    on: 'T one / two',
    warns: false,
  },
  {
    way: 'block scalar',
    yaml: '|-\n  T one\n  two',
    plain: 'T one / two',
    on: 'T one / two',
    warns: false,
  },
  {
    way: 'markdown string with \\n and a tag',
    yaml: `'"\`T **bold**\\nnext <i>ital</i>\`"'`,
    plain: 'T <b>bold</b> / next <i>ital</i>',
    on: 'T <b>bold</b> / next <i>ital</i>',
    warns: false,
  },
] as const;

const BODIES = [
  {
    type: 'flowchart',
    section: 'flowchart',
    body: 'flowchart LR\n  A --> B\n',
    cls: 'flowchartTitleText',
  },
  { type: 'ER', section: 'er', body: 'erDiagram\n  A ||--o{ B : has\n', cls: 'erDiagramTitleText' },
] as const;

const codes = (warnings: readonly { code: string }[]): string[] => warnings.map((w) => w.code);

const firstLines = (text: string): string[] =>
  text
    .split('\n')
    .slice(0, 2)
    .map((l) => l.trim());

/** The drawn runs of the one `<text>` with class `cls`, its lines joined by ` / `. */
function titleRuns(svg: string, cls: string): string {
  const texts = [...svg.matchAll(new RegExp(`<text class="${cls}".*?</text>`, 'gs'))];
  expect(texts).toHaveLength(1);
  // Tag-drawn <sub>/<sup> runs carry a shift, not a style: read them as text.
  return drawnRuns(texts[0]![0]).join('');
}

describe('the front-matter title follows the label rule (#1368, #1406)', () => {
  const cases = BODIES.flatMap((b) => WAYS.map((w) => ({ ...b, ...w })));
  it.each(cases)('$type: $way, in the default mode', async (c) => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const { svg, warnings } = await m.render('t', `---\ntitle: ${c.yaml}\n---\n${c.body}`);
    expect(codes(warnings)).toEqual(c.warns ? [MARKDOWN_NOT_READ.code] : []);
    expect(titleRuns(svg, c.cls)).toBe(c.plain);
  });

  it.each(cases)('$type: $way, with markdownAlwaysOn globally and in its section', async (c) => {
    const settings = [{ markdownAlwaysOn: true }, { [c.section]: { markdownAlwaysOn: true } }];
    for (const setting of settings) {
      const m = createMermaid();
      m.initialize({ deterministic: true, ...setting });
      const { svg, warnings } = await m.render('t', `---\ntitle: ${c.yaml}\n---\n${c.body}`);
      expect(warnings, JSON.stringify(setting)).toEqual([]);
      expect(titleRuns(svg, c.cls), JSON.stringify(setting)).toBe(c.on);
    }
  });

  it('prints the drawn words in text output, a line for each drawn line', async () => {
    const plain = await textOf('conf-and-directives/pr-check/label-syntax-title.mmd');
    expect(codes(plain.warnings)).toEqual([MARKDOWN_NOT_READ.code]);
    expect(firstLines(plain.text)).toEqual(['Title **bold** _ital_', 'next tag H2O']);
    const on = await textOf('conf-and-directives/pr-check/label-syntax-title-compat.mmd');
    expect(on.warnings).toEqual([]);
    expect(firstLines(on.text)).toEqual(['Title bold ital', 'next tag H2O']);
  });
});

async function createMermaidWith(text: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m.render('t', text);
}
