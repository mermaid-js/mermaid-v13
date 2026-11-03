import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cellProfile,
  layered,
  pxProfile,
  type LayoutEngine,
  type LayoutGraph,
} from '@mermaid-js/core/layout';
import { assertInert, type SvgWriter } from '@mermaid-js/core/svg';
import mermaid, {
  createMermaid,
  detectType,
  MermaidError,
  NotLoadedError,
  parse,
  render,
  renderSync,
  prepare,
  UnsupportedFormatError,
} from './index.ts';
import { defaultIdPrefix } from './api.ts';

const FLOW = 'flowchart LR\n  A[Start] --> B(End)\n';

async function rejection(p: Promise<unknown>): Promise<MermaidError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(MermaidError);
    return e as MermaidError;
  }
  throw new Error('expected a rejection');
}

function thrown(f: () => unknown): MermaidError {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(MermaidError);
    return e as MermaidError;
  }
  throw new Error('expected a throw');
}

describe('render (R-API-1, R-COMPAT-5)', () => {
  it('renders a flowchart to an svg string with its type, size and warnings', async () => {
    const result = await render('bench-probe', FLOW);
    expect(result.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(result.diagramType).toBe('flowchart-v2');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.svg).toContain(`viewBox="0 0 ${result.width} ${result.height}"`);
    expect(result.warnings).toEqual([]);
    expect(result.bindFunctions).toBeUndefined();
    expect(result.svg).toContain('data-mermaid-version="13.0.0-alpha.0"');
    assertInert(result.svg);
  });

  it('uses the render id as the prefix of every id in the output', async () => {
    const { svg } = await render('d1', 'flowchart LR\n  accTitle: T\n  A --> B');
    expect([...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1])).toEqual(['d1-title']);
  });

  it('is also the default export, with no mermaidAPI object (R-API-5)', () => {
    expect(mermaid.render).toBe(render);
    expect('mermaidAPI' in mermaid).toBe(false);
  });

  it('rejects a syntax error with a positioned MermaidError and a snippet', async () => {
    const e = await rejection(render('x', 'flowchart TD\n  A --> B\n  C[one\n'));
    expect(e.code).toBe('SYNTAX');
    expect(e.line).toBe(3);
    expect(e.column).toBe(4);
    expect(e.offset).toBe('flowchart TD\n  A --> B\n  C'.length);
    expect(e.message).toMatch(/^Error at line 3, column 4: /);
    expect(e.message).toContain('3 |   C[one');
    expect(e.diagnostics[0]!.code).toBe(e.diagnostics[0]!.code.toUpperCase());
  });

  it('counts lines from the original source, front matter included', async () => {
    const e = await rejection(render('x', '---\ntitle: t\n---\nflowchart TD\n  A[x\n'));
    expect(e.line).toBe(5);
  });

  it('reports a v12 diagram type without a v13 package as UNSUPPORTED_DIAGRAM (R-COMPAT-7)', async () => {
    const e = await rejection(
      render('x', 'gantt\n  title A\n  section S\n  t1 :a1, 2024-01-01, 3d')
    );
    expect(e.code).toBe('UNSUPPORTED_DIAGRAM');
    expect(e.message).toContain('"gantt"');
    expect(thrown(() => renderSync('gantt\n')).code).toBe('UNSUPPORTED_DIAGRAM');
    expect(detectType('gantt\n')).toBe('gantt');
  });

  it('rejects text no detector knows with UNSUPPORTED_DIAGRAM', async () => {
    const e = await rejection(render('x', 'not a diagram'));
    expect(e.code).toBe('UNSUPPORTED_DIAGRAM');
    expect(e.message).toContain('No diagram type detected');
  });

  it('rejects a stray --- with the v12 message', async () => {
    const e = await rejection(render('x', '--- x\nflowchart TD\n  A'));
    expect(e.code).toBe('SYNTAX');
    expect(e.message).toContain('Diagrams beginning with --- are not valid');
  });

  it('maps the edge limit to LIMIT, and reads maxEdges from the integrator config only', async () => {
    const m = createMermaid();
    m.initialize({ maxEdges: 2 });
    const text = 'flowchart LR\n  A --> B --> C --> D';
    expect((await rejection(m.render('x', text))).code).toBe('LIMIT');
    const raised = await rejection(m.render('x', `%%{init: {"maxEdges": 100}}%%\n${text}`));
    expect(raised.code).toBe('LIMIT');
  });
});

