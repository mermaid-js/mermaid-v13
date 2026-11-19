/**
 * Process specs for the `mermaid` bin (R-ASCII-4, D85): each test spawns the CLI with node,
 * from source through tsx, and checks stdout, stderr and the exit code.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERSION } from './version.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const CLI = join(import.meta.dirname, 'cli.ts');

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

function cli(
  args: string[],
  stdin?: string,
  env: NodeJS.ProcessEnv = {},
  cwd = ROOT
): Promise<Run> {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--conditions=mermaid-source', CLI, ...args],
      { cwd, env: { ...process.env, ...env } }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (c: string) => (stdout += c));
    child.stderr.setEncoding('utf8').on('data', (c: string) => (stderr += c));
    child.on('error', fail);
    child.on('close', (code) => done({ code, stdout, stderr }));
    child.stdin.end(stdin ?? '');
  });
}

const FLOW = 'flowchart LR\n  A[Start] --> B(End)\n';
const DRAWN = [
  '┌───────┐      ╭─────╮',
  '│ Start ├─────►│ End │',
  '└───────┘      ╰─────╯',
  '',
].join('\n');
const DIR = mkdtempSync(join(tmpdir(), 'mermaid-cli-'));
const FILE = join(DIR, 'flow.mmd');
writeFileSync(FILE, FLOW);
const T = 30_000;

describe('mermaid render: input and output (R-ASCII-4, D85)', () => {
  it.concurrent(
    'renders a file as text to stdout',
    async () => {
      const r = await cli(['render', FILE, '--format', 'ascii']);
      expect(r).toEqual({ code: 0, stdout: DRAWN, stderr: '' });
    },
    T
  );

  it.concurrent(
    'reads stdin when the file is left out or is -',
    async () => {
      const [bare, dash] = await Promise.all([
        cli(['render', '--format', 'ascii'], FLOW),
        cli(['render', '-', '--format', 'ascii'], FLOW),
      ]);
      expect(bare).toEqual({ code: 0, stdout: DRAWN, stderr: '' });
      expect(dash).toEqual({ code: 0, stdout: DRAWN, stderr: '' });
    },
    T
  );

  it.concurrent(
    'renders svg',
    async () => {
      const r = await cli(['render', FILE, '--format', 'svg']);
      expect(r.code).toBe(0);
      expect(r.stderr).toBe('');
      expect(r.stdout.startsWith('<svg')).toBe(true);
      expect(r.stdout.endsWith('</svg>\n')).toBe(true);
      expect(r.stdout).toContain('Start');
    },
    T
  );

  it.concurrent(
    'draws pure ascii with --charset ascii',
    async () => {
      const r = await cli(['render', FILE, '--format', 'ascii', '--charset', 'ascii']);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('| Start +');
      expect([...r.stdout].every((c) => c.charCodeAt(0) < 128)).toBe(true);
    },
    T
  );

  it.concurrent(
    'fits --width N columns, turning LR into TB',
    async () => {
      const r = await cli(['render', FILE, '--format', 'ascii', '--width', '10']);
      expect(r.code).toBe(0);
      expect(r.stderr).toBe('');
      const lines = r.stdout.trimEnd().split('\n');
      expect(Math.max(...lines.map((l) => [...l].length))).toBeLessThanOrEqual(10);
      expect(lines[0]).toBe('┌───────┐');
    },
    T
  );

  it.concurrent(
    '--charset and --width win over the diagram text (front matter and directives)',
    async () => {
      const own = `---\nconfig:\n  ascii:\n    charset: unicode\n    maxWidth: 5\n---\n${FLOW}`;
      const directive = `%%{init: {"ascii": {"charset": "unicode"}}}%%\n${FLOW}`;
      const [fm, dir] = await Promise.all([
        cli(
          ['render', '--format', 'ascii', '--charset', 'ascii', '--width', '80', '--warnings'],
          own
        ),
        cli(['render', '--format', 'ascii', '--charset', 'ascii'], directive),
      ]);
      expect(fm).toMatchObject({ code: 0, stderr: '' });
      expect(fm.stdout).toContain('| Start +');
      expect(dir.stdout).toContain('| Start +');
    },
    T
  );

  it.concurrent(
    "--width auto uses the terminal's columns (COLUMNS off a TTY)",
    async () => {
      const [narrow, wide] = await Promise.all([
        cli(['render', FILE, '--format', 'ascii', '--width', 'auto'], undefined, { COLUMNS: '10' }),
        cli(['render', FILE, '--format', 'ascii', '--width', 'auto'], undefined, { COLUMNS: '80' }),
      ]);
      expect(narrow.stdout.split('\n')[0]).toBe('┌───────┐');
      expect(wide.stdout).toBe(DRAWN);
    },
    T
  );
});

describe('mermaid render: sequence diagrams (#145)', () => {
  it.concurrent(
    'exits 2 for a built-in type with no text form (the state diagram)',
    async () => {
      const r = await cli(['render', '--format', 'ascii'], 'stateDiagram-v2\n  [*] --> A\n');
      expect(r).toEqual({
        code: 2,
        stdout: '',
        stderr: '<stdin>: Diagram type "stateDiagram" cannot be rendered as ascii.\n',
      });
    },
    T
  );

  it.concurrent(
    'renders a sequence diagram from stdin as text',
    async () => {
      const r = await cli(['render', '--format', 'ascii'], 'sequenceDiagram\n  A->>B: hi\n');
      expect(r).toEqual({
        code: 0,
        stdout: [
          '┌───┐        ┌───┐',
          '│ A │        │ B │',
          '└─┬─┘        └─┬─┘',
          '  ┆            ┆',
          '  ┆    hi      ┆',
          '  ├───────────►┆',
          '  ┆            ┆',
          '┌─┴─┐        ┌─┴─┐',
          '│ A │        │ B │',
          '└───┘        └───┘',
          '',
        ].join('\n'),
        stderr: '',
      });
    },
    T
  );
});

describe('mermaid render: stderr and exit codes (R-ASCII-4, D85)', () => {
  it.concurrent(
    'writes warnings to stderr only with --warnings',
    async () => {
      const args = ['render', FILE, '--format', 'ascii', '--width', '5'];
      const [quiet, loud] = await Promise.all([cli(args), cli([...args, '--warnings'])]);
      expect(quiet.code).toBe(0);
      expect(quiet.stderr).toBe('');
      expect(loud.code).toBe(0);
      expect(loud.stdout).toBe(quiet.stdout);
      expect(loud.stderr).toBe(
        `${FILE}: warning ASCII_TOO_WIDE: The drawing is 9 columns wide; ascii.maxWidth is 5.\n`
      );
    },
    T
  );

  it.concurrent(
    'exits 1 with the R-ERR-2 snippet and caret on stderr for a syntax error',
    async () => {
      const r = await cli(['render', '--format', 'ascii'], 'flowchart LR\n A-->');
      expect(r.code).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toBe(
        [
          '<stdin>: Error at line 2, column 6: Expected a node id, got the end of the text.',
          '2 |  A-->',
          '  |      ^',
          'Expected: a node id',
          '',
        ].join('\n')
      );
    },
    T
  );

  it.concurrent(
    'exits 1 for a diagram type this build does not have',
    async () => {
      // ZenUML: a v12 diagram (external there) with no v13 package (D317).
      const r = await cli(['render', '--format', 'ascii'], 'zenuml\n  A.method()\n');
      expect(r.code).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain('Diagram type "zenuml" is not supported');
    },
    T
  );

  it.concurrent(
    'exits 1 on a missing file',
    async () => {
      const r = await cli(['render', join(DIR, 'nope.mmd'), '--format', 'ascii']);
      expect(r.code).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toBe(`mermaid: cannot read ${join(DIR, 'nope.mmd')} (ENOENT)\n`);
    },
    T
  );

  it.concurrent.each([
    [['render', FILE], '--format ascii|svg is required'],
    [['draw', FILE, '--format', 'ascii'], 'unknown command "draw"'],
    [[], 'missing command'],
    [['render', FILE, '--format', 'ascii', '--width', 'wide'], '--width must be'],
    [['render', FILE, '--format', 'ascii', '--charset', 'ebcdic'], '--charset must be'],
    [['render', FILE, '--format', 'ascii', '--colour'], "Unknown option '--colour'"],
    // Only ascii and svg are formats; exit 2 is the API's UNSUPPORTED_FORMAT for a type that
    // has no text form (the state diagram in 13.0, tested above).
    [['render', FILE, '--format', 'png'], '--format must be ascii or svg, got "png"'],
  ])(
    'exits 1 with usage help on stderr: %j',
    async (args, message) => {
      const r = await cli(args);
      expect(r.code).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain(message);
      expect(r.stderr).toContain("Run 'mermaid --help' for usage.");
    },
    T
  );
});

describe('mermaid CLI --help', () => {
  it('prints usage to stdout and exits 0', async () => {
    const r = await cli(['--help']);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toContain('mermaid render [file|-] --format ascii|svg');
    expect(r.stdout).toContain('--charset unicode|ascii');
    expect(r.stdout).toContain('win over ascii.charset and ascii.maxWidth');
    expect(r.stdout).toContain('--width');
    expect(r.stdout).toContain('--warnings');
  }, 30_000);

  it('prints the version', async () => {
    const r = await cli(['--version']);
    expect(r).toEqual({ code: 0, stdout: `${VERSION}\n`, stderr: '' });
  }, 30_000);
});

// --plugin and --autoload (D589), run one at a time (each spawns tsx; a burst starves other
// specs on the same CI shard): each test builds a project in a temp folder, with the plugin
// packages in its own node_modules, and runs the bin from there.
type Files = Record<string, string>;

const DIAGRAM = (id: string) => `{
  id: ${JSON.stringify(id)}, layoutKind: 'custom', formats: ['svg'], detector: (t) => t.trimStart().startsWith(${JSON.stringify(id)}),
  parse: (text) => ({ model: text.trim().split(' ').slice(1).join(' '), ast: { id: 'x', type: 'T', range: { start: 0, end: text.length } },
    diagnostics: [], symbols: [], statements: [] }),
  render(model, _l, ctx, w) {
    w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', class: ${JSON.stringify(id)}, viewBox: [0, 0, 10, 10] });
    w.open('text'); w.text(${JSON.stringify(id)} + ': ' + model); w.close(); w.close();
  },
}`;
const LAZY = (id: string) => `export default {
  id: ${JSON.stringify(id)},
  detector: (text) => text.trimStart().startsWith(${JSON.stringify(id)}),
  loader: async () => (${DIAGRAM(id)}),
};\n`;
const MARK = `{ id: 'mark', postRender(tree) {
  const [svg] = tree.children(tree.root);
  if (svg !== undefined) tree.setAttr(svg, 'class', tree.getAttr(svg, 'class') + ' marked');
} }`;

const manifestOf = (name: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name, version: '1.0.0', type: 'module', main: './index.js', ...extra });

/** A temp project declaring `packages` (name → files), plus tsx and what `links` names. */
function project(packages: Record<string, Files>, links: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'mermaid-cli-app-'));
  const dependencies = Object.fromEntries(Object.keys(packages).map((n) => [n, '1.0.0']));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', dependencies }));
  mkdirSync(join(dir, 'node_modules', '@mermaid-js'), { recursive: true });
  // The bin runs from the project, through tsx.
  symlinkSync(join(ROOT, 'node_modules', 'tsx'), join(dir, 'node_modules', 'tsx'));
  for (const [name, target] of Object.entries(links))
    symlinkSync(join(ROOT, target), join(dir, 'node_modules', name));
  for (const [name, files] of Object.entries(packages))
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(join(dir, 'node_modules', name, file, '..'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', name, file), text);
    }
  return dir;
}

