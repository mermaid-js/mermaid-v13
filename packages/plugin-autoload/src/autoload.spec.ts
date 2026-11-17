/**
 * `autoload(mermaid)` (D589): the declared plugins registered on an instance, in package-name
 * order, with D157's confinement and a time limit per import. Apps are temp folders; the
 * instance is a real `createMermaid()` (no first-use discovery: that is `mermaid`'s Node
 * entry, which these specs do not load).
 */
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layered } from '@mermaid-js/core/layout';
import { createMermaid, MermaidError, type ExternalDiagram } from 'mermaid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoload } from './autoload.ts';
import { app, DETECTOR, diagram, ENTRY, EXTENSION, extension, pkg, skips } from './testing/apps.ts';

const unsupported = async (p: Promise<unknown>) => {
  const error = await p.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(MermaidError);
  expect((error as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
};

/** A fresh instance with `root`'s plugins autoloaded; the warnings come with it. */
async function loaded(root: string, options: { importTimeoutMs?: number } = {}) {
  const m = createMermaid();
  const warnings = await autoload(m, { root, ...options });
  return { m, warnings };
}

afterEach(() => vi.restoreAllMocks());

describe('autoload', () => {
  it('registers a diagram and an extension, with no other registration code', async () => {
    const root = app({
      'mermaid-box': diagram('mermaid-box', 'box'),
      'mermaid-mark': extension('mermaid-mark'),
    });
    const { m, warnings } = await loaded(root);
    expect(warnings).toEqual([]);
    const r = await m.render('a', 'box hello');
    expect(r.svg).toContain('box: hello');
    expect(r.svg).toContain('class="box marked"');
    expect(r.warnings).toEqual([]);
  });

  it('registers nothing until it is called, and nothing undeclared', async () => {
    const root = app(
      { declared: diagram('declared', 'declared'), hoisted: diagram('hoisted', 'hoisted') },
      undefined,
      { name: 'app', devDependencies: { declared: '1.0.0' } }
    );
    const m = createMermaid();
    await unsupported(m.render('a', 'declared x'));
    await autoload(m, { root });
    expect((await m.render('b', 'declared x')).svg).toContain('declared: x');
    await unsupported(m.render('c', 'hoisted x'));
  });

  it('starts from a folder below the app root and from the working directory by default', async () => {
    const root = app({ '@acme/box': diagram('@acme/box', 'box') });
    const deep = join(root, 'src', 'deep');
    mkdirSync(deep, { recursive: true });
    const below = createMermaid();
    await autoload(below, { root: deep });
    expect((await below.render('a', 'box x')).svg).toContain('box: x');
    vi.spyOn(process, 'cwd').mockReturnValue(deep);
    const byDefault = createMermaid();
    expect(await autoload(byDefault)).toEqual([]);
    expect((await byDefault.render('a', 'box y')).svg).toContain('box: y');
  });

  it('walks past type-marker package.json files to the app root', async () => {
    const root = app({ 'mermaid-box': diagram('mermaid-box', 'box') });
    const out = join(root, 'dist', 'server');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(root, 'dist', 'package.json'), '{"type":"commonjs"}');
    writeFileSync(join(out, 'package.json'), '{"type":"module"}');
    const { m } = await loaded(out);
    expect((await m.render('a', 'box x')).svg).toContain('box: x');
  });

  it('registers in package-name order, whatever the folder order', async () => {
    const root = app({
      'zz-plugin': diagram('zz-plugin', 'zz', 'same', 'zz'),
      'mm-plugin': diagram('mm-plugin', 'mm', 'same', 'mm'),
      'aa-plugin': diagram('aa-plugin', 'aa', 'same', 'aa'),
    });
    const order: string[] = [];
    const m = createMermaid();
    const register = m.registerExternalDiagrams;
    m.registerExternalDiagrams = (diagrams, options) => {
      order.push(...diagrams.map((d) => (d as { manifest: { id: string } }).manifest.id));
      return register(diagrams, options);
    };
    await autoload(m, { root });
    expect(order).toEqual(['aa', 'mm', 'zz']);
    // Detected in registration order: the first package wins a text all three detect.
    expect((await m.render('a', 'same x')).svg).toContain('aa: x');
  });

  it('gives a package that repeats an id an earlier package holds a warning, and keeps the first', async () => {
    const root = app({
      'b-plugin': diagram('b-plugin', 'dup', 'dup', 'b'),
      'a-plugin': diagram('a-plugin', 'dup', 'dup', 'a'),
      'x-mark': extension('x-mark', 'same'),
      'y-mark': extension('y-mark', 'same'),
    });
    const { m, warnings } = await loaded(root);
    expect(warnings).toMatchObject([
      { code: 'PLUGIN_SKIPPED', package: 'b-plugin' },
      { code: 'PLUGIN_SKIPPED', package: 'y-mark' },
    ]);
    expect(warnings[0]?.message).toBe(
      'Plugin package "b-plugin" was skipped: diagram dup belongs to "a-plugin"'
    );
    expect((await m.render('a', 'dup x')).svg).toContain('a: x');
  });

  it('never replaces a first-party id or type, and leaves mermaid’s own packages out', async () => {
    const root = app({
      'mermaid-flow': diagram('mermaid-flow', 'flowchart', 'flowchart'),
      '@mermaid-js/diagram-flowchart': pkg('@mermaid-js/diagram-flowchart', {
        plugin: 'diagram',
        id: 'flowchart',
        detector: './detector.js',
        entry: './index.js',
        export: 'flowchart',
      }),
      ok: diagram('ok', 'ok'),
    });
    const { m, warnings } = await loaded(root);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: 'PLUGIN_SKIPPED', package: 'mermaid-flow' });
    expect(warnings[0]?.message).toContain('first-party diagram id or type');
    const flow = await m.render('a', 'flowchart LR\n  A --> B\n');
    expect(flow.diagramType).toBe('flowchart-v2');
    expect((await m.render('b', 'ok fine')).svg).toContain('ok: fine');
  });

  it('registers a layout manifest (D177): its config module now, its entry when a diagram names it', async () => {
    const root = app({
      '@x/layout-grid': pkg(
        '@x/layout-grid',
        {
          plugin: 'layout',
          names: ['grid', 'grid.wide'],
          entry: './index.js',
          export: 'layouts',
          config: './config.js',
        },
        {
          'config.js':
            "export const config = { id: 'grid', keys: { grid: { gap: 0 } }, defaults: { grid: { gap: 5 } } };\n",
          'index.js': `globalThis.__gridLog ??= [];
const engine = (name) => (graph, ctx) => {
  globalThis.__gridLog.push(name + ':' + ctx.config.grid.gap);
  return globalThis.__gridLayered(graph, ctx);
};
export const layouts = ['grid', 'grid.wide'].map((name) => ({ name, loader: async () => engine(name) }));
`,
        }
      ),
    });
    const g = globalThis as { __gridLog?: string[]; __gridLayered?: unknown };
    const log: string[] = (g.__gridLog = []);
    g.__gridLayered = layered;
    const { m, warnings } = await loaded(root);
    expect(warnings).toEqual([]);
    const plain = await m.render('a', 'flowchart LR\n  A --> B\n');
    expect(plain.warnings).toEqual([]);
    expect(log).toEqual([]);
    const text =
      '---\nconfig:\n  layout: grid.wide\n  grid:\n    gap: 2\n---\nflowchart LR\n  A --> B\n';
    expect((await m.render('a', text)).warnings).toEqual([]);
    const other = '---\nconfig:\n  layout: grid\n---\nflowchart LR\n  A --> B\n';
    expect((await m.render('a', other)).warnings).toEqual([]);
    expect(log).toEqual(['grid.wide:2', 'grid:5']);
  });

  it('runs a layout package’s extension from its config module, on its own layouts only', async () => {
    const root = app({
      '@x/layout-hops': pkg(
        '@x/layout-hops',
        { plugin: 'layout', names: ['hops'], entry: './index.js', config: './config.js' },
        {
          'config.js': `export const config = { id: 'hops', keys: { hops: { on: 0 } }, defaults: { hops: { on: true } } };
${EXTENSION('hops').replace('export const mark', 'export const extension')}`,
          'index.js': `export default [{ name: 'hops', loader: async () => globalThis.__hopsLayered }];\n`,
        }
      ),
    });
    (globalThis as { __hopsLayered?: unknown }).__hopsLayered = layered;
    const { m } = await loaded(root);
    const flow = 'flowchart LR\n  A --> B\n';
    expect((await m.render('a', flow)).svg).not.toContain(' marked');
    const hops = await m.render('a', `---\nconfig:\n  layout: hops\n---\n${flow}`);
    expect(hops.warnings).toEqual([]);
    expect(hops.svg).toMatch(/^<svg [^>]*class="[^"]* marked"/);
  });

  it('registers each of two layout packages that claim one name once: the first by name keeps it', async () => {
    const layout = (name: string) =>
      pkg(
        name,
        { plugin: 'layout', names: ['shared'], entry: './index.js' },
        {
          'index.js': `export default [{ name: 'shared', loader: async () => globalThis.__hopsLayered }];\n`,
        }
      );
    const root = app({ 'l-b': layout('l-b'), 'l-a': layout('l-a') });
    const { warnings } = await loaded(root);
    expect(warnings).toMatchObject([{ package: 'l-b' }]);
    expect(warnings[0]?.message).toContain('layout shared belongs to "l-a"');
  });
});