describe('detectType', () => {
  it('reports v12 type names in v12 detection order, after front matter and directives', () => {
    expect(detectType('graph TD\n A')).toBe('flowchart-v2');
    expect(detectType('flowchart-elk TD\n A')).toBe('flowchart-elk');
    expect(detectType('---\ntitle: t\n---\n%% c\n%%{init: {}}%%\n  sequenceDiagram\n')).toBe(
      'sequence'
    );
    expect(detectType('stateDiagram-v2\n')).toBe('stateDiagram');
    expect(detectType('classDiagram\n')).toBe('classDiagram');
  });

  it('throws UNSUPPORTED_DIAGRAM for unknown text', () => {
    expect(thrown(() => detectType('hello')).code).toBe('UNSUPPORTED_DIAGRAM');
  });
});

describe('prepare and renderSync (R-API-2)', () => {
  it('renderSync after prepare equals render() byte for byte', async () => {
    const text =
      'flowchart TD\n  subgraph S[Group]\n    A -- yes --> B{ok?}\n  end\n  B --> C[(db)]';
    const viaRender = await render('same', text);
    const m = createMermaid();
    const prepared = await m.prepare(text);
    expect(prepared.diagramType).toBe('flowchart-v2');
    expect(Object.isFrozen(prepared.config)).toBe(true);
    expect(m.renderSync(text, { id: 'same' })).toEqual(viaRender);
  });

  it('gives each diagram its own id prefix when no id is passed, deterministically (R-SVG-3, R-ARCH-6)', async () => {
    const one = 'flowchart LR\n  accTitle: One\n  A --> B';
    const two = 'flowchart LR\n  accTitle: Two\n  C --> D';
    const m = createMermaid();
    await m.prepare(one);
    await m.prepare(two);
    const ids = (svg: string) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]);
    const a = ids(m.renderSync(one).svg);
    const b = ids(m.renderSync(two).svg);
    expect(a.length).toBeGreaterThan(0);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
    expect(a[0]).toMatch(/^mermaid-[0-9a-z]+-title$/);
    // Same input, same options: byte-identical output, also from a fresh instance.
    expect(m.renderSync(one).svg).toBe(m.renderSync(one).svg);
    const fresh = createMermaid();
    await fresh.prepare(one);
    expect(fresh.renderSync(one).svg).toBe(m.renderSync(one).svg);
    // Different resolved options give a different prefix.
    const dark = { config: { theme: 'dark' as const } };
    await m.prepare(one, dark);
    expect(ids(m.renderSync(one, dark).svg)[0]).not.toBe(a[0]);
  });

  it('throws NotLoadedError naming the diagram package before anything is loaded', () => {
    const m = createMermaid();
    const e = thrown(() => m.renderSync(FLOW));
    expect(e).toBeInstanceOf(NotLoadedError);
    expect(e.code).toBe('NOT_LOADED');
    expect((e as NotLoadedError).missing).toEqual([{ kind: 'diagram', name: 'flowchart' }]);
    expect(e.message).toContain('diagram "flowchart"');
  });

  it('throws NotLoadedError naming a registered layout engine that is not loaded', async () => {
    const m = createMermaid();
    m.registerLayoutLoaders([{ name: 'stub', loader: () => Promise.resolve(layered) }]);
    await m.preload({ types: ['flowchart'] });
    const e = thrown(() => m.renderSync(FLOW, { config: { layout: 'stub' } }));
    expect((e as NotLoadedError).missing).toEqual([{ kind: 'layout', name: 'stub' }]);
  });

  it('draws with stand-ins and a warning when placeholders are allowed', async () => {
    const m = createMermaid();
    m.registerLayoutLoaders([{ name: 'stub', loader: () => Promise.resolve(layered) }]);
    await m.preload({ types: ['flowchart'] });
    const result = m.renderSync(FLOW, { config: { layout: 'stub' }, placeholders: true });
    expect(result.svg).toContain('<svg');
    expect(result.warnings.map((w) => w.code)).toEqual(['PLACEHOLDER']);
    expect(result.warnings[0]!.message).toContain('layout "stub"');

    const empty = createMermaid().renderSync(FLOW, { placeholders: true });
    expect(empty.diagramType).toBe('flowchart-v2');
    expect(empty.warnings.map((w) => w.code)).toEqual(['PLACEHOLDER']);
    assertInert(empty.svg);
  });

  it('lists a theme that is not loaded yet, and loads it in prepare', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart-v2'] });
    const text = '---\nconfig:\n  theme: forest\n---\nflowchart LR\n  A --> B';
    const e = thrown(() => m.renderSync(text));
    expect((e as NotLoadedError).missing).toEqual([{ kind: 'theme', name: 'forest' }]);
    await m.prepare(text);
    expect(m.renderSync(text).svg).toContain('<svg');
  });

  // The flowchart declares ascii (#46); the API draws it from #47 on, and throws until then.
  it('throws UnsupportedFormatError for ascii (M2)', async () => {
    await prepare(FLOW);
    const e = thrown(() => renderSync(FLOW, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect(e.code).toBe('UNSUPPORTED_FORMAT');
    expect(mermaid.supportsFormat('flowchart-v2', 'svg')).toBe(true);
    expect(mermaid.supportsFormat('flowchart', 'ascii')).toBe(true);
    expect(mermaid.supportsFormat('gantt', 'svg')).toBe(false);
  });
});

