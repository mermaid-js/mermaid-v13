/**
 * Process specs for the `mermaid` bin (R-ASCII-4, D85): each test spawns the CLI with node,
 * from source through tsx, and checks stdout, stderr and the exit code.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const CLI = join(import.meta.dirname, 'cli.ts');

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

function cli(args: string[], stdin?: string, env: NodeJS.ProcessEnv = {}): Promise<Run> {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--conditions=mermaid-source', CLI, ...args],
      { cwd: ROOT, env: { ...process.env, ...env } }
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
      const r = await cli(['render', '--format', 'ascii'], 'pie\n "a": 1\n');
      expect(r.code).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain('"pie" is not supported');
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
    // has no text form, and every type built into 13.0 (the flowchart) has one (ascii.md).
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
    expect(r).toEqual({ code: 0, stdout: '13.0.0-alpha.0\n', stderr: '' });
  }, 30_000);
});
