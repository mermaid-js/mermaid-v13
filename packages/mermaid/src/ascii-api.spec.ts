import { describe, expect, it } from 'vitest';
import { createMermaid, MermaidError, NotLoadedError, UnsupportedFormatError } from './index.ts';

const FLOW = 'flowchart LR\n  A[Start] --> B(End)\n';

function thrown(f: () => unknown): MermaidError {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(MermaidError);
    return e as MermaidError;
  }
  throw new Error('expected a throw');
}

describe("format: 'ascii' (R-ASCII-4, D80)", () => {
  it('renderSync after prepare returns a TextRenderResult', async () => {
    const m = createMermaid();
    await m.prepare(FLOW, { format: 'ascii' });
    const r = m.renderSync(FLOW, { format: 'ascii' });
    expect(r.format).toBe('ascii');
    expect(r.diagramType).toBe('flowchart-v2');
    expect(r.warnings).toEqual([]);
    expect(r.text).toBe(
      ['┌───────┐      ╭─────╮', '│ Start ├─────►│ End │', '└───────┘      ╰─────╯'].join('\n')
    );
    expect(r.columns).toBe(22);
    expect(r.rows).toBe(3);
    expect(r).not.toHaveProperty('svg');
  });
});

describe('render with an options object (D80)', () => {
  it("draws text for { format: 'ascii' } and keeps v12's element argument for SVG", async () => {
    const m = createMermaid();
    const text = await m.render('t1', FLOW, { format: 'ascii' });
    expect(text.format).toBe('ascii');
    expect(text.text).toContain('│ Start ├');
    const element = { nodeType: 1, tagName: 'DIV' } as unknown as Element;
    const svg = await m.render('t1', FLOW, element);
    expect(svg.svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toHaveProperty('format');
  });

  it('applies the per-call config of the options object', async () => {
    const m = createMermaid();
    const r = await m.render('t2', FLOW, {
      format: 'ascii',
      config: { ascii: { charset: 'ascii' } },
    });
    expect(r.text).toContain('| Start +');
  });

  it('is byte-deterministic', async () => {
    const m = createMermaid();
    const src =
      'flowchart TB\n  A --> B & C\n  B --> D\n  C --> D\n  subgraph s [Group]\n    D\n  end';
    const a = (await m.render('x', src, { format: 'ascii' })).text;
    const b = (await createMermaid().render('x', src, { format: 'ascii' })).text;
    expect(a).toBe(b);
    expect(a.split('\n').every((l) => l === l.trimEnd())).toBe(true);
    expect(a).not.toContain('\r');
  });
});

describe('formats and loading (R-ASCII-5, D80)', () => {
  const tiny = (formats: readonly ('svg' | 'ascii')[]) => ({
    id: 'tiny',
    layoutKind: 'custom' as const,
    formats,
    detector: (t: string) => t.trimStart().startsWith('tiny'),
    parse: (text: string) => ({
      model: text,
      ast: { id: 't', type: 'Tiny', range: { start: 0, end: text.length } },
      diagnostics: [],
      symbols: [],
      statements: [],
    }),
    render: () => undefined,
  });

  it('throws UnsupportedFormatError from prepare and renderSync for an svg-only type', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([tiny(['svg'])]);
    expect(m.supportsFormat('tiny', 'ascii')).toBe(false);
    const e = await m.prepare('tiny', { format: 'ascii' }).then(
      () => undefined,
      (x: unknown) => x
    );
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('tiny');
    const s = thrown(() => m.renderSync('tiny', { format: 'ascii' }));
    expect(s).toBeInstanceOf(UnsupportedFormatError);
    expect(s.code).toBe('UNSUPPORTED_FORMAT');
  });

  it('draws a type that carries its own ascii hook', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([{ ...tiny(['svg', 'ascii']), ascii: () => '[tiny]' }]);
    const r = await m.render('t', 'tiny', { format: 'ascii' });
    expect(r).toMatchObject({ text: '[tiny]', columns: 6, rows: 1, diagramType: 'tiny' });
  });

  it('throws NotLoadedError from renderSync until prepare loads the ascii entry', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart-v2'] });
    expect(m.renderSync(FLOW).svg).toContain('<svg');
    const e = thrown(() => m.renderSync(FLOW, { format: 'ascii' }));
    expect(e).toBeInstanceOf(NotLoadedError);
    expect((e as NotLoadedError).missing).toEqual([{ kind: 'diagram', name: 'flowchart/ascii' }]);
    await m.prepare(FLOW, { format: 'ascii' });
    expect(m.renderSync(FLOW, { format: 'ascii' }).rows).toBe(3);
  });

  it('needs no theme for text: a theme that is not loaded does not block it', async () => {
    const m = createMermaid();
    const src = '---\nconfig:\n  theme: forest\n---\nflowchart LR\n  A --> B';
    await m.prepare(FLOW, { format: 'ascii' });
    expect(m.renderSync(src, { format: 'ascii' }).text).toContain('│ A ├');
  });

  it('keeps syntax errors the same MermaidError as for SVG', async () => {
    const m = createMermaid();
    const e = await m.render('e', 'flowchart LR\n  A -->', { format: 'ascii' }).then(
      () => undefined,
      (x: unknown) => x
    );
    expect((e as MermaidError).code).toBe('SYNTAX');
  });
});