describe('initialize and concurrency (R-ARCH-4, R-ARCH-5, D72)', () => {
  const themed = (theme: string, n: number): string =>
    `---\nconfig:\n  theme: ${theme}\n---\nflowchart LR\n  A${n} --> B${n}{choice}\n  B${n} --> C${n}`;

  it('gives interleaved renders with different themes the bytes of sequential renders', async () => {
    const m = createMermaid();
    const themes = ['redux', 'dark', 'forest', 'neutral', 'base', 'default', 'auto'];
    const jobs = themes.flatMap((t, i) => [themed(t, i), themed(t, i + 10)]);
    const sequential: string[] = [];
    for (const j of jobs) sequential.push((await m.render('c', j)).svg);
    const fresh = createMermaid();
    const interleaved = await Promise.all(jobs.map((j) => fresh.render('c', j)));
    expect(interleaved.map((r) => r.svg)).toEqual(sequential);
    expect(new Set(sequential).size).toBe(jobs.length);
  });

  it('keeps the defaults snapshot a render started with when initialize() runs during it', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'dark' });
    const expected = (await m.render('i', FLOW)).svg;
    const inFlight = m.render('i', FLOW);
    m.initialize({ theme: 'forest' });
    expect((await inFlight).svg).toBe(expected);
    expect((await m.render('i', FLOW)).svg).not.toBe(expected);
  });

  it('replaces the defaults on each initialize(), as v12 did', async () => {
    const m = createMermaid();
    m.initialize({ flowchart: { useMaxWidth: false } });
    expect((await m.render('i', FLOW)).svg).not.toContain('max-width');
    m.initialize({});
    expect((await m.render('i', FLOW)).svg).toContain('max-width');
  });

  it('freezes the resolved config', async () => {
    const { config } = await prepare(FLOW);
    expect(() => {
      (config as { theme?: string }).theme = 'dark';
    }).toThrow(TypeError);
  });
});

describe('config sources', () => {
  it('moves an init directive `config` key into the diagram section, as v12 did', async () => {
    const svg = (
      await render('x', '%%{init: {"config": {"useMaxWidth": false}}}%%\nflowchart LR\n  A --> B')
    ).svg;
    expect(svg).not.toContain('max-width');
    const parsed = await parse('%%{init: {"config": {"useMaxWidth": false}}}%%\nflowchart LR\n  A');
    expect(parsed.config).toEqual({ flowchart: { useMaxWidth: false } });
  });

  it('returns config warnings: secure keys from diagram text are refused', async () => {
    const { warnings } = await render(
      'x',
      '---\nconfig:\n  securityLevel: loose\n  nope: 1\n---\nflowchart LR\n  A --> B'
    );
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'CONFIG_SECURE_KEY',
        path: 'securityLevel',
        source: 'frontMatter',
      }),
      expect.objectContaining({ code: 'CONFIG_UNKNOWN_KEY', path: 'nope', source: 'frontMatter' }),
    ]);
  });

  it('reads inheritDir from config into the parser', async () => {
    const text = 'flowchart LR\n  subgraph S\n    A --> B\n  end';
    const plain = await createMermaid().prepare(text);
    const m = createMermaid();
    m.initialize({ flowchart: { inheritDir: true } });
    const inherited = await m.prepare(text);
    const dir = (p: typeof plain) =>
      (p.parse.model as { subgraphs: { dir?: string }[] }).subgraphs[0]!.dir;
    expect(dir(plain)).toBeUndefined();
    expect(dir(inherited)).toBe('LR');
  });

  it('uses a font family from initialize() for drawing and measuring', async () => {
    const m = createMermaid();
    m.initialize({ fontFamily: 'Verdana' });
    const text = 'flowchart LR\n  A -- WWWWWWWW --> B';
    const wide = await m.render('f', text);
    const base = await createMermaid().render('f', text);
    expect(wide.svg).toContain('Verdana');
    expect(wide.width).not.toBe(base.width);
  });
});

