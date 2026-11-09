/**
 * Engine selection by plugin (D282, D284, D285): a diagram plugin's `layoutEngine` names the
 * engine it lays out with when no config layer sets `layout`, and aliases for v12's names.
 * `tree` is a first-party engine `mermaid` loads lazily, and only plugins that declare it reach it.
 * `compass` is lazy too, and any graph type reaches it by name (D502).
 * `swimlane` is loaded lazily too, but any graph diagram may select it (D535).
 */
import { layered, type LayoutGraph, type LayoutModel } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { swimlane } from '@mermaid-js/core/layout/swimlane';
import { tree } from '@mermaid-js/core/layout/tree';
import type { DiagramPlugin } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { describe, expect, it } from 'vitest';
import { createMermaid, NotLoadedError, type MermaidError } from './index.ts';

const EDGES = ['r>a', 'r>b', 'r>c', 'a>d'];

/** The graph the test plugin lays out: `source>target` lines under its header. */
function graphOf(edges: readonly string[]): LayoutGraph {
  const ids = [...new Set(edges.flatMap((e) => e.split('>')))];
  return {
    direction: 'TB',
    nodes: ids.map((id) => ({ id, width: 40, height: 20 })),
    edges: edges.map((e, i) => {
      const [source, target] = e.split('>') as [string, string];
      return { id: `e${i}`, source, target, minLen: 1 };
    }),
    groups: [],
    spacing: { node: 10, rank: 30, edge: 10 },
  };
}

/** What the test plugin draws: the laid-out node boxes, as text. */
const drawn = (m: LayoutModel): string => JSON.stringify([...m.nodes]);

/** A graph diagram `probe` that draws its layout as text, with the given `layoutEngine`. */
function probe(layoutEngine?: DiagramPlugin['layoutEngine']): DiagramPlugin<string[], LayoutModel> {
  return {
    id: 'probe',
    layoutKind: 'graph',
    ...(layoutEngine ? { layoutEngine } : {}),
    detector: (text) => /^\s*probe/.test(text),
    parse: (text) => ({
      model: text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^\w+>\w+$/.test(l)),
      ast: { id: 'probe', type: 'Probe', range: { start: 0, end: text.length } },
      diagnostics: [],
      symbols: [],
      statements: [],
    }),
    layout: (model, ctx) => ctx.layout(graphOf(model)),
    render: (_model, layout, _ctx, w: SvgWriter) => {
      w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 10, 10] });
      w.open('desc');
      w.text(drawn(layout));
      w.close();
      w.close();
    },
  };
}

const MINDMAP_LIKE = {
  default: 'tree',
  aliases: { 'cose-bilkent': 'tree', 'tidy-tree': 'tree' },
} as const;
const TEXT = `probe\n${EDGES.join('\n')}\n`;
const withLayout = (name: string) => `---\nconfig:\n  layout: ${name}\n---\n${TEXT}`;
const BY_TREE = drawn(tree(graphOf(EDGES)));
const BY_LAYERED = drawn(layered(graphOf(EDGES)));
const desc = (svg: string) => /<desc>(.*)<\/desc>/.exec(svg.replaceAll('&quot;', '"'))![1];

async function withProbe(layoutEngine?: DiagramPlugin['layoutEngine']) {
  const m = createMermaid();
  await m.registerExternalDiagrams([probe(layoutEngine)]);
  return m;
}

function thrown(f: () => unknown): MermaidError {
  try {
    f();
  } catch (e) {
    return e as MermaidError;
  }
  throw new Error('expected a throw');
}

