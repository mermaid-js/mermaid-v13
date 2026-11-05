/**
 * The CDN build's API side (spec #218 T6; R-PLUG-7, D162, D163, D167): `cdnBase` is set only by
 * the integrator, and `globalThis.mermaidPlugins` feeds the discovered-list seam.
 */
import { describe, expect, it, vi } from 'vitest';
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

/** A manifest extension whose `load` never settles, or settles when `release` is called. */
function stuck(id: string): { manifest: unknown; load: () => Promise<unknown>; release(): void } {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const plugin: ExtensionPlugin = { id, postRender: () => undefined };
  return {
    manifest: { plugin: 'extension', id, entry: './index.js', export: 'plugin' },
    load: () => gate.then(() => ({ plugin })),
    release: () => release(),
  };
}

describe('the plugin queue under bad plugins (D167)', () => {
  it('renders without a registration that never finishes, after the time limit', async () => {
    const scope: { mermaidPlugins?: unknown[] } = {};
    const api = createMermaid();
    connectPluginQueue(api, scope, { timeLimitMs: 30 });
    scope.mermaidPlugins!.push(stuck('never'), textDiagram('fine', 'fine'));
    const r = await api.render('f', 'fine ok');
    expect(r.svg).toContain('fine: ok');
    expect(r.warnings).toEqual([expect.objectContaining({ code: 'PLUGIN_DISCOVERY_FAILED' })]);
    // Later renders do not wait again.
    const t = Date.now();
    expect((await api.render('g', FLOW)).warnings).toEqual([]);
    expect(Date.now() - t).toBeLessThan(30);
  });

  it('does not deadlock when a plugin load awaits a render', async () => {
    const scope: { mermaidPlugins?: unknown[] } = {};
    const api = createMermaid();
    connectPluginQueue(api, scope, { timeLimitMs: 30 });
    const plugin: ExtensionPlugin = { id: 'waits', postRender: () => undefined };
    scope.mermaidPlugins!.push({
      manifest: { plugin: 'extension', id: 'waits', entry: './index.js', export: 'plugin' },
      load: async () => {
        await api.render('inner', FLOW);
        return { plugin };
      },
    });
    expect((await api.render('outer', FLOW)).svg).toContain('<svg');
  });

  it('registers a late finisher for the renders after it, with a fresh analysis', async () => {
    const scope: { mermaidPlugins?: unknown[] } = {};
    const api = createMermaid();
    connectPluginQueue(api, scope, { timeLimitMs: 10 });
    const mark = marker('slow-mark');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let loaded!: () => void;
    const done = new Promise<void>((r) => (loaded = r));
    scope.mermaidPlugins!.push({
      ...mark,
      load: () => gate.then(mark.load).finally(() => setTimeout(loaded, 0)),
    });
    const text = 'flowchart LR\n  S --> T';
    expect((await api.render('a', text)).svg).not.toContain('slow-mark');
    release();
    await done;
    expect((await api.render('a', text)).svg).toContain('slow-mark');
  });

  it('skips an entry that throws when read, without breaking the queue', async () => {
    const scope: { mermaidPlugins?: unknown[] } = {
      mermaidPlugins: [
        new Proxy(
          {},
          {
            get() {
              throw new Error('boom');
            },
            has() {
              throw new Error('boom');
            },
          }
        ),
        textDiagram('ok', 'ok'),
      ],
    };
    const api = createMermaid();
    expect(() => connectPluginQueue(api, scope)).not.toThrow();
    const r = await api.render('o', 'ok fine');
    expect(r.svg).toContain('ok: fine');
    expect(r.warnings).toEqual([expect.objectContaining({ code: 'PLUGIN_SKIPPED' })]);
  });

  it('reports a pushed duplicate as already discovered, even while the first registers', async () => {
    const scope: { mermaidPlugins?: unknown[] } = {};
    const api = createMermaid();
    connectPluginQueue(api, scope);
    const twice = { ...marker('twice'), package: 'twice-pkg' };
    scope.mermaidPlugins!.push(twice);
    scope.mermaidPlugins!.push(twice);
    const { warnings } = await api.render('d', FLOW);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: 'PLUGIN_SKIPPED' });
    expect(warnings[0]!.message).toMatch(/already discovered/);
  });

  it('registers a push made while the queue drains', async () => {
    const api = createMermaid();
    const scope: { mermaidPlugins?: unknown[] } = {};
    const early = {
      ...textDiagram('first', 'first'),
      get package() {
        scope.mermaidPlugins!.push(textDiagram('second', 'second'));
        return 'first-pkg';
      },
    };
    scope.mermaidPlugins = [early];
    connectPluginQueue(api, scope);
    expect((await api.render('s', 'second x')).svg).toContain('second: x');
  });
});

