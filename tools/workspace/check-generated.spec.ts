import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  checkGenerated,
  regenChecks,
  regenSteps,
  report,
  UNCHECKED_STEPS,
} from './check-generated.ts';
import { ROOT } from './diagrams.ts';
import { staticSteps } from './parallel.ts';

const scripts = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

describe('the generated-files check (#694)', () => {
  it('has a check for every step of `pnpm regen`', () => {
    const steps = regenSteps(scripts.regen!);
    expect(steps.length).toBeGreaterThanOrEqual(8);
    // A new regen step fails here until `check-generated.ts` knows how to check it.
    const checks = regenChecks(scripts.regen!);
    expect(checks.map((c) => c.step)).toEqual(steps.filter((s) => !UNCHECKED_STEPS.has(s)));
    expect([...UNCHECKED_STEPS]).toEqual(['pnpm install']);
    for (const { step, check } of checks) expect(check, step).not.toBe(step);
  });

  it('rejects a regen step it has no check for', () => {
    expect(() => regenChecks('pnpm gen:config && pnpm gen:something-new')).toThrow(
      /pnpm gen:something-new/
    );
  });

  it('runs as part of `pnpm check:static`', () => {
    expect(staticSteps(scripts['check:static']!)).toContain(
      'tsx tools/workspace/check-generated-cli.ts'
    );
  });

  it('runs every check, and names each stale step and the command that fixes it', () => {
    const ran: string[] = [];
    const failures = checkGenerated(scripts.regen!, (command) => {
      ran.push(command);
      return !command.includes('gen:theme') && !command.includes('goldens.spec.ts');
    });
    expect(ran).toEqual(regenChecks(scripts.regen!).map((c) => c.check));
    expect(failures.map((f) => f.step)).toEqual([
      'pnpm gen:theme',
      'vitest run packages/language-service/src/goldens.spec.ts -t no-diagram -u',
    ]);
    const text = report(failures);
    expect(text).toContain('`pnpm gen:theme`');
    expect(text).toContain(
      '`vitest run packages/language-service/src/goldens.spec.ts -t no-diagram -u`'
    );
    expect(text).toContain('`pnpm regen`');
    expect(report([])).toBe('');
  });
});

describe('.gitignore (#694)', () => {
  // `git check-ignore` answers for a path that does not exist, so nothing is written.
  const ignored = (path: string): boolean => {
    try {
      execFileSync('git', ['check-ignore', '-q', path], { cwd: ROOT });
      return true;
    } catch {
      return false;
    }
  };

  it('does not ignore a new file under a diagram package’s grammar/generated/', () => {
    expect(ignored('packages/diagram-zzdemo/grammar/generated/zzdemo.tokens.json')).toBe(false);
  });

  it('still ignores a generated/ folder nothing lists', () => {
    expect(ignored('packages/core/src/language/generated/ast.ts')).toBe(true);
  });
});

/** Each generator's own `--check`: it lists the stale files, names its step, and writes nothing. */
describe('emit (gen-config’s write-or-check)', async () => {
  const { emit } = await import('../gen-config/src/emit.ts');
  const scratch = mkdtempSync(join(tmpdir(), 'mermaid-emit-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));
  const fresh = join(scratch, 'fresh.ts');
  const stale = join(scratch, 'sub/stale.ts');
  writeFileSync(fresh, 'a\n');
  const files = new Map([
    [fresh, 'a\n'],
    [stale, 'b\n'],
  ]);

  it('--check reports the stale files and the step, and writes nothing', () => {
    const lines: string[] = [];
    expect(emit(files, { check: true, step: 'pnpm gen:x', log: (l) => lines.push(l) })).toBe(false);
    expect(lines.join('')).toContain('run `pnpm gen:x`');
    expect(lines.join('')).toContain(stale);
    expect(lines.join('')).not.toContain(fresh);
    expect(() => readFileSync(stale)).toThrow();
  });

  it('writes the stale files otherwise, and then --check passes', () => {
    expect(emit(files, { check: false, step: 'pnpm gen:x', log: () => undefined })).toBe(true);
    expect(readFileSync(stale, 'utf8')).toBe('b\n');
    expect(emit(files, { check: true, step: 'pnpm gen:x', log: () => undefined })).toBe(true);
  });
});
