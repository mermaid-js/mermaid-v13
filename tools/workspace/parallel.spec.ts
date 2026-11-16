import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../../vitest.config.ts';
import { ROOT } from './diagrams.ts';
import { checkPhases, printResult, runAll, staticSteps, stepLanes, type Task } from './parallel.ts';

const scripts = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

const node = (label: string, code: string): Task => ({
  label,
  command: process.execPath,
  args: ['-e', code],
});

describe('runAll', { timeout: 60_000 }, () => {
  it('runs every task to the end and reports each failure', async () => {
    const results = await runAll(
      [
        node('fails', 'process.stdout.write("broken"); process.exit(3)'),
        node('passes', 'process.stdout.write("fine")'),
        node('also fails', 'throw new Error("boom")'),
      ],
      { cwd: ROOT, lanes: 1 }
    );
    const byLabel = Object.fromEntries(results.map((r) => [r.task.label, r]));
    expect(results).toHaveLength(3);
    expect(byLabel.fails!.ok).toBe(false);
    expect(byLabel.fails!.output).toBe('broken');
    expect(byLabel.passes!.ok).toBe(true);
    expect(byLabel['also fails']!.ok).toBe(false);
    expect(byLabel['also fails']!.output).toMatch(/boom/);
  });

  it('fails a task whose command cannot start', async () => {
    const [result] = await runAll(
      [{ label: 'missing', command: 'no-such-command-anywhere', args: [] }],
      { cwd: ROOT }
    );
    expect(result!.ok).toBe(false);
  });

  it('runs no more than `lanes` tasks at once', async () => {
    // Each task holds a lock file for a moment; with one lane none ever sees another's.
    const code = (name: string) => `
      const fs = require('node:fs');
      const lock = require('node:path').join(require('node:os').tmpdir(), 'parallel-spec-lock-${process.pid}');
      if (fs.existsSync(lock)) process.exit(9);
      fs.writeFileSync(lock, '${name}');
      setTimeout(() => fs.rmSync(lock), 200);`;
    const results = await runAll([node('a', code('a')), node('b', code('b'))], {
      cwd: ROOT,
      lanes: 1,
    });
    expect(results.map((r) => r.ok)).toEqual([true, true]);
  });

  it('runs the follow-up tasks `onDone` hands back, in parallel, instead of the result', async () => {
    const results = await runAll([node('split me', 'process.exit(3)'), node('other', '')], {
      cwd: ROOT,
      lanes: 4,
      onDone: (r) =>
        r.code === 3 ? [node('part 1', ''), node('part 2', 'process.exit(1)')] : undefined,
    });
    expect(results.map((r) => `${r.task.label}:${r.ok}`).sort()).toEqual([
      'other:true',
      'part 1:true',
      'part 2:false',
    ]);
  });

  it('runs a `nice` task at a lower priority', async () => {
    const priority = 'process.stdout.write(String(require("node:os").getPriority()))';
    const [plain] = await runAll([node('plain', priority)], { cwd: ROOT });
    const [low] = await runAll([{ ...node('low', priority), nice: true }], { cwd: ROOT });
    expect(Number(low!.output)).toBe(Number(plain!.output) + 10);
  });

  it('ends a task when its process exits, even if a grandchild still holds its output', async () => {
    // The grandchild inherits stdout and sleeps for ten minutes; the task must not wait for it
    // (the spec's timeout is the bar). It prints its pid so the spec can stop it.
    const orphan = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)'], {
        stdio: 'inherit', detached: true,
      });
      process.stdout.write('pid ' + child.pid + ' ');
      child.unref();`;
    const [result] = await runAll([node('orphan', orphan)], { cwd: ROOT });
    const pid = Number(/pid (\d+)/.exec(result!.output)?.[1]);
    process.kill(pid);
    expect(result!.ok).toBe(true);
  });

  it('prints the status line, then the output', () => {
    let printed = '';
    printResult(
      { task: node('x', ''), ok: false, code: 1, output: 'line\n', seconds: 1.5 },
      (s) => (printed += s)
    );
    expect(printed).toBe('FAILED x (1.5 s)\nline\n');
  });
});

describe('parallel-cli', { timeout: 60_000 }, () => {
  const cli = (...commands: string[]) =>
    spawnSync(
      join(ROOT, 'node_modules', '.bin', 'tsx'),
      ['tools/workspace/parallel-cli.ts', ...commands],
      { cwd: ROOT, encoding: 'utf8' }
    );

  it('fails when any step fails, after running every step', () => {
    const run = cli('echo first', 'false', 'echo last');
    expect(run.status).toBe(1);
    expect(run.stdout).toMatch(/ok {5}echo first/);
    expect(run.stdout).toMatch(/ok {5}echo last/);
    expect(run.stdout).toMatch(/1 of 3 steps failed: false/);
  });

  it('passes when every step passes', () => {
    expect(cli('true', 'echo fine').status).toBe(0);
  });
});

describe('pnpm check:static', () => {
  it('runs every static check, side by side', () => {
    expect(staticSteps(scripts['check:static']!)).toEqual([
      'pnpm lint',
      'pnpm lint:knip',
      'pnpm typecheck',
      'pnpm check:deps',
      'pnpm check:licenses',
      'tsx tools/workspace/check-generated-cli.ts',
    ]);
  });

  it('reads a plain chain too, and refuses what it cannot read', () => {
    expect(staticSteps('a && b')).toEqual(['a', 'b']);
    expect(() => staticSteps("tsx tools/workspace/parallel-cli.ts 'a' b")).toThrow();
  });
});

describe('pnpm check', () => {
  // The language budget specs time an editing cycle against bare parses: as in `pnpm test`,
  // where they are the last group, they run once everything else has ended (vitest.config.ts).
  const ALONE = ['language-budget'];

  it('runs the static checks beside the unit tests, then the language budget specs alone', () => {
    expect(scripts.check).toBe('tsx tools/workspace/check-cli.ts');
    expect(checkPhases({})).toEqual([
      ['pnpm check:static', 'pnpm test:main'],
      ['pnpm test:budget'],
    ]);
  });

  // release-alpha.yml runs `pnpm check` on a 4-vCPU runner, where specs that assert wall-clock
  // limits would suffer from the static checks beside them.
  it('runs one step after another under CI, as before', () => {
    for (const CI of ['true', '1']) {
      expect(checkPhases({ CI })).toEqual([['pnpm check:static'], ['pnpm test']]);
      expect(stepLanes(6, { CI })).toBe(1);
    }
    expect(stepLanes(6, {})).toBe(6);
    expect(stepLanes(6, { CI: 'false' })).toBe(6);
  });

  it('runs every vitest project once between its two test steps', () => {
    const projects = (vitestConfig.test?.projects ?? []).map(
      (p) => (p as { test: { name: string } }).test.name
    );
    expect(projects).toEqual(expect.arrayContaining(ALONE));
    // The main step excludes exactly those projects, so a new project runs there.
    expect(scripts['test:main']).toBe(
      `vitest run ${ALONE.map((name) => `--project=!${name}`).join(' ')}`
    );
    expect(scripts['test:budget']).toBe(
      `vitest run ${ALONE.map((name) => `--project=${name}`).join(' ')}`
    );
    expect(scripts.test).toBe('vitest run');
  });
});
