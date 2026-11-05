/**
 * Node discovery (D165, R-PLUG-5): plugins in an app's own `node_modules` render with no
 * registration code; confinement failures skip a package with a warning and never throw.
 * Apps are temp folders; `nodeDiscovery({ cwd })` is the source the Node entry installs.
 */
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layered } from '@mermaid-js/core/layout';
import { describe, expect, it } from 'vitest';
import { discoverOnFirstUse } from './discovery.ts';
import { createMermaid, MermaidError } from './index.ts';
import { nodeDiscovery, type NodeDiscoveryOptions } from './node.ts';
import { scanPlugins } from './node-scan.ts';

const DETECTOR = (keyword: string) =>
  `export function detector(text) { return text.trimStart().startsWith(${JSON.stringify(keyword)}); }\n`;

/** A diagram entry drawing `<label>: <text>` in an svg of class `id`. */
const ENTRY = (id: string, label = id) => `export const plugin = {
  id: ${JSON.stringify(id)}, layoutKind: 'custom', formats: ['svg'], detector: () => true,
  parse: (text) => ({ model: text.trim().split(' ').slice(1).join(' '), ast: { id: 'x', type: 'T', range: { start: 0, end: text.length } },
    diagnostics: [], symbols: [], statements: [] }),
  render(model, _l, ctx, w) {
    w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', class: ${JSON.stringify(id)}, viewBox: [0, 0, 10, 10] });
    w.open('text'); w.text(${JSON.stringify(label)} + ': ' + model); w.close(); w.close();
  },
};\n`;

const EXTENSION = `export const mark = {
  id: 'mark',
  postRender(tree) {
    const [svg] = tree.children(tree.root);
    if (svg !== undefined) tree.setAttr(svg, 'class', tree.getAttr(svg, 'class') + ' marked');
  },
};\n`;

type Files = Record<string, string>;

const pkg = (name: string, mermaid: unknown, extra: Files = {}): Files => ({
  'package.json': JSON.stringify({ name, version: '1.0.0', type: 'module', mermaid }),
  ...extra,
});

const diagram = (name: string, id: string, keyword = id, label = id): Files =>
  pkg(
    name,
    { plugin: 'diagram', id, detector: './detector.js', entry: './index.js', export: 'plugin' },
    { 'detector.js': DETECTOR(keyword), 'index.js': ENTRY(id, label) }
  );

const extension = (name: string): Files =>
  pkg(
    name,
    { plugin: 'extension', id: 'mark', entry: './index.js', export: 'mark' },
    {
      'index.js': EXTENSION,
    }
  );

/** A temp app: a package.json and `node_modules/<name>/<file>` for each package. */
function app(packages: Record<string, Files>, base = mkdtempSync(join(tmpdir(), 'mmd-node-'))) {
  mkdirSync(base, { recursive: true });
  const root = realpathSync(base);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));
  for (const [name, files] of Object.entries(packages))
    for (const [file, text] of Object.entries(files)) {
      const path = join(root, 'node_modules', name, file);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, text);
    }
  return root;
}

function discovering(cwd: string, options: Omit<NodeDiscoveryOptions, 'cwd'> = {}) {
  const m = createMermaid();
  discoverOnFirstUse(m, nodeDiscovery({ cwd, ...options }));
  return m;
}

const skips = (warnings: readonly { code: string; message: string }[]) =>
  warnings.filter((w) => w.code === 'PLUGIN_SKIPPED').map((w) => w.message);

