/**
 * Temp apps for the autoload and scan specs: a package.json that declares its packages and
 * `node_modules/<name>/<file>` for each, plus the plugin packages the specs install.
 */
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Files = Record<string, string>;

export const DETECTOR = (keyword: string): string =>
  `export function detector(text) { return text.trimStart().startsWith(${JSON.stringify(keyword)}); }\n`;

/** A diagram entry drawing `<label>: <text>` in an svg of class `id`. */
export const ENTRY = (id: string, label = id): string => `export const plugin = {
  id: ${JSON.stringify(id)}, layoutKind: 'custom', formats: ['svg'], detector: () => true,
  parse: (text) => ({ model: text.trim().split(' ').slice(1).join(' '), ast: { id: 'x', type: 'T', range: { start: 0, end: text.length } },
    diagnostics: [], symbols: [], statements: [] }),
  render(model, _l, ctx, w) {
    w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', class: ${JSON.stringify(id)}, viewBox: [0, 0, 10, 10] });
    w.open('text'); w.text(${JSON.stringify(label)} + ': ' + model); w.close(); w.close();
  },
};\n`;

/** An extension that adds ` marked` to the svg's class. */
export const EXTENSION = (id = 'mark'): string => `export const mark = {
  id: ${JSON.stringify(id)},
  postRender(tree) {
    const [svg] = tree.children(tree.root);
    if (svg !== undefined) tree.setAttr(svg, 'class', tree.getAttr(svg, 'class') + ' marked');
  },
};\n`;

/** A package's files: its package.json (with the `mermaid` manifest) and `extra`. */
export const pkg = (name: string, mermaid: unknown, extra: Files = {}): Files => ({
  'package.json': JSON.stringify({ name, version: '1.0.0', type: 'module', mermaid }),
  ...extra,
});

export const diagram = (name: string, id: string, keyword = id, label = id): Files =>
  pkg(
    name,
    { plugin: 'diagram', id, detector: './detector.js', entry: './index.js', export: 'plugin' },
    { 'detector.js': DETECTOR(keyword), 'index.js': ENTRY(id, label) }
  );

export const extension = (name: string, id = 'mark'): Files =>
  pkg(
    name,
    { plugin: 'extension', id, entry: './index.js', export: 'mark' },
    { 'index.js': EXTENSION(id) }
  );

/**
 * A temp app: `node_modules/<name>/<file>` for each package, and a package.json declaring
 * them all in `dependencies`, or declaring `manifest` instead when given. Returns its real path.
 */
export function app(
  packages: Record<string, Files>,
  base = mkdtempSync(join(tmpdir(), 'mmd-autoload-')),
  manifest?: Record<string, unknown>
): string {
  mkdirSync(base, { recursive: true });
  const root = realpathSync(base);
  const dependencies = Object.fromEntries(Object.keys(packages).map((name) => [name, '1.0.0']));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify(manifest ?? { name: 'app', private: true, dependencies })
  );
  for (const [name, files] of Object.entries(packages))
    for (const [file, text] of Object.entries(files)) {
      const path = join(root, 'node_modules', name, file);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, text);
    }
  return root;
}

/** The messages of the `PLUGIN_SKIPPED` warnings among `warnings`. */
export const skips = (warnings: readonly { code: string; message: string }[]): string[] =>
  warnings.filter((w) => w.code === 'PLUGIN_SKIPPED').map((w) => w.message);