const AUTOLOAD = { '@mermaid-js/plugin-autoload': 'packages/plugin-autoload' };
const lazyBox: Files = { 'package.json': manifestOf('mermaid-box'), 'index.js': LAZY('box') };
const inProject = (dir: string, text: string, ...args: string[]) =>
  cli(['render', '--format', 'svg', ...args], text, {}, dir);
const FLOW_TEXT = 'flowchart LR\n  A --> B\n';

describe('mermaid render --plugin (D589)', () => {
  it(
    'registers the lazy diagram a package exports by default, resolved from the project',
    async () => {
      const dir = project({ 'mermaid-box': lazyBox });
      const r = await inProject(dir, 'box hello', '--plugin', 'mermaid-box');
      expect(r.stderr).toBe('');
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('box: hello');
      // Without --plugin the type is unknown: the project's package alone does nothing.
      expect((await inProject(dir, 'box hello')).code).toBe(1);
    },
    T
  );

  it(
    'takes a full diagram plugin, a manifest-named export and an only plugin export; an import-only exports map works',
    async () => {
      const dir = project({
        'full-default': {
          'package.json': manifestOf('full-default', {
            exports: { '.': { import: './index.js' } },
          }),
          'index.js': `export default ${DIAGRAM('fd')};\n`,
        },
        'by-manifest': {
          'package.json': manifestOf('by-manifest', {
            mermaid: { plugin: 'diagram', id: 'bm', export: 'plugin' },
          }),
          'index.js': `export const helper = 1;\nexport const plugin = ${DIAGRAM('bm')};\n`,
        },
        'only-export': {
          'package.json': manifestOf('only-export'),
          'index.js': `export const helper = 1;\nexport const thing = ${DIAGRAM('oe')};\n`,
        },
      });
      const all = [
        '--plugin',
        'full-default',
        '--plugin',
        'by-manifest',
        '--plugin',
        'only-export',
      ];
      for (const [text, label] of [
        ['fd y', 'fd: y'],
        ['bm x', 'bm: x'],
        ['oe z', 'oe: z'],
      ] as const) {
        const r = await inProject(dir, text, ...all);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain(label);
      }
    },
    T
  );

  it(
    'registers an extension, and each repeated --plugin',
    async () => {
      const dir = project({
        'mermaid-box': lazyBox,
        'mermaid-mark': {
          'package.json': manifestOf('mermaid-mark', {
            mermaid: { plugin: 'extension', id: 'mark', entry: './index.js', export: 'mark' },
          }),
          'index.js': `export const mark = ${MARK};\n`,
        },
      });
      const r = await inProject(
        dir,
        'box hi',
        '--plugin',
        'mermaid-box',
        '--plugin',
        'mermaid-mark'
      );
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('class="box marked"');
    },
    T
  );

  it.each([
    [['--plugin', 'not-installed'], '--plugin not-installed: package not found'],
    [['--plugin', '../escape'], '--plugin ../escape: not a package name'],
    [['--plugin', 'no-plugin'], '--plugin no-plugin: its main export is not a plugin'],
    [['--plugin', 'bad-plugin'], '--plugin bad-plugin: '],
    [['--plugin', 'throws'], '--plugin throws: cannot import it (boom)'],
  ])(
    'exits 1 and names the package: %j',
    async (args, message) => {
      const dir = project({
        'no-plugin': {
          'package.json': manifestOf('no-plugin'),
          'index.js': 'export const x = 1;\n',
        },
        'bad-plugin': {
          'package.json': manifestOf('bad-plugin'),
          'index.js': "export default { id: 'bad', detector: 1 };\n",
        },
        throws: { 'package.json': manifestOf('throws'), 'index.js': 'throw new Error("boom");\n' },
      });
      const r = await inProject(dir, FLOW_TEXT, ...args);
      expect(r.code).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain(`mermaid: ${message}`);
    },
    T
  );
});

