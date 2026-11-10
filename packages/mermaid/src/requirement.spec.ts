import { describe, expect, it } from 'vitest';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import { LimitError } from '@mermaid-js/core/limits';
import { assertInert } from '@mermaid-js/core/svg';
import { requirement } from '@mermaid-js/diagram-requirement';
import { createMermaid, MermaidError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The requirement diagram is a first-party type (#587): `requirementDiagram` (and v12's bare
// `requirement`) goes to `@mermaid-js/diagram-requirement` through the generated registry,
// between `pie` and `sequence`, as in v12's detector order.
const TEXT = [
  'requirementDiagram',
  '  requirement test_req {',
  '    id: 1',
  '    text: the test text.',
  '    risk: high',
  '    verifymethod: test',
  '  }',
  '  element test_entity {',
  '    type: simulation',
  '  }',
  '  test_entity - satisfies -> test_req',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const conf = (yaml: string, text = TEXT): string =>
  `---\nconfig:\n  requirement:\n    ${yaml}\n---\n${text}`;
/** The first box's outline tag. */
const box = (svg: string): string | undefined =>
  /<rect [^>]*class="basic label-container outer-path"[^>]*>/.exec(svg)?.[0];

describe('requirement diagrams through the public API (#587)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('r1', TEXT);
    expect(result.diagramType).toBe('requirement');
    expect(result.svg).toContain('aria-roledescription="requirement"');
    expect(result.svg).toContain('class="mermaid mermaid-requirement requirementDiagram"');
    expect(result.svg.match(/<g class="node default[^"]*"/g)).toHaveLength(2);
    expect(result.svg).toContain('data-ast="requirement:test_req"');
    expect(result.svg).toContain('data-ast="element:test_entity"');
    expect(result.svg.match(/class="[^"]*relationshipLine"/g)).toHaveLength(1);
    expect(result.svg).toContain('&lt;&lt;satisfies&gt;&gt;');
    expect(result.svg).not.toContain('foreignObject');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders through mermaid/slim, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [requirement] });
    expect((await slim.render('r2', TEXT)).svg).toBe(
      (await createMermaid().render('r2', TEXT)).svg
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('requirement');
  });

  it('keeps v12’s detector pattern and place, between pie and sequence', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('requirement')).toBe(types.indexOf('pie') + 1);
    expect(types.indexOf('sequence')).toBe(types.indexOf('requirement') + 1);
    const m = createMermaid();
    // Case-sensitive, with no word boundary, as v12's `/^\s*requirement(Diagram)?/`.
    expect(m.detectType('  requirementDiagram\n')).toBe('requirement');
    expect(m.detectType('requirement\n')).toBe('requirement');
    expect(m.detectType('requirementsx\n')).toBe('requirement');
    expect(() => m.detectType('RequirementDiagram\n')).toThrow();
  });

  it('rejects what v12 rejects with SYNTAX', async () => {
    const m = createMermaid();
    const texts = [
      'requirementDiagram\n  requirement a {\n    risk: huge\n  }\n',
      'requirementDiagram\n  a -> b\n',
    ];
    for (const text of texts) {
      const e = await rejection(m.render('r3', text));
      expect(e, text).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, text).toBe('SYNTAX');
    }
  });

  it('draws in redux-color, v12’s requirement.theme default, when no theme is set', async () => {
    const plain = await createMermaid().render('r4', TEXT);
    const m = createMermaid();
    m.initialize({ theme: 'redux-color' });
    expect((await m.render('r4', TEXT)).svg).toBe(plain.svg);
    const classic = createMermaid();
    classic.initialize({ theme: 'default' });
    const drawn = (await classic.render('r4', TEXT)).svg;
    expect(box(drawn)).not.toBe(box(plain.svg));
    // A requirement-scoped theme beats the top level in its layer.
    const scoped = createMermaid();
    scoped.initialize({ theme: 'redux-color', requirement: { theme: 'default' } });
    expect((await scoped.render('r4', TEXT)).svg).toBe(drawn);
  });

  it('honours requirement.useMaxWidth, where v12 read state.useMaxWidth', async () => {
    const m = createMermaid();
    const plain = (await m.render('r5', TEXT)).svg;
    expect(plain).toContain('max-width');
    const fixed = (await m.render('r5', conf('useMaxWidth: false'))).svg;
    expect(fixed).not.toContain('max-width');
    const state = `---\nconfig:\n  state:\n    useMaxWidth: false\n---\n${TEXT}`;
    expect((await m.render('r5', state)).svg).toBe(plain);
  });

  it('honours requirement.layout, defaulting to layered (D127)', async () => {
    let calls = 0;
    const elk: LayoutEngine = (graph, ctx) => {
      calls++;
      return layered(graph, ctx);
    };
    const m = createMermaid();
    m.registerLayoutLoaders([{ name: 'elk', loader: () => Promise.resolve(elk) }]);
    await m.render('r6', TEXT);
    expect(calls).toBe(0);
    await m.render('r6', conf('layout: elk'));
    expect(calls).toBe(1);
  });

  it('ignores v12’s box keys and useWidth, without a warning', async () => {
    const m = createMermaid();
    const base = (await m.render('r7', TEXT)).svg;
    const keys = [
      'useWidth: 99',
      'rect_fill: "#ff0000"',
      'text_color: "#00ff00"',
      'rect_border_size: 5px',
      'rect_border_color: "#0000ff"',
      'rect_min_width: 900',
      'rect_min_height: 900',
      'fontSize: 40',
      'rect_padding: 90',
      'line_height: 90',
    ];
    for (const key of keys) {
      const r = await m.render('r7', conf(key));
      expect(r.svg, key).toBe(base);
      expect(r.warnings, key).toEqual([]);
    }
  });

  it('supports ascii (#588, D320, D438): boxes with a divider, a labelled line, ► at the target', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    expect(m.supportsFormat('requirement', 'svg')).toBe(true);
    expect(m.supportsFormat('requirement', 'ascii')).toBe(true);
    const out = await m.render('r8', TEXT, { format: 'ascii' });
    expect(out).toMatchObject({ format: 'ascii', diagramType: 'requirement', warnings: [] });
    expect(out.text).toBe(
      [
        '  ┌──────────────────┐',
        '  │   <<Element>>    │',
        '  │   test_entity    │',
        '  ├──────────────────┤',
        '  │ Type: simulation │',
        '  └─────────┬────────┘',
        '            ┆',
        '            ┆',
        '            ┆',
        '      <<satisfies>>',
        '            ┆',
        '            ┆',
        '            ▼',
        '┌──────────────────────┐',
        '│   <<Requirement>>    │',
        '│       test_req       │',
        '├──────────────────────┤',
        '│ ID: 1                │',
        '│ Text: the test text. │',
        '│ Risk: High           │',
        '│ Verification: Test   │',
        '└──────────────────────┘',
      ].join('\n')
    );
  });

  it('marks contains with ⊕ at the source, (+) in the ascii charset (D438)', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const src = 'requirementDiagram\n  element a {\n  }\n  element b {\n  }\n  a - contains -> b\n';
    const at = async (charset: 'unicode' | 'ascii') =>
      (await m.render('r8c', src, { format: 'ascii', ascii: { charset } })).text.split('\n');
    const unicode = await at('unicode');
    expect(unicode.slice(3, 6)).toEqual(['└──────┬──────┘', '       ⊕', '       │']);
    const ascii = await at('ascii');
    expect(ascii.slice(3, 6)).toEqual(['+------+------+', '      (+)', '       |']);
    expect(ascii.join('\n')).not.toMatch(/[^\x20-\x7e\n]/);
  });

  it('cuts a value to 40 columns with …, ~ in the ascii charset (D438)', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const src = `requirementDiagram\n  requirement r {\n    text: ${'x'.repeat(50)}\n  }\n`;
    const line = async (charset: 'unicode' | 'ascii') =>
      (await m.render('r8v', src, { format: 'ascii', ascii: { charset } })).text
        .split('\n')
        .find((l) => l.includes('Text:'));
    expect(await line('unicode')).toBe(`│ Text: ${'x'.repeat(39)}… │`);
    expect(await line('ascii')).toBe(`| Text: ${'x'.repeat(39)}~ |`);
  });

  it('cuts each line of a multi-line value at 40 value cells, continuation lines from their start (D438)', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const src = `requirementDiagram\n  requirement r {\n    text: "a<br>${'y'.repeat(50)}"\n  }\n`;
    const body = async (charset: 'unicode' | 'ascii') => {
      const rows = (await m.render('r8m', src, { format: 'ascii', ascii: { charset } })).text.split(
        '\n'
      );
      const at = rows.findIndex((l) => l.includes('Text:'));
      return rows.slice(at, at + 2);
    };
    // The box is as wide as its widest shown line: `Text: a` is shorter than the cut `y…` line.
    expect(await body('unicode')).toEqual([
      `│ Text: a${' '.repeat(33)} │`,
      `│ ${'y'.repeat(39)}… │`,
    ]);
    expect(await body('ascii')).toEqual([`| Text: a${' '.repeat(33)} |`, `| ${'y'.repeat(39)}~ |`]);
  });

  it('is never cropped: wider than ascii.maxWidth warns ASCII_TOO_WIDE (R-ASCII-8)', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const at = async (maxWidth?: number) => {
      const ascii = maxWidth === undefined ? {} : { maxWidth };
      const out = await m.render('r8w', TEXT, { format: 'ascii', ascii });
      return { columns: out.columns, codes: out.warnings.map((w) => w.code) };
    };
    const whole = await at();
    expect(await at(whole.columns)).toEqual({ columns: whole.columns, codes: [] });
    expect(await at(10)).toEqual({ columns: whole.columns, codes: ['ASCII_TOO_WIDE'] });
  });

  it('drops styles and accessibility text, one ASCII_DROPPED warning each (R-ASCII-5)', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const src = [
      'requirementDiagram',
      '  accTitle: T',
      '  element a {',
      '  }',
      '  classDef hot fill:#f00',
      '  class a hot',
      '  style a stroke:#00f',
      '',
    ].join('\n');
    const out = await m.render('r8d', src, { format: 'ascii' });
    expect(out.warnings.map((w) => [w.code, (w as { feature?: string }).feature])).toEqual([
      ['ASCII_DROPPED', 'style'],
      ['ASCII_DROPPED', 'accessibility'],
    ]);
  });

  it('warns once that a flowchart.curve other than a step is drawn square (pitfall 22)', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const codes = async (curve: 'basis' | 'step') => {
      const config = { flowchart: { curve } };
      const out = await m.render('r8k', TEXT, { format: 'ascii', config });
      return out.warnings.map((w) => [w.code, (w as { feature?: string }).feature]);
    };
    expect(await codes('basis')).toEqual([['ASCII_DROPPED', 'curve']]);
    expect(await codes('step')).toEqual([]);
  });

  it('renders text with renderSync once prepare has loaded the ascii entry', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    await m.prepare(TEXT, { format: 'ascii' });
    const sync = m.renderSync(TEXT, { format: 'ascii' });
    expect(sync.text).toBe((await m.render('r8s', TEXT, { format: 'ascii' })).text);
  });
});