const unsupported = async (p: Promise<unknown>) => {
  const error = await p.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(MermaidError);
  expect((error as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
};

describe('Node discovery', () => {
  it('renders a discovered diagram and runs a discovered extension, with no registration', async () => {
    const root = app({
      'mermaid-box': diagram('mermaid-box', 'box'),
      'mermaid-mark': extension('mermaid-mark'),
    });
    const r = await discovering(root).render('a', 'box hello');
    expect(r.svg).toContain('box: hello');
    expect(r.svg).toContain('class="box marked"');
    expect(r.warnings).toEqual([]);
  });

  it('finds scoped packages and scans from a folder below the app root', async () => {
    const root = app({ '@acme/box': diagram('@acme/box', 'box') });
    mkdirSync(join(root, 'src', 'deep'), { recursive: true });
    expect((await discovering(join(root, 'src', 'deep')).render('a', 'box x')).svg).toContain(
      'box: x'
    );
  });

  it('is off with initialize({ discovery: false })', async () => {
    const m = discovering(app({ 'mermaid-box': diagram('mermaid-box', 'box') }));
    m.initialize({ discovery: false });
    await unsupported(m.render('a', 'box hello'));
  });

  it('cannot be turned off, or on, from front matter or directives', async () => {
    const root = app({ 'mermaid-box': diagram('mermaid-box', 'box') });
    const front = await discovering(root).render(
      'a',
      '---\nconfig:\n  discovery: false\n---\nbox x'
    );
    expect(front.svg).toContain('box x</text>');
    expect(front.warnings.map((w) => w.code)).toContain('CONFIG_SECURE_KEY');
    const directive = await discovering(root).render(
      'a',
      '%%{init: {"discovery": false}}%%\nbox x'
    );
    expect(directive.svg).toContain('box x</text>');
    expect(directive.warnings.map((w) => w.code)).toContain('CONFIG_SECURE_KEY');
    const off = discovering(root);
    off.initialize({ discovery: false });
    await unsupported(off.render('a', '---\nconfig:\n  discovery: true\n---\nbox x'));
  });

  it("never scans an ancestor folder's node_modules", async () => {
    const outer = app({ 'mermaid-box': diagram('mermaid-box', 'box') });
    const inner = app({}, join(outer, 'packages', 'inner'));
    await unsupported(discovering(inner).render('a', 'box x'));
  });

  it('skips paths outside the package, symlinks included, with a warning', async () => {
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-out-')));
    writeFileSync(join(elsewhere, 'detector.js'), DETECTOR('esc'));
    writeFileSync(join(elsewhere, 'index.js'), ENTRY('esc'));
    const manifest = (id: string, detector: string, entry = './index.js') => ({
      plugin: 'diagram',
      id,
      detector,
      entry,
      export: 'plugin',
    });
    const root = app({
      up: pkg('up', manifest('up', '../../../detector.js'), { 'index.js': ENTRY('up') }),
      abs: pkg('abs', manifest('abs', join(elsewhere, 'detector.js')), {
        'index.js': ENTRY('abs'),
      }),
      link: pkg('link', manifest('link', './detector.js'), { 'index.js': ENTRY('link') }),
      entry: pkg('entry', manifest('entry', './detector.js', '../../../index.js'), {
        'detector.js': DETECTOR('entry'),
      }),
      ok: diagram('ok', 'ok'),
    });
    symlinkSync(join(elsewhere, 'detector.js'), join(root, 'node_modules', 'link', 'detector.js'));
    const r = await discovering(root).render('a', 'ok fine');
    expect(r.svg).toContain('ok: fine');
    expect(skips(r.warnings)).toEqual([
      'abs: "detector" is outside the package',
      'entry: "entry" is outside the package',
      'link: "detector" is outside the package',
      'up: "detector" is outside the package',
    ]);
    expect(r.warnings.find((w) => w.code === 'PLUGIN_SKIPPED')).toMatchObject({ package: 'abs' });
  });

  it('skips a slow, failing or empty detector module, with a warning', async () => {
    const root = app({
      slow: diagram('slow', 'slow'),
      broken: diagram('broken', 'broken'),
      empty: diagram('empty', 'empty'),
      ok: diagram('ok', 'ok'),
    });
    const at = join(root, 'node_modules');
    writeFileSync(
      join(at, 'slow', 'detector.js'),
      'await new Promise((r) => setTimeout(r, 2000));\n'
    );
    writeFileSync(join(at, 'broken', 'detector.js'), 'throw new Error("boom");\n');
    writeFileSync(join(at, 'empty', 'detector.js'), 'export const x = 1;\n');
    const m = discovering(root, { importTimeoutMs: 200 });
    const r = await m.render('a', 'ok fine');
    expect(r.svg).toContain('ok: fine');
    expect(skips(r.warnings)).toEqual([
      'broken: detector failed to load (boom)',
      'empty: the detector module exports no function',
      'slow: detector failed to load (timed out after 200 ms)',
    ]);
    await unsupported(m.render('b', 'slow x'));
  });

  it('skips bad JSON and invalid or incomplete manifests, and never throws', async () => {
    const root = app({
      json: { 'package.json': '{ not json' },
      kind: pkg('kind', { plugin: 'theme', id: 'kind' }),
      nodetector: pkg('nodetector', { plugin: 'diagram', id: 'nodet', entry: './index.js' }),
      missing: pkg(
        'missing',
        { plugin: 'diagram', id: 'missing', detector: './nope.js', entry: './index.js' },
        { 'index.js': ENTRY('missing') }
      ),
      layout: pkg('layout', { plugin: 'layout', names: ['tree'], entry: './nope.js' }),
      plain: { 'package.json': JSON.stringify({ name: 'plain' }) },
      stray: {},
      ok: diagram('ok', 'ok'),
    });
    const r = await discovering(root).render('a', 'ok fine');
    expect(r.svg).toContain('ok: fine');
    const messages = skips(r.warnings);
    expect(messages).toHaveLength(5);
    expect(messages[0]).toMatch(/^json: unreadable package\.json/);
    expect(messages.slice(1)).toEqual([
      'kind: Invalid mermaid plugin manifest: "plugin" must be "diagram", "extension" or "layout"',
      'layout: "entry" (./nope.js) does not exist',
      'missing: "detector" (./nope.js) does not exist',
      'nodetector: the manifest has no "detector"',
    ]);
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
    const m = discovering(root);
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

  it('gives the first-party skip rule (D166) its warning, and leaves mermaid’s own packages out', async () => {
    const root = app({
      'mermaid-flow': diagram('mermaid-flow', 'flowchart', 'flowchart'),
      // npm hoists mermaid's dependencies next to the app's plugins.
      '@mermaid-js/diagram-flowchart': pkg('@mermaid-js/diagram-flowchart', {
        plugin: 'diagram',
        id: 'flowchart',
        export: 'flowchart',
      }),
      mermaid: pkg('mermaid', undefined),
    });
    const r = await discovering(root).render('a', 'flowchart LR\n  A --> B\n');
    expect(r.diagramType).toBe('flowchart-v2');
    const warnings = r.warnings.filter((w) => w.code === 'PLUGIN_SKIPPED');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ package: 'mermaid-flow' });
  });

  it('detects discovered diagrams in package-name order, whatever the folder order', async () => {
    const root = app({
      'zz-plugin': diagram('zz-plugin', 'zz', 'same', 'zz'),
      'aa-plugin': diagram('aa-plugin', 'aa', 'same', 'aa'),
    });
    expect((await scanPlugins(root)).packages.map((p) => p.package)).toEqual([
      'aa-plugin',
      'zz-plugin',
    ]);
    expect((await discovering(root).render('a', 'same x')).svg).toContain('aa: x');
  });

  it('scans once per root and puts its warnings on the first render only', async () => {
    const root = app({ ok: diagram('ok', 'ok'), bad: { 'package.json': '{' } });
    const m = discovering(root);
    const [a, b] = await Promise.all([m.render('a', 'ok 1'), m.preload({})]);
    void b;
    expect(skips(a.warnings)).toHaveLength(1);
    expect(skips((await m.render('b', 'ok 2')).warnings)).toEqual([]);
  });

  it('never times out a slow diagram entry during render, only discovery-time imports', async () => {
    const root = app({
      lazy: diagram('lazy', 'lazy'),
      slowext: extension('slowext'),
      ok: diagram('ok', 'ok'),
    });
    const at = join(root, 'node_modules');
    const slow = 'await new Promise((r) => setTimeout(r, 600));\n';
    writeFileSync(join(at, 'lazy', 'index.js'), slow + ENTRY('lazy'));
    writeFileSync(join(at, 'slowext', 'index.js'), slow + EXTENSION);
    const m = discovering(root, { importTimeoutMs: 200 });
    const first = await m.render('a', 'ok fine');
    // The extension entry loads at discovery, under the limit: skipped, never applied.
    expect(first.svg).not.toContain('marked');
    expect(first.warnings.map((w) => w.message).join('\n')).toMatch(/timed out after 200 ms/);
    // The diagram entry loads on first detection: slow, but the render succeeds.
    expect((await m.render('b', 'lazy works')).svg).toContain('lazy: works');
  });

  it('walks past type-marker package.json files to the app root', async () => {
    const root = app({ 'mermaid-box': diagram('mermaid-box', 'box') });
    const out = join(root, 'dist', 'server');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(root, 'dist', 'package.json'), '{"type":"commonjs"}');
    writeFileSync(join(out, 'package.json'), '{"type":"module"}');
    expect((await discovering(out).render('a', 'box x')).svg).toContain('box: x');
  });

  it('warns once, naming the root, when the app root has no node_modules', async () => {
    const root = app({});
    const m = discovering(root);
    const r = await m.render('f', 'flowchart LR\n  A --> B\n');
    const empty = r.warnings.filter((w) => w.code === 'PLUGIN_DISCOVERY_NO_MODULES');
    expect(empty).toHaveLength(1);
    expect(empty[0]?.message).toContain(root);
    expect((await m.render('g', 'flowchart LR\n  A --> B\n')).warnings).toEqual([]);
  });

  it('does nothing without a package.json above the folder', async () => {
    const m = createMermaid();
    discoverOnFirstUse(m, nodeDiscovery({ cwd: '/' }));
    expect((await m.render('f', 'flowchart LR\n  A --> B\n')).diagramType).toBe('flowchart-v2');
  });
});