describe('mermaid render --autoload (D589)', () => {
  const declaredBox: Files = {
    'package.json': manifestOf('mermaid-box', {
      mermaid: {
        plugin: 'diagram',
        id: 'box',
        detector: './detector.js',
        entry: './entry.js',
        export: 'plugin',
      },
    }),
    'detector.js': "export const detector = (t) => t.trimStart().startsWith('box');\n",
    'entry.js': `export const plugin = ${DIAGRAM('box')};\n`,
  };

  it(
    'registers the plugins package.json lists, through @mermaid-js/plugin-autoload from the project',
    async () => {
      const dir = project({ 'mermaid-box': declaredBox }, AUTOLOAD);
      const r = await inProject(dir, 'box hello', '--autoload');
      expect(r).toMatchObject({ code: 0, stderr: '' });
      expect(r.stdout).toContain('box: hello');
    },
    T
  );

  it(
    'writes the packages autoload skipped with --warnings, and still renders',
    async () => {
      const broken = { 'package.json': manifestOf('broken', { mermaid: { plugin: 'theme' } }) };
      const dir = project({ broken }, AUTOLOAD);
      expect(await inProject(dir, FLOW_TEXT, '--autoload')).toMatchObject({ code: 0, stderr: '' });
      const loud = await inProject(dir, FLOW_TEXT, '--autoload', '--warnings');
      expect(loud.code).toBe(0);
      expect(loud.stderr).toContain(
        'mermaid: warning PLUGIN_SKIPPED: broken: Invalid mermaid plugin manifest'
      );
    },
    T
  );

  it(
    'writes the skipped package with --warnings even when the render then fails (exit 1)',
    async () => {
      const dir = project(
        {
          // Its manifest is invalid, so it is skipped and its diagram type stays unknown.
          'mermaid-box': {
            ...declaredBox,
            'package.json': manifestOf('mermaid-box', { mermaid: { plugin: 'theme' } }),
          },
        },
        AUTOLOAD
      );
      const r = await inProject(dir, 'box hello', '--autoload', '--warnings');
      expect(r.code).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain(
        'mermaid: warning PLUGIN_SKIPPED: mermaid-box: Invalid mermaid plugin manifest'
      );
      expect(r.stderr).toContain('<stdin>:');
      expect(r.stderr.indexOf('PLUGIN_SKIPPED')).toBeLessThan(r.stderr.indexOf('<stdin>:'));
    },
    T
  );

  it(
    'combines with --plugin',
    async () => {
      const dir = project({ 'mermaid-box': lazyBox, 'other-box': declaredBox }, AUTOLOAD);
      const r = await inProject(dir, 'box hi', '--autoload', '--plugin', 'mermaid-box');
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('box: hi');
    },
    T
  );

  it(
    'exits 1 naming @mermaid-js/plugin-autoload and how to install it when it is missing',
    async () => {
      const dir = project({ 'mermaid-box': declaredBox });
      const r = await inProject(dir, 'box hi', '--autoload');
      expect(r.code).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain('--autoload needs @mermaid-js/plugin-autoload');
      expect(r.stderr).toContain('npm install -D @mermaid-js/plugin-autoload');
    },
    T
  );

  it(
    'documents both flags in --help',
    async () => {
      const r = await cli(['--help']);
      expect(r.stdout).toContain('--plugin <package>');
      expect(r.stdout).toContain('--autoload');
      expect(r.stdout).toContain('@mermaid-js/plugin-autoload');
    },
    T
  );
});
