/**
 * `--plugin` and `--autoload` of the bin (D589), in process: how a package is found from the
 * project folder and which of its exports is the plugin. The process specs in `cli.spec.ts`
 * run the real bin.
 */
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { autoloadPlugins, PluginError, registerPlugin } from './cli-plugins.ts';
import { createMermaid } from './index.ts';

type Files = Record<string, string>;

const ROOT = join(import.meta.dirname, '..', '..', '..');
const execArgv = process.execArgv;
afterEach(() => void (process.execArgv = execArgv));

/** A temp project with `node_modules/<name>/<file>` for each package; returns its real path. */
function project(packages: Record<string, Files>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-cli-plugins-')));
  for (const [name, files] of Object.entries(packages))
    for (const [file, text] of Object.entries(files)) {
      const path = join(dir, 'node_modules', name, file);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, text);
    }
  return dir;
}

const pkg = (extra: Record<string, unknown> = {}, files: Files = {}): Files => ({
  'package.json': JSON.stringify({ name: 'p', version: '1.0.0', type: 'module', ...extra }),
  ...files,
});

/** A host that records what is registered. */
function host() {
  const seen: unknown[] = [];
  return {
    seen,
    registerExternalDiagrams: (diagrams: readonly unknown[]) => {
      seen.push(...diagrams);
      return Promise.resolve();
    },
  } as unknown as ReturnType<typeof createMermaid> & { seen: unknown[] };
}

/** A rejection that is not an `Error`: a registry may reject with anything. */
const notAnError = { toString: () => 'plain string' } as Error;
const plugin = (id: string) => `{ id: '${id}', detector: () => false, loader: async () => ({}) }`;
const reason = async (p: Promise<unknown>) => {
  const error = await p.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(PluginError);
  return (error as PluginError).message;
};

describe('registerPlugin: which export, from where', () => {
  it('registers the default export', async () => {
    const dir = project({
      a: pkg({ main: './index.js' }, { 'index.js': `export default ${plugin('a')};\n` }),
    });
    const h = host();
    await registerPlugin(h, 'a', dir);
    expect(h.seen).toMatchObject([{ id: 'a' }]);
  });

  it('prefers the export the mermaid manifest names, then the only plugin-shaped export', async () => {
    const dir = project({
      named: pkg(
        { main: './index.js', mermaid: { export: 'chosen' } },
        {
          'index.js': `export const other = ${plugin('x')};\nexport const chosen = ${plugin('named')};\n`,
        }
      ),
      only: pkg(
        { main: './index.js' },
        { 'index.js': `export const n = 1;\nexport const thing = ${plugin('only')};\n` }
      ),
      two: pkg(
        { main: './index.js' },
        { 'index.js': `export const a = ${plugin('a')};\nexport const b = ${plugin('b')};\n` }
      ),
    });
    const h = host();
    await registerPlugin(h, 'named', dir);
    await registerPlugin(h, 'only', dir);
    expect(h.seen).toMatchObject([{ id: 'named' }, { id: 'only' }]);
    expect(await reason(registerPlugin(h, 'two', dir))).toContain(
      '--plugin two: its main export is not a plugin'
    );
  });

  it('finds the package from a folder below the project, and falls back to index.js', async () => {
    const dir = project({ a: pkg({}, { 'index.js': `export default ${plugin('a')};\n` }) });
    const deep = join(dir, 'src', 'deep');
    mkdirSync(deep, { recursive: true });
    const h = host();
    await registerPlugin(h, 'a', deep);
    expect(h.seen).toHaveLength(1);
  });

  it('reads exports as a string, an array, a conditions object or a `.` map, under this process’s conditions', async () => {
    const dir = project({
      str: pkg({ exports: './s.js' }, { 's.js': `export default ${plugin('str')};\n` }),
      arr: pkg(
        { exports: [{ require: './nope.js' }, './a.js'] },
        { 'a.js': `export default ${plugin('arr')};\n` }
      ),
      cond: pkg(
        { exports: { custom: './c.js', default: './d.js' } },
        {
          'c.js': `export default ${plugin('custom')};\n`,
          'd.js': `export default ${plugin('plain')};\n`,
        }
      ),
      dot: pkg(
        { exports: { '.': { import: './i.js' }, './x': './x.js' } },
        { 'i.js': `export default ${plugin('dot')};\n` }
      ),
      bad: pkg({ exports: 5 }, { 'index.js': `export default ${plugin('bad')};\n` }),
    });
    const h = host();
    for (const name of ['str', 'arr', 'dot', 'bad', 'cond']) await registerPlugin(h, name, dir);
    expect(h.seen).toMatchObject([
      { id: 'str' },
      { id: 'arr' },
      { id: 'dot' },
      { id: 'bad' },
      { id: 'plain' },
    ]);
    // The conditions of this process count: --conditions=x, --conditions x and -C x.
    for (const flags of [['--conditions=custom'], ['--conditions', 'custom'], ['-C', 'custom']]) {
      process.execArgv = flags;
      const again = host();
      await registerPlugin(again, 'cond', dir);
      expect(again.seen).toMatchObject([{ id: 'custom' }]);
    }
  });

  it('exits with a message naming the package: not found, bad name, not a plugin, import fails, registry rejects', async () => {
    const dir = project({
      nomain: pkg({ main: './gone.js' }),
      empty: pkg({}, { 'index.js': 'export const x = 1;\n' }),
      boom: pkg({}, { 'index.js': 'throw new Error("boom");\n' }),
      reject: pkg({}, { 'index.js': `export default ${plugin('reject')};\n` }),
    });
    const h = host();
    expect(await reason(registerPlugin(h, 'missing', dir))).toBe(
      `--plugin missing: package not found from ${dir} (install it in your project)`
    );
    expect(await reason(registerPlugin(h, 'nomain', dir))).toContain('package not found');
    for (const bad of ['', '../x', '@scope', 'a/b', '.hidden'])
      expect(await reason(registerPlugin(h, bad, dir))).toBe(`--plugin ${bad}: not a package name`);
    expect(await reason(registerPlugin(h, 'empty', dir))).toContain('not a plugin');
    expect(await reason(registerPlugin(h, 'boom', dir))).toBe(
      '--plugin boom: cannot import it (boom)'
    );
    const strict = {
      registerExternalDiagrams: () => Promise.reject(new TypeError('no thanks')),
    } as unknown as ReturnType<typeof createMermaid>;
    expect(await reason(registerPlugin(strict, 'reject', dir))).toBe('--plugin reject: no thanks');
    const odd = {
      registerExternalDiagrams: () => Promise.reject(notAnError),
    } as unknown as ReturnType<typeof createMermaid>;
    expect(await reason(registerPlugin(odd, 'reject', dir))).toBe('--plugin reject: plain string');
  });

  it('registers a real lazy diagram on a mermaid instance', async () => {
    const dir = project({
      lazy: pkg({}, { 'index.js': `export default ${plugin('lazy')};\n` }),
    });
    const m = createMermaid();
    await registerPlugin(m, 'lazy', dir);
    expect(m.detectType('flowchart LR\n  A --> B\n')).toBe('flowchart-v2');
  });
});

