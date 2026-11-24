/**
 * What a render's bookkeeping shortcuts must keep: the detected row handed on as the registry
 * returned it, errors only where the diagnostics hold one, the front-matter title, the queued
 * discovery warnings and the HTML-dropped warning.
 */
import { describe, expect, it } from 'vitest';
import { MermaidError } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { Analyser } from './analyser.ts';
import { SiteConfigs, snapshot } from './config-snapshot.ts';
import { DETECTORS } from './generated/detectors.gen.ts';
import { addDiscovered } from './discovery.ts';
import { createMermaid, type LazyDiagram } from './index.ts';
import { Registry } from './registry.ts';

const FLOW = 'flowchart LR\n  A --> B\n';

/** A third-party diagram that writes its label and model into an svg. */
function textDiagram(id: string, keyword: string, label = id): LazyDiagram {
  return {
    id,
    detector: (text: string) => text.trimStart().startsWith(keyword),
    loader: async () => ({
      id,
      layoutKind: 'custom' as const,
      detector: () => true,
      parse: (text: string) => ({
        model: text.trim(),
        ast: { id, type: 'Text', range: { start: 0, end: text.length } },
        diagnostics: [],
        symbols: [],
        statements: [],
      }),
      render: (model: unknown, _l: unknown, _ctx: unknown, w: SvgWriter) => {
        w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 10, 20] });
        w.open('text');
        w.text(`${label}: ${String(model)}`);
        w.close();
        w.close();
      },
    }),
  };
}

describe('detectSupported', () => {
  const analyser = (registry: Registry) =>
    new Analyser(
      registry,
      new SiteConfigs(),
      () => [],
      () => false
    );

  it('hands on the row the registry detected, its fields as detected', () => {
    const registry = new Registry(DETECTORS);
    const s = snapshot();
    const { detected } = analyser(registry).detectSupported(FLOW, s, false);
    expect(detected).toBe(registry.detect(FLOW, analyser(registry).detect(FLOW, s).pre));
    expect(detected).toMatchObject({ type: 'flowchart-v2', id: 'flowchart' });
    expect(analyser(registry).detectSupported('swimlane-beta\n', s, false).detected).toMatchObject({
      type: 'swimlane',
      id: 'flowchart',
      section: 'swimlane',
      layout: 'swimlane',
    });
  });

  it('keeps a row found before a replacement as it was; detection then finds the replacement', async () => {
    const registry = new Registry(DETECTORS);
    const s = snapshot();
    const before = analyser(registry).detectSupported(FLOW, s, false).detected;
    await registry.registerExternal([textDiagram('flowchart', 'flowchart', 'mine')], true, true);
    expect(before).toMatchObject({ type: 'flowchart-v2', id: 'flowchart' });
    expect(before.layout).toBeUndefined();
    const after = analyser(registry).detectSupported(FLOW, s, false).detected;
    expect(after).not.toBe(before);
    expect(after.id).toBe('flowchart');
  });

  it('rejects a type without a package and a format the type cannot draw', () => {
    const registry = new Registry(DETECTORS);
    const s = snapshot();
    expect(() => analyser(registry).detectSupported('zenuml\n', s, false)).toThrow(
      /UNSUPPORTED|zenuml/i
    );
    expect(() => analyser(registry).detectSupported('pie\n "a": 1', s, true)).toThrow(MermaidError);
  });
});

/** An API object with flowchart (and its text output) loaded, for `renderSync`. */
async function ready(): Promise<ReturnType<typeof createMermaid>> {
  const m = createMermaid();
  await m.prepare(FLOW);
  await m.prepare(FLOW, { format: 'ascii' });
  return m;
}

describe('render bookkeeping', () => {
  it('throws the parse error with every diagnostic, and none without an error', async () => {
    const m = await ready();
    expect(m.renderSync(FLOW).warnings).toEqual([]);
    const bad = 'flowchart LR\n  A --> \n  B -->> C -->\n';
    let error: unknown;
    try {
      m.renderSync(bad);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MermaidError);
    expect((error as MermaidError).message).toMatch(/line|Parse|Expect/i);
  });

  it('throws a preprocess error before any row is tried', async () => {
    const m = await ready();
    expect(() => m.renderSync('---\ntitle: [\n---\nflowchart LR\n A')).toThrow(MermaidError);
  });

  it('keeps the front-matter title for text output and drops nothing without one', async () => {
    const m = await ready();
    const titled = m.renderSync('---\ntitle: Hello\n---\nflowchart LR\n A --> B', {
      format: 'ascii',
    });
    expect(titled.text).toContain('Hello');
    expect(m.renderSync(FLOW).svg).not.toContain('flowchartTitleText');
  });

  it('warns HTML_DROPPED only for a label that dropped a tag', async () => {
    const m = await ready();
    expect(m.renderSync('flowchart LR\n A["<b>x</b>"]').warnings).toEqual([]);
    const r = m.renderSync('flowchart LR\n A["<div>x</div>"]');
    expect(r.warnings.map((w) => w.code)).toContain('HTML_DROPPED');
  });

  it('hands queued discovery warnings to the first draw that succeeds, then none', async () => {
    const m = createMermaid();
    // A first-party id is never taken by discovery: skipped, with a warning.
    await addDiscovered(m, [
      { kind: 'plugin', package: 'fake', plugin: textDiagram('flowchart', 'flowchart') },
    ]);
    const first = await m.render('f', FLOW);
    expect(first.warnings.map((w) => w.code)).toEqual(['PLUGIN_SKIPPED']);
    expect((await m.render('f', FLOW)).warnings).toEqual([]);
    expect(m.renderSync(FLOW).warnings).toEqual([]);
  });

  it('draws the same result with or without tooltips, keys in the same order', async () => {
    const m = await ready();
    const plain = m.renderSync(FLOW);
    const tipped = m.renderSync('flowchart LR\n  A --> B\n  click A callback "tip"\n');
    expect(Object.keys(plain)).toEqual(['svg', 'width', 'height', 'diagramType', 'warnings']);
    expect(Object.keys(tipped)).toEqual(Object.keys(plain));
    expect(tipped.svg).toContain('tip');
    expect(plain.svg).not.toContain('tip');
  });
});