describe('securityLevel (R-SEC-4, R-SEC-6, D75)', () => {
  const text = 'flowchart TD\n  A --> B\n  click A "https://example.com"\n  click B "/docs/b"';
  const hrefs = (svg: string): string[] =>
    [...svg.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]!);

  it('keeps absolute https links when securityLevel is unset', async () => {
    const result = await createMermaid().render('s', text);
    expect(hrefs(result.svg)).toEqual(['https://example.com', '/docs/b']);
    expect(result.warnings).toEqual([]);
  });

  it('drops absolute links with a warning under an explicit strict', async () => {
    const m = createMermaid();
    m.initialize({ securityLevel: 'strict' });
    const result = await m.render('s', text);
    expect(hrefs(result.svg)).toEqual(['/docs/b']);
    expect(result.warnings.map((w) => w.code)).toEqual(['URL_REFUSED']);
  });

  it('treats the v12 levels as the default level, with one warning', async () => {
    const m = createMermaid();
    m.initialize({ securityLevel: 'loose' });
    const result = await m.render('s', text);
    expect(hrefs(result.svg)).toEqual(['https://example.com', '/docs/b']);
    expect(result.warnings.map((w) => w.code)).toEqual(['SECURITY_LEVEL']);
  });
});

describe('layout engines (R-LAYOUT-2)', () => {
  it('selects a stub engine registered with registerLayoutLoaders through `layout:`', async () => {
    const seen: LayoutGraph[] = [];
    const stub: LayoutEngine = (graph, ctx) => {
      seen.push(graph);
      const laid = layered(graph, ctx);
      return { ...laid, width: laid.width + 1000 };
    };
    const m = createMermaid();
    m.registerLayoutLoaders([{ name: 'stub', loader: () => Promise.resolve({ layout: stub }) }]);
    const plain = await m.render('l', FLOW);
    expect(seen).toHaveLength(0);
    const viaStub = await m.render('l', `---\nconfig:\n  layout: stub\n---\n${FLOW}`);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.nodes.map((n) => n.id)).toEqual(['A', 'B']);
    expect(viaStub.width).toBe(plain.width + 1000);
  });

  it('maps the v12 names dagre, elk and elk.* to the built-in engine without a warning', async () => {
    const plain = await render('l', FLOW);
    for (const name of ['dagre', 'elk', 'elk.stress']) {
      const r = await render('l', `---\nconfig:\n  layout: ${name}\n---\n${FLOW}`);
      expect(r.warnings).toEqual([]);
      expect(r.width).toBe(plain.width);
    }
    expect((await render('l', `flowchart-elk LR\n  A --> B`)).warnings).toEqual([]);
  });

  it('passes RenderOptions.availableWidth to the engine, which fits the drawing (R-LAYOUT-5)', async () => {
    const seen: (number | undefined)[] = [];
    const spy: LayoutEngine = (graph, ctx) => {
      seen.push(graph.availableWidth);
      return layered(graph, ctx);
    };
    const m = createMermaid();
    m.registerLayoutLoaders([{ name: 'spy', loader: () => Promise.resolve(spy) }]);
    const wide = 'flowchart LR\n  A[Alpha node] --> B[Bravo node] --> C[Charlie node] --> D[Delta]';
    const text = `---\nconfig:\n  layout: spy\n---\n${wide}`;
    await m.prepare(text);
    const free = m.renderSync(text);
    const fitted = m.renderSync(text, { availableWidth: 200 });
    expect(seen).toEqual([undefined, 200]);
    expect(free.width).toBeGreaterThan(200);
    expect(fitted.width).toBeLessThanOrEqual(200);
  });

  it('parses once for prepare + renderSync with the same per-call options object', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'] });
    const options = { config: { theme: 'default' as const } };
    const first = await m.prepare(FLOW, options);
    m.renderSync(FLOW, options);
    expect(await m.prepare(FLOW, options)).toBe(first);
  });

  it('falls back to the built-in engine with a warning for an unknown name', async () => {
    const r = await render('l', `---\nconfig:\n  layout: nope\n---\n${FLOW}`);
    expect(r.warnings.map((w) => w.code)).toEqual(['LAYOUT_UNKNOWN']);
  });
});