describe('a plugin’s layout engine (D284)', () => {
  it('lays out with the plugin’s default when no config layer sets `layout`', async () => {
    expect(BY_TREE).not.toBe(BY_LAYERED);
    const m = await withProbe(MINDMAP_LIKE);
    const r = await m.render('p', TEXT);
    expect(r.warnings).toEqual([]);
    expect(desc(r.svg)).toBe(BY_TREE);
  });

  it('applies the plugin’s aliases before lookup, silently', async () => {
    const m = await withProbe(MINDMAP_LIKE);
    for (const name of ['cose-bilkent', 'tidy-tree']) {
      const r = await m.render('p', withLayout(name));
      expect(r.warnings).toEqual([]);
      expect(desc(r.svg)).toBe(BY_TREE);
    }
  });

  it('honours a `layout` the user sets, in any config layer', async () => {
    const m = await withProbe(MINDMAP_LIKE);
    for (const name of ['layered', 'dagre']) {
      const r = await m.render('p', withLayout(name));
      expect(r.warnings).toEqual([]);
      expect(desc(r.svg)).toBe(BY_LAYERED);
    }
    const directive = await m.render('p', `%%{init: {"layout": "layered"}}%%\n${TEXT}`);
    expect(desc(directive.svg)).toBe(BY_LAYERED);
    m.initialize({ layout: 'layered' });
    expect(desc((await m.render('p', TEXT)).svg)).toBe(BY_LAYERED);
  });

  it('draws an unknown name with the default and warns LAYOUT_UNKNOWN', async () => {
    const m = await withProbe(MINDMAP_LIKE);
    const r = await m.render('p', withLayout('nope'));
    expect(r.warnings.map((w) => w.code)).toEqual(['LAYOUT_UNKNOWN']);
    expect(r.warnings[0]!.message).toContain('"nope"');
    expect(r.warnings[0]!.message).toContain('tree');
    expect(desc(r.svg)).toBe(BY_TREE);
  });

  it('draws an ELK name with the default and warns ELK_NOT_INSTALLED without the plugin (D282)', async () => {
    const m = await withProbe(MINDMAP_LIKE);
    const r = await m.render('p', withLayout('elk.stress'));
    expect(r.warnings.map((w) => w.code)).toEqual(['ELK_NOT_INSTALLED']);
    expect(r.warnings[0]!.message).toContain('tree');
    expect(desc(r.svg)).toBe(BY_TREE);
  });

  it('throws NotLoadedError naming `tree` from renderSync before prepare()', async () => {
    const m = await withProbe(MINDMAP_LIKE);
    const e = thrown(() => m.renderSync(TEXT));
    expect(e).toBeInstanceOf(NotLoadedError);
    expect((e as NotLoadedError).missing).toEqual([{ kind: 'layout', name: 'tree' }]);
    // The stand-in for an unknown name is the default, so it is the one missing.
    const unknown = thrown(() => m.renderSync(withLayout('nope')));
    expect((unknown as NotLoadedError).missing).toEqual([{ kind: 'layout', name: 'tree' }]);
    await m.prepare(TEXT);
    expect(desc(m.renderSync(TEXT).svg)).toBe(BY_TREE);
  });

  it('keeps `tree` from plugins that do not declare it (D285)', async () => {
    const m = await withProbe();
    await m.prepare(TEXT);
    expect(desc(m.renderSync(TEXT).svg)).toBe(BY_LAYERED);
    const r = await m.render('p', withLayout('tree'));
    expect(r.warnings.map((w) => w.code)).toEqual(['LAYOUT_UNKNOWN']);
    expect(r.warnings[0]!.message).toContain('built-in layered engine');
    expect(desc(r.svg)).toBe(BY_LAYERED);
    // Also once another plugin has loaded it.
    const both = createMermaid();
    await both.registerExternalDiagrams([
      probe(),
      { ...probe(MINDMAP_LIKE), id: 'other', detector: (t) => /^\s*other/.test(t) },
    ]);
    await both.render('o', TEXT.replace('probe', 'other'));
    expect(desc((await both.render('p', withLayout('tree'))).svg)).toBe(BY_LAYERED);
  });

  it('lets any graph type select `compass` by name, while `tree` stays gated (D502)', async () => {
    const BY_COMPASS = drawn(compass(graphOf(EDGES)));
    expect(BY_COMPASS).not.toBe(BY_LAYERED);
    const m = await withProbe();
    const r = await m.render('p', withLayout('compass'));
    expect(r.warnings).toEqual([]);
    expect(desc(r.svg)).toBe(BY_COMPASS);
    // prepare() loads it for renderSync, as for a default.
    const sync = await withProbe();
    expect(() => sync.renderSync(withLayout('compass'))).toThrow(NotLoadedError);
    await sync.prepare(withLayout('compass'));
    expect(desc(sync.renderSync(withLayout('compass')).svg)).toBe(BY_COMPASS);
    const gated = await m.render('p', withLayout('tree'));
    expect(gated.warnings.map((w) => w.code)).toEqual(['LAYOUT_UNKNOWN']);
    expect(desc(gated.svg)).toBe(BY_LAYERED);
  });

  it('lets a registered `tree` loader replace the first-party one, for every plugin', async () => {
    const m = await withProbe();
    m.registerLayoutLoaders([{ name: 'tree', loader: () => Promise.resolve(tree) }]);
    const r = await m.render('p', withLayout('tree'));
    expect(r.warnings).toEqual([]);
    expect(desc(r.svg)).toBe(BY_TREE);
  });
});

describe('the swimlane engine, a peer of layered (D535)', () => {
  const BY_SWIMLANE = drawn(swimlane(graphOf(EDGES)));

  it('is selected by `layout: swimlane` on a plugin that does not declare it, once loaded', async () => {
    expect(BY_SWIMLANE).not.toBe(BY_LAYERED);
    const m = await withProbe();
    const e = thrown(() => m.renderSync(withLayout('swimlane')));
    // Swimlane hops by default (`swimlane.lineHops: arc`, D537), so the line-hop chunk too.
    expect((e as NotLoadedError).missing).toEqual([
      { kind: 'layout', name: 'swimlane' },
      { kind: 'layout', name: 'lineHops' },
    ]);
    const r = await m.render('p', withLayout('swimlane'));
    expect(r.warnings).toEqual([]);
    expect(desc(r.svg)).toBe(BY_SWIMLANE);
    expect(desc(m.renderSync(withLayout('swimlane')).svg)).toBe(BY_SWIMLANE);
  });

  it('lays out a plain flowchart with `layout: swimlane`, while `tree` stays gated', async () => {
    const flow = (layout: string) =>
      `---\nconfig:\n  layout: ${layout}\n---\nflowchart TD\n  subgraph Sales\n    A --> B\n  end\n  B --> C\n`;
    const m = createMermaid();
    const r = await m.render('f', flow('swimlane'));
    expect(r.warnings).toEqual([]);
    const byLayered = await m.render('f', flow('layered'));
    expect(r.svg).not.toBe(byLayered.svg);
    const gated = await m.render('f', flow('tree'));
    expect(gated.warnings.map((w) => w.code)).toEqual(['LAYOUT_UNKNOWN']);
    expect(gated.svg).toBe(byLayered.svg);
  });
});