describe('ascii config precedence (DESIGN §6.3)', () => {
  const ASCII_BOX = '| Start +';
  const UNICODE_BOX = '│ Start ├';
  const fm = (charset: string) => `---\nconfig:\n  ascii:\n    charset: ${charset}\n---\n${FLOW}`;

  it('defaults to unicode and compact', async () => {
    const r = await createMermaid().render('c', FLOW, { format: 'ascii' });
    expect(r.text).toContain(UNICODE_BOX);
    expect(r.rows).toBe(3);
  });

  it('reads initialize, then front matter, then directives', async () => {
    const m = createMermaid();
    m.initialize({ ascii: { charset: 'ascii' } });
    expect((await m.render('c', FLOW, { format: 'ascii' })).text).toContain(ASCII_BOX);
    expect((await m.render('c', fm('unicode'), { format: 'ascii' })).text).toContain(UNICODE_BOX);
    const directive = fm('unicode').replace(
      FLOW,
      `%%{init: {"ascii": {"charset": "ascii"}}}%%\n${FLOW}`
    );
    expect((await m.render('c', directive, { format: 'ascii' })).text).toContain(ASCII_BOX);
  });

  it('puts explicit text options (options.ascii) over the diagram text, key by key', async () => {
    const m = createMermaid();
    const text = fm('unicode').replace(
      '    charset: unicode',
      '    charset: unicode\n    padding: roomy'
    );
    const r = await m.render('c', text, { format: 'ascii', ascii: { charset: 'ascii' } });
    expect(r.text).toContain(ASCII_BOX);
    // The diagram's own padding still applies: only charset was given.
    expect(r.rows).toBe(5);
    const narrow = `---\nconfig:\n  ascii:\n    maxWidth: 5\n---\n${FLOW}`;
    const wide = await m.render('c', narrow, { format: 'ascii', ascii: { maxWidth: 80 } });
    expect(wide.warnings).toEqual([]);
  });

  it('lets diagram text set padding and maxWidth', async () => {
    const roomy = `---\nconfig:\n  ascii:\n    padding: roomy\n---\n${FLOW}`;
    const r = await createMermaid().render('c', roomy, { format: 'ascii' });
    expect(r.rows).toBe(5);
    const narrow = `---\nconfig:\n  ascii:\n    maxWidth: 5\n---\n${FLOW}`;
    const n = await createMermaid().render('c', narrow, { format: 'ascii' });
    expect(n.warnings.map((w) => w.code)).toContain('ASCII_TOO_WIDE');
  });
});

describe('ascii.maxWidth (R-ASCII-8, D84)', () => {
  const chain =
    'flowchart LR\n  A[Alpha one] --> B[Bravo two] --> C[Charlie three] --> D[Delta four]';
  const at = async (maxWidth?: number) =>
    createMermaid().render('w', chain, {
      format: 'ascii',
      config: maxWidth === undefined ? undefined : { ascii: { maxWidth } },
    });

  it('fits the drawing in the columns it allows, turning LR into TB', async () => {
    const wide = await at();
    expect(wide.columns).toBeGreaterThan(60);
    for (const w of [60, 40]) {
      const r = await at(w);
      expect(r.columns).toBeLessThanOrEqual(w);
      expect(r.warnings).toEqual([]);
    }
    expect(wide.warnings).toEqual([]);
  });

  it('spaces a drawing it turns to TB as a native TB drawing (rows, not columns)', async () => {
    const turned = await at(40);
    const native = await createMermaid().render(
      'w',
      chain.replace('flowchart LR', 'flowchart TB'),
      {
        format: 'ascii',
      }
    );
    expect(turned.text).toBe(native.text);
  });

  it('leaves a drawing alone at exactly its own width (no margin is budgeted)', async () => {
    const wide = await at();
    const exact = await at(wide.columns);
    expect(exact.text).toBe(wide.text);
    expect(exact.warnings).toEqual([]);
  });

  it('never crops: ASCII_TOO_WIDE when even TB does not fit', async () => {
    const r = await at(8);
    expect(r.columns).toBeGreaterThan(8);
    expect(r.text).toContain('Charlie three');
    expect(r.warnings).toEqual([expect.objectContaining({ code: 'ASCII_TOO_WIDE' })]);
    expect(r.warnings[0]?.message).toContain('8');
  });
});

describe('text output details', () => {
  it('keeps feature, shapes and astIds on warnings', async () => {
    const src = 'flowchart LR\n  A --> B@{ shape: bolt }\n  style A fill:#f00';
    const r = await createMermaid().render('d', src, { format: 'ascii' });
    const dropped = r.warnings.find((w) => w.code === 'ASCII_DROPPED');
    expect(dropped).toMatchObject({ feature: 'style', astIds: ['n:A', 'style:1'] });
    const shape = r.warnings.find((w) => w.code === 'ASCII_SHAPE');
    expect(shape?.shapes).toEqual(['bolt']);
    expect(shape?.astIds?.length).toBe(1);
  });

  it('prints the front-matter title on the first line', async () => {
    const r = await createMermaid().render('t', `---\ntitle: Hello\n---\n${FLOW}`, {
      format: 'ascii',
    });
    expect(r.text.split('\n')[0]!.trim()).toBe('Hello');
  });

  it('counts wide characters as two columns', async () => {
    const r = await createMermaid().render('w', 'flowchart LR\n  A[漢字]', { format: 'ascii' });
    expect(r.text).toBe(['┌──────┐', '│ 漢字 │', '└──────┘'].join('\n'));
    expect(r.columns).toBe(8);
    expect(r.text.length).toBeLessThan(3 * 8 + 2);
  });
});
