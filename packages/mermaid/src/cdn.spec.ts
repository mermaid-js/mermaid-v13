/**
 * The CDN build's API side (spec #218 T6; R-PLUG-7, D162, D163, D167): `cdnBase` is set only by
 * the integrator, and `globalThis.mermaidPlugins` feeds the discovered-list seam.
 */
import { describe, expect, it } from 'vitest';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { createMermaid } from './index.ts';
import { connectPluginQueue } from './plugin-queue.ts';
import type { ExtensionPlugin } from './api.ts';
import type { LazyDiagram } from './registry.ts';

const FLOW = 'flowchart LR\n  A --> B';

describe('cdnBase (D163)', () => {
  it('is a secure key: front matter cannot set it', async () => {
    const { warnings } = await createMermaid().render(
      'x',
      `---\nconfig:\n  cdnBase: https://evil.example/\n---\n${FLOW}`
    );
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'CONFIG_SECURE_KEY',
        path: 'cdnBase',
        source: 'frontMatter',
      }),
    ]);
  });

  it('is a secure key: an init directive cannot set it', async () => {
    const { warnings } = await createMermaid().render(
      'x',
      `%%{init: {"cdnBase": "https://evil.example/"}}%%\n${FLOW}`
    );
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'CONFIG_SECURE_KEY', path: 'cdnBase' }),
    ]);
  });

  it('is an integrator option: initialize() takes it without a warning', async () => {
    const api = createMermaid();
    api.initialize({ cdnBase: 'https://cdn.example/mermaid/' });
    expect((await api.render('x', FLOW)).warnings).toEqual([]);
  });
});

/** A tiny lazy diagram: `<keyword> text` draws `<id>: text`. */
function textDiagram(id: string, keyword: string, loads: string[] = []): LazyDiagram {
  return {
    id,
    detector: (text: string) => text.trimStart().startsWith(keyword),
    loader: async () => {
      loads.push(id);
      return {
        id,
        layoutKind: 'custom' as const,
        detector: () => true,
        parse: (text: string) => ({
          model: text.replace(keyword, '').trim(),
          ast: { id, type: 'Text', range: { start: 0, end: text.length } },
          diagnostics: [],
          symbols: [],
          statements: [],
        }),
        render: (model: unknown, _l: unknown, _ctx: unknown, w: SvgWriter) => {
          w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 10, 20] });
          w.open('text');
          w.text(`${id}: ${String(model)}`);
          w.close();
          w.close();
        },
      };
    },
  };
}

/** An extension that adds `class` to the root svg, loaded by manifest (an async `load`). */
function marker(cls: string): { manifest: unknown; load: () => Promise<unknown> } {
  const plugin: ExtensionPlugin = {
    id: cls,
    postRender(tree) {
      const [svg] = tree.children(tree.root);
      if (svg !== undefined) tree.setAttr(svg, 'class', cls);
    },
  };
  return {
    manifest: { plugin: 'extension', id: cls, entry: './index.js', export: 'plugin' },
    load: () => new Promise((resolve) => setTimeout(() => resolve({ plugin }), 5)),
  };
}

describe('globalThis.mermaidPlugins (D167)', () => {
  it('registers entries queued before mermaid started', async () => {
    const scope: { mermaidPlugins?: unknown } = { mermaidPlugins: [textDiagram('early', 'early')] };
    const api = createMermaid();
    connectPluginQueue(api, scope);
    expect((await api.render('e', 'early one')).svg).toContain('early: one');
  });

  it('registers entries pushed after mermaid started, and renders wait for them', async () => {
    const scope: { mermaidPlugins?: unknown[] } = {};
    const api = createMermaid();
    connectPluginQueue(api, scope);
    scope.mermaidPlugins!.push(textDiagram('late', 'late'), marker('late-mark'));
    const { svg } = await api.render('l', 'late two');
    expect(svg).toContain('late: two');
    expect(svg).toContain('late-mark');
  });

  it('drains the queue, so a second API object does not register the same entries', async () => {
    const queue: unknown[] = [textDiagram('once', 'once')];
    const scope = { mermaidPlugins: queue };
    connectPluginQueue(createMermaid(), scope);
    expect(queue).toHaveLength(0);
    expect(scope.mermaidPlugins).toBe(queue);
  });

  it('detects queued diagrams by package name, whatever the push order (D166)', async () => {
    const scope: { mermaidPlugins?: unknown[] } = {
      mermaidPlugins: [{ ...textDiagram('zz', 'same'), package: 'zz-plugin' }],
    };
    const api = createMermaid();
    connectPluginQueue(api, scope);
    scope.mermaidPlugins!.push({ ...textDiagram('aa', 'same'), package: 'aa-plugin' });
    expect((await api.render('s', 'same x')).diagramType).toBe('aa');
  });

  it('takes a layout entry and skips a bad entry with a warning, never throwing', async () => {
    const scope: { mermaidPlugins?: unknown[] } = {
      mermaidPlugins: [
        42,
        { kind: 'layout', package: 'fake-layout', names: ['fake'], loader: async () => ({}) },
      ],
    };
    const api = createMermaid();
    expect(() => connectPluginQueue(api, scope)).not.toThrow();
    const { warnings } = await api.render('x', FLOW);
    expect(warnings).toEqual([expect.objectContaining({ code: 'PLUGIN_SKIPPED' })]);
  });
});

describe('the CDN entry (D163, D167)', () => {
  const key = Symbol.for('mermaid.cdnBase');
  const base = () => (globalThis as Record<symbol, unknown>)[key];

  it('defaults to the directory of the ESM file and follows initialize()', async () => {
    const cdn = await import('./cdn.ts');
    expect(base()).toBe(new URL('./', new URL('./cdn.ts', import.meta.url)).href);
    expect((globalThis as { mermaid?: unknown }).mermaid).toBe(cdn.default);
    cdn.default.initialize({ cdnBase: 'https://cdn.example/npm/mermaid@13/dist' });
    expect(base()).toBe('https://cdn.example/npm/mermaid@13/dist/');
    cdn.initialize({});
    expect(base()).toBe(new URL('./', new URL('./cdn.ts', import.meta.url)).href);
    expect(() => cdn.initialize({ cdnBase: 42 as never })).toThrow(TypeError);
  });
});