describe('requirement limits and warnings through render() (D433, D434)', () => {
  it('ends past the style-copy cap in a LIMIT MermaidError (maxLayoutWork)', async () => {
    const ids = Array.from({ length: 1001 }, () => 'a').join(',');
    const classes = Array.from({ length: 1000 }, () => 'c').join(',');
    const text = `requirementDiagram\nrequirement a {\n}\nclass ${ids} ${classes}\n`;
    const e = await rejection(createMermaid().render('r9', text));
    expect(e).toBeInstanceOf(MermaidError);
    expect(e).toMatchObject({ code: 'LIMIT', limit: 'maxLayoutWork' });
    const cause = (e as MermaidError).cause;
    expect(cause).toBeInstanceOf(LimitError);
    expect(cause).toMatchObject({ max: 1_000_000, found: 1_000_001 });
  });

  it('reports each D433/D434 warning once, with its AST ids', async () => {
    const text = [
      'requirementDiagram',
      'style a fill:red',
      'requirement a {',
      '}',
      'requirement a {',
      '}',
      'element b {',
      '}',
      'requirement b {',
      '}',
      'a - traces -> x',
      '',
    ].join('\n');
    const r = await createMermaid().render('r10', text);
    const byCode = (code: string) => r.warnings.filter((w) => w.code === code);
    expect(byCode('REQUIREMENT_STYLE_DROPPED').map((w) => w.astIds)).toEqual([['style:1']]);
    expect(byCode('REQUIREMENT_DUPLICATE').map((w) => w.astIds)).toEqual([['requirement:a@2']]);
    expect(byCode('REQUIREMENT_UNKNOWN_NODE').map((w) => w.astIds)).toEqual([['relation:a->x']]);
    expect(byCode('REQUIREMENT_SHARED_NAME').map((w) => w.astIds)).toEqual([['requirement:b']]);
    expect(r.warnings).toHaveLength(4);
  });
});