describe('autoloadPlugins: @mermaid-js/plugin-autoload from the project', () => {
  /** The project with the real package linked in, read through the source condition. */
  function linked(): string {
    const dir = project({});
    mkdirSync(join(dir, 'node_modules', '@mermaid-js'), { recursive: true });
    symlinkSync(
      join(ROOT, 'packages', 'plugin-autoload'),
      join(dir, 'node_modules', '@mermaid-js', 'plugin-autoload')
    );
    process.execArgv = ['--conditions=mermaid-source'];
    return dir;
  }

  it('calls autoload from the project and returns its warnings', async () => {
    const dir = linked();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { broken: '1.0.0' } })
    );
    mkdirSync(join(dir, 'node_modules', 'broken'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'broken', 'package.json'),
      JSON.stringify({ name: 'broken', mermaid: { plugin: 'theme' } })
    );
    const warnings = await autoloadPlugins(createMermaid(), dir);
    expect(warnings.map((w) => w.code)).toEqual(['PLUGIN_SKIPPED']);
    expect(warnings[0]?.message).toContain('broken');
  });

  it('exits with a message naming the package when it is not installed, cannot load or has no autoload', async () => {
    const dir = project({});
    const missing = await reason(autoloadPlugins(createMermaid(), dir));
    expect(missing).toContain('--autoload needs @mermaid-js/plugin-autoload');
    expect(missing).toContain('npm install -D @mermaid-js/plugin-autoload');
    const broken = project({
      '@mermaid-js/plugin-autoload': pkg({}, { 'index.js': 'throw new Error("boom");\n' }),
    });
    expect(await reason(autoloadPlugins(createMermaid(), broken))).toBe(
      '--autoload: cannot import @mermaid-js/plugin-autoload (boom)'
    );
    const wrong = project({
      '@mermaid-js/plugin-autoload': pkg({}, { 'index.js': 'export const x = 1;\n' }),
    });
    expect(await reason(autoloadPlugins(createMermaid(), wrong))).toBe(
      '--autoload: @mermaid-js/plugin-autoload does not export autoload'
    );
  });
});
