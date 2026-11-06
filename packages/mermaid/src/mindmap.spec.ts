import { describe, expect, it } from 'vitest';
import { mindmap } from '@mermaid-js/diagram-mindmap';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, MermaidError, NotLoadedError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The mindmap is a first-party type (#390): `mindmap` goes to `@mermaid-js/diagram-mindmap`
// through the generated registry, second after `flowchart-elk` as in v12, and lays out with
// core's `tree` engine unless a config layer names another (D284).
const TEXT = [
  'mindmap',
  '  root((mindmap))',
  '    Origins',
  '      Long history',
  '      ::icon(fa fa-book)',
  '      Popularisation',
  '    Research',
  '      On effectiveness<br/>and features',
  '      On Automatic creation',
  '    Tools',
  '      [Pen and paper]',
  '      )Mermaid(',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const count = (svg: string, re: RegExp): number => svg.match(re)?.length ?? 0;
const nodes = (svg: string): number => count(svg, /<g class="mindmap-node /g);
const viewBox = (svg: string): number[] =>
  (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);

/** The SVG of `text` with `config` in an init directive, and its warning codes. */
async function withInit(config: object, text = TEXT): Promise<{ svg: string; warnings: string[] }> {
  const r = await createMermaid().render('mm', `%%{init: ${JSON.stringify(config)}}%%\n${text}`);
  return { svg: r.svg, warnings: r.warnings.map((w) => w.code) };
}

describe('mindmaps through the public API (#390)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('m1', TEXT);
    expect(result.diagramType).toBe('mindmap');
    expect(result.svg).toContain('aria-roledescription="mindmap"');
    expect(result.svg).toContain('class="mermaid mermaid-mindmap"');
    expect(nodes(result.svg)).toBe(10);
    expect(count(result.svg, /class="edge section-edge-/g)).toBe(9);
    expect(result.svg).not.toContain('foreignObject');
    // The icons plugin is not registered: the reference is shown as written, with one warning.
    expect(result.warnings.map((w) => w.code)).toEqual(['ICON_NOT_RENDERED']);
    assertInert(result.svg);
  });

  // `tree` missing on its own (the plugin loaded, the engine not) is layout-engine.spec.ts's.
  it('renders synchronously once prepared', async () => {
    const thrown = (f: () => unknown): unknown => {
      try {
        f();
      } catch (x) {
        return x;
      }
    };
    const m = createMermaid();
    const e = thrown(() => m.renderSync(TEXT));
    expect(e).toBeInstanceOf(NotLoadedError);
    expect((e as NotLoadedError).missing).toEqual([{ kind: 'diagram', name: 'mindmap' }]);
    await m.prepare(TEXT);
    const sync = m.renderSync(TEXT, { id: 'm1' });
    expect(sync.diagramType).toBe('mindmap');
    expect(sync.svg).toBe((await createMermaid().render('m1', TEXT)).svg);
  });

  it('keeps v12’s detector place, second after flowchart-elk', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('mindmap')).toBe(1);
    expect(types[0]).toBe('flowchart-elk');
    const m = createMermaid();
    expect(m.detectType('  mindmap\n  root')).toBe('mindmap');
    // Case-sensitive, as v12's detector.
    expect(() => m.detectType('Mindmap\n  root')).toThrow();
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D216)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('mindmap', 'svg')).toBe(true);
    expect(m.supportsFormat('mindmap', 'ascii')).toBe(false);
    const e = await rejection(m.render('m5', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('mindmap');
  });

  it('renders through mermaid/slim with the mindmap plugin', async () => {
    const slim = createSlim({ diagrams: [mindmap] });
    const r = await slim.render('m1', TEXT);
    expect(r.diagramType).toBe('mindmap');
    expect(r.svg).toBe((await createMermaid().render('m1', TEXT)).svg);
  });
});

describe('mindmap layout engines (D282, D284)', () => {
  it('maps v12’s cose-bilkent and tidy-tree to tree, silently', async () => {
    const tree = await withInit({});
    for (const layout of ['tree', 'cose-bilkent', 'tidy-tree']) {
      const r = await withInit({ layout });
      expect(r.svg, layout).toBe(tree.svg);
      expect(r.warnings, layout).toEqual(tree.warnings);
    }
    const fm = await createMermaid().render(
      'mm',
      `---\nconfig:\n  layout: tidy-tree\n---\n${TEXT}`
    );
    expect(fm.svg).toBe(tree.svg);
  });

  it('honours layered and dagre, and draws an unknown name with tree and LAYOUT_UNKNOWN', async () => {
    const tree = await withInit({});
    const layered = await withInit({ layout: 'layered' });
    expect(layered.svg).not.toBe(tree.svg);
    expect((await withInit({ layout: 'dagre' })).svg).toBe(layered.svg);
    const unknown = await withInit({ layout: 'spring' });
    expect(unknown.svg).toBe(tree.svg);
    expect(unknown.warnings).toContain('LAYOUT_UNKNOWN');
  });
});