describe('measurer selection (R-TEXT-5, R-TEXT-7)', () => {
  it('uses an integrator measurer', async () => {
    const widths: string[] = [];
    const m = createMermaid();
    m.initialize({
      measurer: {
        id: 'fixed',
        width: (text) => {
          widths.push(text);
          return text.length * 100;
        },
        metrics: () => ({ ascent: 10, descent: 4, lineHeight: 14 }),
      },
    });
    const custom = await m.render('m', FLOW);
    expect(widths).toContain('Start');
    // Words wider than the wrapping width break over several lines.
    expect(custom.height).toBeGreaterThan((await render('m', FLOW)).height);
  });

  it('ignores an integrator measurer under deterministic: true', async () => {
    const m = createMermaid();
    m.initialize({
      deterministic: true,
      measurer: {
        id: 'fixed',
        width: (t) => t.length * 100,
        metrics: () => ({ ascent: 10, descent: 4, lineHeight: 14 }),
      },
    });
    expect((await m.render('m', FLOW)).svg).toBe((await render('m', FLOW)).svg);
  });

  it('is deterministic without a canvas: the same input gives the same bytes', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    expect((await m.render('d', FLOW)).svg).toBe((await createMermaid().render('d', FLOW)).svg);
  });
});

describe('plugins and v12 leftovers (R-API-3, R-API-4, R-PLUG-6)', () => {
  it('registers a third-party diagram, detected after the first-party types', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([
      {
        id: 'hello',
        detector: (text: string) => text.trimStart().startsWith('hello'),
        loader: async () => ({
          id: 'hello',
          layoutKind: 'custom' as const,
          detector: () => true,
          parse: (text: string) => ({
            model: text.trim(),
            ast: { id: 'hello', type: 'Hello', range: { start: 0, end: text.length } },
            diagnostics: [],
            symbols: [],
            statements: [],
          }),
          render: (model: unknown, _l: unknown, _ctx: unknown, w: SvgWriter) => {
            w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 10, 20] });
            w.open('text');
            w.text(String(model));
            w.close();
            w.close();
          },
        }),
      },
    ]);
    expect(m.detectType('hello world')).toBe('hello');
    expect(m.detectType('graph TD\n hello')).toBe('flowchart-v2');
    const r = await m.render('h', 'hello world');
    expect(r).toMatchObject({ diagramType: 'hello', width: 10, height: 20, warnings: [] });
    expect(r.svg).toContain('<text>hello world</text>');
  });

  it('accepts registerIconPacks as a no-op and says so in the warnings', async () => {
    const m = createMermaid();
    m.registerIconPacks([{ name: 'logos', loader: () => Promise.resolve({}) }]);
    const r = await m.render('i', FLOW);
    expect(r.warnings.map((w) => w.code)).toEqual(['ICON_PACKS_UNSUPPORTED']);
  });

  it('passes a failed parse to the deprecated parse error handler as a MermaidError', async () => {
    const m = createMermaid();
    const seen: unknown[] = [];
    m.setParseErrorHandler((e) => seen.push(e));
    await rejection(m.parse('flowchart TD\n  A[x'));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(MermaidError);
    expect(await m.parse('flowchart TD\n  A[x', { suppressErrors: true })).toBe(false);
    expect(seen).toHaveLength(1);
  });

  it('parse() resolves the v12 diagram type and the text config', async () => {
    expect(await parse('---\nconfig:\n  theme: dark\n---\ngraph TD\n  A')).toEqual({
      diagramType: 'flowchart-v2',
      config: { theme: 'dark' },
      warnings: [],
    });
  });
});

describe('no console output (R-ERR-4)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes nothing to the console, also for warnings and errors', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {})
    );
    const m = createMermaid();
    m.initialize({ securityLevel: 'sandbox', theme: 'nope' as 'dark' });
    m.registerIconPacks();
    const r = await m.render(
      'q',
      '---\nconfig:\n  layout: nope\n  foo: 1\n---\nflowchart TD\n  A --> B\n  style A cursor:pointer\n  click A "javascript:x"'
    );
    expect(r.warnings.length).toBeGreaterThan(4);
    await rejection(m.render('q', 'flowchart TD\n  A['));
    await rejection(m.render('q', 'gantt'));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('determinism key (R-ARCH-6, D77)', () => {
  it('includes the unit profile id, leaving px ids as they were', () => {
    const px = defaultIdPrefix('flowchart TD\n  A', {}, {}, pxProfile);
    expect(px).toBe('mermaid-1uh2sg');
    expect(defaultIdPrefix('flowchart TD\n  A', {}, {}, cellProfile())).not.toBe(px);
  });
});