describe('the CDN entry (D163, D167)', () => {
  const here = new URL('./', import.meta.url).href;
  const chunk = async () => (await import('./cdn-base.ts')).cdnUrl('chunks/x.mjs');

  it('sets globalThis.mermaid and keeps the base in the build, not on the page', async () => {
    const cdn = await import('./cdn.ts');
    expect((globalThis as { mermaid?: unknown }).mermaid).toBe(cdn.default);
    expect(Object.getOwnPropertySymbols(globalThis).map(String)).not.toContain(
      'Symbol(mermaid.cdnBase)'
    );
    expect(await chunk()).toBe(`${here}chunks/x.mjs`);
  });

  it('takes cdnBase from initialize(), dropping its query and hash', async () => {
    const cdn = await import('./cdn.ts');
    cdn.default.initialize({ cdnBase: 'https://cdn.example/npm/mermaid@13/dist?v=1#top' });
    expect(await chunk()).toBe('https://cdn.example/npm/mermaid@13/dist/chunks/x.mjs');
    // Only a present cdnBase key changes it.
    cdn.initialize({ theme: 'dark' });
    expect(await chunk()).toBe('https://cdn.example/npm/mermaid@13/dist/chunks/x.mjs');
    cdn.initialize({ cdnBase: undefined });
    expect(await chunk()).toBe(`${here}chunks/x.mjs`);
  });

  it('resolves a relative cdnBase against document.baseURI', async () => {
    const cdn = await import('./cdn.ts');
    const g = globalThis as { document?: unknown };
    g.document = { baseURI: 'https://page.example/app/index.html' };
    try {
      cdn.initialize({ cdnBase: '../cdn/mermaid' });
      expect(await chunk()).toBe('https://page.example/cdn/mermaid/chunks/x.mjs');
    } finally {
      delete g.document;
      cdn.initialize({ cdnBase: undefined });
    }
  });

  it('ignores a cdnBase that is not a URL string, and takes a missing config', async () => {
    const cdn = await import('./cdn.ts');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => cdn.initialize({ cdnBase: 42 as never })).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/cdnBase ignored/));
      expect(await chunk()).toBe(`${here}chunks/x.mjs`);
      expect(() => cdn.initialize()).not.toThrow();
      expect(() => cdn.initialize(null as never)).not.toThrow();
    } finally {
      warn.mockRestore();
    }
  });

  it('warns once when cdnBase is not the directory mermaid was loaded from', async () => {
    // A fresh build copy: the warning is once per copy, and earlier tests used a mirror.
    vi.resetModules();
    const cdn = await import('./cdn.ts');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      cdn.initialize({ cdnBase: here });
      expect(warn).not.toHaveBeenCalled();
      cdn.initialize({ cdnBase: 'https://mirror.example/mermaid/dist/' });
      cdn.initialize({ cdnBase: 'https://mirror2.example/mermaid/dist/' });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toMatch(/second copy.*Load mermaid itself from/s);
      // It still applies.
      expect(await chunk()).toBe('https://mirror2.example/mermaid/dist/chunks/x.mjs');
    } finally {
      warn.mockRestore();
      cdn.initialize({ cdnBase: undefined });
    }
  });
});