describe('mindmap config (#390, spec #294 "Config")', () => {
  it('takes v12’s defaults when a key is unset', async () => {
    const unset = await withInit({});
    const explicit = await withInit({
      mindmap: { padding: 10, maxNodeWidth: 200, useMaxWidth: true, colorBy: 'branch' },
    });
    expect(explicit.svg).toBe(unset.svg);
    expect(unset.svg).toContain('width="100%"');
  });

  it('ignores useWidth and layoutAlgorithm without a warning', async () => {
    const unset = await withInit({});
    const ignored = await withInit({
      mindmap: { useWidth: 300, layoutAlgorithm: 'something-else' },
    });
    expect(ignored.svg).toBe(unset.svg);
    expect(ignored.warnings).toEqual(unset.warnings);
  });

  it('honours useMaxWidth, padding and maxNodeWidth', async () => {
    const base = await withInit({});
    const fixed = (await withInit({ mindmap: { useMaxWidth: false } })).svg;
    expect(fixed).not.toContain('width="100%"');
    expect(fixed).toContain(`width="${viewBox(base.svg)[2]}"`);
    // The margin is mindmap.padding (v12 setupViewPortForSVG), and so are node paddings.
    const small = 'mindmap\n  root((mindmap))\n    A\n    B\n';
    const [, , w, h] = viewBox((await withInit({}, small)).svg);
    const padded = viewBox((await withInit({ mindmap: { padding: 30 } }, small)).svg);
    expect(padded[2]!).toBeGreaterThanOrEqual(w! + 40);
    expect(padded[3]!).toBeGreaterThanOrEqual(h! + 40);
    const long = 'mindmap\n  root[A label long enough to wrap at a narrow width]\n';
    const wide = viewBox((await withInit({}, long)).svg);
    const narrow = viewBox((await withInit({ mindmap: { maxNodeWidth: 80 } }, long)).svg);
    expect(narrow[2]!).toBeLessThan(wide[2]!);
    expect(narrow[3]!).toBeGreaterThan(wide[3]!);
  });

  it('colours by depth with colorBy: depth', async () => {
    const sections = (svg: string): string[] =>
      [...svg.matchAll(/<g class="mindmap-node (section-[-\w]+)/g)].map((m) => m[1]!);
    const branch = sections((await withInit({})).svg);
    const depth = sections((await withInit({ mindmap: { colorBy: 'depth' } })).svg);
    expect(branch.slice(0, 4)).toEqual(['section-root', 'section-0', 'section-0', 'section-0']);
    expect(depth.slice(0, 4)).toEqual(['section-root', 'section-0', 'section-1', 'section-1']);
  });
});

describe('mindmap limits (R-SEC-5)', () => {
  const chain = (n: number): string =>
    ['mindmap', ...Array.from({ length: n }, (_, k) => `${' '.repeat(k + 1)}n${k}`)].join('\n');

  async function limit(text: string, limits: object): Promise<MermaidError> {
    const m = createMermaid();
    m.initialize({ limits });
    const e = await rejection(m.render('ml', text));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('LIMIT');
    return e as MermaidError;
  }

  it('turns the node and depth caps into LIMIT, and diagram text cannot raise them', async () => {
    const nodesHit = await limit(chain(6), { maxNodes: 5 });
    expect(nodesHit.limit).toBe('maxNodes');
    expect(nodesHit.message).toMatch(/more than 5 nodes/);
    const deep = await limit(chain(4), { maxDepth: 2 });
    expect(deep.limit).toBe('maxDepth');
    expect(deep.message).toMatch(/nested 3 deep here, over the limit of 2/);
    const raise = `%%{init: ${JSON.stringify({ limits: { maxNodes: 1e9, maxDepth: 1e9 } })}}%%\n`;
    expect((await limit(raise + chain(6), { maxNodes: 5 })).limit).toBe('maxNodes');
    expect((await createMermaid().render('ml', chain(6))).diagramType, 'within the defaults').toBe(
      'mindmap'
    );
  });
});