describe('autoload never throws for a package’s sake', () => {
  it('skips a throwing import, a bad manifest, a confinement violation and a timeout, each with a warning, and registers the rest', async () => {
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-out-')));
    writeFileSync(join(elsewhere, 'detector.js'), DETECTOR('esc'));
    const root = app({
      throwing: diagram('throwing', 'throwing'),
      empty: diagram('empty', 'empty'),
      slow: diagram('slow', 'slow'),
      forever: diagram('forever', 'forever'),
      json: { 'package.json': '{ not json' },
      kind: pkg('kind', { plugin: 'theme', id: 'kind' }),
      slowext: extension('slowext'),
      escape: pkg(
        'escape',
        {
          plugin: 'diagram',
          id: 'escape',
          detector: join(elsewhere, 'detector.js'),
          entry: './index.js',
          export: 'plugin',
        },
        { 'index.js': ENTRY('escape') }
      ),
      ok: diagram('ok', 'ok'),
    });
    const at = join(root, 'node_modules');
    writeFileSync(join(at, 'throwing', 'detector.js'), 'throw new Error("boom");\n');
    writeFileSync(join(at, 'empty', 'detector.js'), 'export const x = 1;\n');
    writeFileSync(
      join(at, 'slow', 'detector.js'),
      'await new Promise((r) => setTimeout(r, 2000));\n'
    );
    // An import that never settles.
    writeFileSync(join(at, 'forever', 'detector.js'), 'await new Promise(() => {});\n');
    writeFileSync(join(at, 'slowext', 'index.js'), 'await new Promise(() => {});\n');
    const start = Date.now();
    const { m, warnings } = await loaded(root, { importTimeoutMs: 100 });
    // Imports run in parallel: one limit, not one per package.
    expect(Date.now() - start).toBeLessThan(1900);
    expect(skips(warnings).filter((w) => !w.startsWith('json:'))).toEqual([
      // The scan's skips, by package, then the imports', then the registry's.
      'escape: "detector" is outside the package',
      'kind: Invalid mermaid plugin manifest: "plugin" must be "diagram", "extension" or "layout"',
      'empty: the detector module exports no function',
      'forever: detector failed to load (timed out after 100 ms)',
      'slow: detector failed to load (timed out after 100 ms)',
      'throwing: detector failed to load (boom)',
      expect.stringMatching(/^Plugin package "slowext" was skipped: timed out after 100 ms/),
    ]);
    expect(warnings.find((w) => w.message.startsWith('json:'))?.message).toMatch(
      /unreadable package\.json/
    );
    expect((await m.render('a', 'ok fine')).svg).toContain('ok: fine');
    await unsupported(m.render('b', 'forever x'));
  });

  it('never times out a slow diagram entry during a render, only discovery-time imports', async () => {
    const root = app({ lazy: diagram('lazy', 'lazy'), ok: diagram('ok', 'ok') });
    writeFileSync(
      join(root, 'node_modules', 'lazy', 'index.js'),
      `await new Promise((r) => setTimeout(r, 400));\n${ENTRY('lazy')}`
    );
    const { m, warnings } = await loaded(root, { importTimeoutMs: 100 });
    expect(warnings).toEqual([]);
    expect((await m.render('a', 'lazy works')).svg).toContain('lazy: works');
  });

  it('gives a package the registry rejects a warning, and registers the others', async () => {
    const root = app({
      a: diagram('a', 'a'),
      b: diagram('b', 'b'),
      c: diagram('c', 'c'),
    });
    const m = createMermaid();
    const real = m.registerExternalDiagrams;
    const seen: string[] = [];
    m.registerExternalDiagrams = async (diagrams: readonly ExternalDiagram[], options) => {
      const id = (diagrams[0] as { manifest: { id: string } }).manifest.id;
      seen.push(id);
      if (id === 'b') throw new TypeError('the registry says no');
      return real(diagrams, options);
    };
    const warnings = await autoload(m, { root });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(warnings).toEqual([
      {
        code: 'PLUGIN_SKIPPED',
        message: 'Plugin package "b" was skipped: the registry says no',
        package: 'b',
      },
    ]);
    expect((await m.render('x', 'a 1')).svg).toContain('a: 1');
    expect((await m.render('y', 'c 2')).svg).toContain('c: 2');
    await unsupported(m.render('z', 'b 3'));
  });

  it('returns a log-only warning, once, and registers nothing, without a readable package.json', async () => {
    const root = app({ 'mermaid-box': diagram('mermaid-box', 'box') });
    writeFileSync(join(root, 'package.json'), '{ "name": "app", ');
    const { m, warnings } = await loaded(root);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: 'PLUGIN_DISCOVERY_NO_PACKAGE_JSON' });
    await unsupported(m.render('a', 'box x'));
  });

  it('returns a log-only warning when there is no package.json at or above the folder', async () => {
    const m = createMermaid();
    const warnings = await autoload(m, { root: '/' });
    expect(warnings.map((w) => w.code)).toEqual(['PLUGIN_DISCOVERY_NO_PACKAGE_JSON']);
  });

  it('reports a root without node_modules, naming the root', async () => {
    const root = app({});
    const { warnings } = await loaded(root);
    expect(warnings).toMatchObject([{ code: 'PLUGIN_DISCOVERY_NO_MODULES' }]);
    expect(warnings[0]?.message).toContain(root);
  });

  it('finds a declared link: package symlinked from elsewhere, still confined', async () => {
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-link-')));
    for (const [file, text] of Object.entries(diagram('linked', 'linked')))
      writeFileSync(join(elsewhere, file), text);
    const root = app({}, undefined, {
      name: 'app',
      dependencies: { linked: `link:${elsewhere}` },
    });
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    symlinkSync(elsewhere, join(root, 'node_modules', 'linked'));
    const { m, warnings } = await loaded(root);
    expect(warnings).toEqual([]);
    expect((await m.render('a', 'linked x')).svg).toContain('linked: x');
  });
});

describe('autoload and mermaid’s first-use discovery', () => {
  it('marks the instance, so first-use discovery stands down (no package twice, no skip twice)', async () => {
    const marker = Symbol.for('mermaid.autoloaded');
    const m = createMermaid();
    expect(marker in m).toBe(false);
    await autoload(m, { root: app({}) });
    expect(marker in m).toBe(true);
  });

  it('marks the instance before it awaits anything, so a render started at once cannot discover first', async () => {
    const marker = Symbol.for('mermaid.autoloaded');
    const m = createMermaid();
    const pending = autoload(m, { root: app({}) });
    expect(marker in m).toBe(true);
    await pending;
  });
});
