/**
 * The bundler plugin (D164, R-PLUG-5) through a real bundler: a temp app is built with esbuild
 * and `plugins: [mermaid()]`, then its bundle renders in Node through `createMermaid().render()`.
 * The scan root is the bundler's project root (`absWorkingDir`), never `process.cwd()`. The
 * four-bundler browser apps are the e2e side (`e2e/platform/bundler-plugin.spec.ts`).
 */
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Message, type Plugin } from 'esbuild';
import { describe, expect, it } from 'vitest';
import mermaid from './esbuild.ts';

const MERMAID_DIR = realpathSync(join(import.meta.dirname, '..', '..', 'mermaid'));

const DETECTOR = (keyword: string) =>
  `export function detector(text) { return text.trimStart().startsWith(${JSON.stringify(keyword)}); }\n`;

/** A diagram entry drawing `<id>: <text>`; it counts its own evaluations on `globalThis`. */
const ENTRY = (id: string) => `globalThis.entryLoads = (globalThis.entryLoads ?? 0) + 1;
export const plugin = {
  id: ${JSON.stringify(id)}, layoutKind: 'custom', formats: ['svg'], detector: () => true,
  parse: (text) => ({ model: text.trim().split(' ').slice(1).join(' '), ast: { id: 'x', type: 'T', range: { start: 0, end: text.length } },
    diagnostics: [], symbols: [], statements: [] }),
  render(model, _l, ctx, w) {
    w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', class: ${JSON.stringify(id)}, viewBox: [0, 0, 10, 10] });
    w.open('text'); w.text(${JSON.stringify(id)} + ': ' + model); w.close(); w.close();
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

const pkg = (name: string, manifest: unknown, extra: Files = {}): Files => ({
  'package.json': JSON.stringify({ name, version: '1.0.0', type: 'module', mermaid: manifest }),
  ...extra,
});

const diagram = (name: string, id: string, keyword = id, detector = './detector.js'): Files =>
  pkg(
    name,
    { plugin: 'diagram', id, detector, entry: './index.js', export: 'plugin' },
    { 'detector.js': DETECTOR(keyword), 'index.js': ENTRY(id) }
  );

const extension = (name: string): Files =>
  pkg(
    name,
    { plugin: 'extension', id: 'mark', entry: './index.js', export: 'mark' },
    { 'index.js': EXTENSION }
  );

/** The app's entry: renders one text with a fresh API object and reports what came out. */
const MAIN = `import { createMermaid } from 'mermaid';
export async function draw(text, config) {
  const m = createMermaid();
  if (config) m.initialize(config);
  try {
    const r = await m.render('d', text);
    return { svg: r.svg, type: r.diagramType, warnings: r.warnings.map((w) => w.code + ' ' + w.message) };
  } catch (e) {
    return { error: e.code ?? String(e) };
  }
}
`;

/** A temp app: package.json, `main.js`, `node_modules/mermaid` (this workspace's) and `packages`. */
function app(packages: Record<string, Files>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-bundler-')));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));
  writeFileSync(join(root, 'main.js'), MAIN);
  mkdirSync(join(root, 'node_modules'));
  symlinkSync(MERMAID_DIR, join(root, 'node_modules', 'mermaid'), 'dir');
  for (const [name, files] of Object.entries(packages))
    for (const [file, text] of Object.entries(files)) {
      const path = join(root, 'node_modules', name, file);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, text);
    }
  return root;
}

interface Drawn {
  readonly svg?: string;
  readonly type?: string;
  readonly warnings?: readonly string[];
  readonly error?: string;
}

interface Built {
  draw(text: string, config?: Record<string, unknown>): Promise<Drawn>;
  /** The source files esbuild put into the entry chunk (`main.js`), app-relative. */
  readonly mainInputs: readonly string[];
  readonly buildWarnings: readonly Message[];
}

let builds = 0;

/** Builds `root/main.js` with esbuild (ESM, code splitting) and imports the bundle. */
async function bundle(root: string, plugins: Plugin[]): Promise<Built> {
  const outdir = join(root, `dist-${++builds}`);
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['main.js'],
    bundle: true,
    format: 'esm',
    splitting: true,
    platform: 'node',
    // This workspace's mermaid from its TypeScript sources.
    conditions: ['mermaid-source'],
    outdir,
    metafile: true,
    logLevel: 'silent',
    plugins,
  });
  const main = Object.entries(result.metafile.outputs).find(([, o]) => o.entryPoint === 'main.js');
  const mod = (await import(pathToFileURL(join(outdir, 'main.js')).href)) as Pick<Built, 'draw'>;
  return {
    draw: mod.draw,
    mainInputs: Object.keys(main![1].inputs),
    buildWarnings: result.warnings,
  };
}

const entryLoads = (): number => (globalThis as { entryLoads?: number }).entryLoads ?? 0;

describe('mermaid() for esbuild', () => {
  it('renders an installed diagram plugin, its entry imported only on first detection', async () => {
    const root = app({ 'boxes-plugin': diagram('boxes-plugin', 'boxes') });
    const built = await bundle(root, [mermaid()]);
    expect(built.mainInputs).toContain('node_modules/boxes-plugin/detector.js');
    expect(built.mainInputs).not.toContain('node_modules/boxes-plugin/index.js');
    const before = entryLoads();
    await built.draw('flowchart LR\n  A --> B\n');
    expect(entryLoads()).toBe(before);
    const out = await built.draw('boxes hello');
    expect(out.error).toBeUndefined();
    expect(out.type).toBe('boxes');
    expect(out.svg).toContain('boxes: hello');
    expect(entryLoads()).toBe(before + 1);
  });

  it('activates an installed extension on the first render', async () => {
    const root = app({ 'mark-ext': extension('mark-ext') });
    const built = await bundle(root, [mermaid()]);
    const out = await built.draw('flowchart LR\n  A --> B\n');
    expect(out.svg).toMatch(/<svg[^>]*class="[^"]*marked/);
  });

  it('without the plugin, the installed type gives UNSUPPORTED_DIAGRAM', async () => {
    const root = app({ 'boxes-plugin': diagram('boxes-plugin', 'boxes') });
    const built = await bundle(root, []);
    expect((await built.draw('boxes hello')).error).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('skips a package that fails confinement with a build warning and a first-render warning', async () => {
    const root = app({
      'boxes-plugin': diagram('boxes-plugin', 'boxes'),
      'escape-plugin': diagram('escape-plugin', 'escape', 'escape', '../boxes-plugin/detector.js'),
    });
    const built = await bundle(root, [mermaid()]);
    expect(built.buildWarnings.map((w) => w.text)).toEqual([
      expect.stringMatching(/^\[mermaid\] .*escape-plugin/),
    ]);
    const first = await built.draw('boxes hi');
    expect(first.type).toBe('boxes');
    expect(first.warnings).toEqual([expect.stringMatching(/^PLUGIN_SKIPPED .*escape-plugin/)]);
    expect((await built.draw('escape hi')).error).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('detects discovered diagrams in package-name order, whatever the install order', async () => {
    // Both detect `shared …`; the first package by name is asked first (D166).
    const root = app({
      'z-shared': diagram('z-shared', 'zeta', 'shared'),
      'a-shared': diagram('a-shared', 'alpha', 'shared'),
    });
    const built = await bundle(root, [mermaid()]);
    expect((await built.draw('shared x')).type).toBe('alpha');
  });

  it('honours initialize({ discovery: false })', async () => {
    const root = app({ 'boxes-plugin': diagram('boxes-plugin', 'boxes') });
    const built = await bundle(root, [mermaid()]);
    expect((await built.draw('boxes hello', { discovery: false })).error).toBe(
      'UNSUPPORTED_DIAGRAM'
    );
  });

  it('scans the root option instead of the bundler root', async () => {
    const plugins = app({ 'boxes-plugin': diagram('boxes-plugin', 'boxes') });
    const root = app({});
    const built = await bundle(root, [mermaid({ root: plugins })]);
    expect((await built.draw('boxes hello')).type).toBe('boxes');
  });
});
