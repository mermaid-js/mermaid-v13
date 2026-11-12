/**
 * Locale independence of the swimlane engine (R-ARCH-6, DESIGN §12.4, #676): the same source
 * renders the same bytes whatever the host locale. Rendering twice in one process cannot see
 * this, so each fixture in `swimlane/locale/` is rendered by the CLI in two child processes: one
 * under `en_US` and one under the locale the file is named after, whose collation orders the
 * fixture's node ids differently from code-unit order.
 */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

const DIR = join(import.meta.dirname, 'swimlane', 'locale');
const CLI = join(REPO_ROOT, 'packages/mermaid/src/cli.ts');
const LOCALES = readdirSync(DIR)
  .filter((f) => f.endsWith('.mmd'))
  .map((f) => f.slice(0, -'.mmd'.length))
  .sort();
const T = 60_000;

/** Runs node with `args` under `locale` (every other locale variable unset); resolves stdout. */
function node(locale: string, args: string[]): Promise<string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k !== 'LANG' && !k.startsWith('LC_'))
  );
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      env: { ...env, LC_ALL: `${locale}.UTF-8` },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (c: string) => (stdout += c));
    child.stderr.setEncoding('utf8').on('data', (c: string) => (stderr += c));
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done(stdout) : fail(new Error(`node exited with ${code}: ${stderr}`))
    );
    child.stdin.end();
  });
}

const render = (locale: string, file: string): Promise<string> =>
  node(locale, [
    '--import',
    'tsx',
    '--conditions=mermaid-source',
    CLI,
    'render',
    join(DIR, file),
    '--format',
    'svg',
  ]);

describe('swimlane layout does not depend on the host locale (#676)', () => {
  it('has fixtures', () => {
    expect(LOCALES).toContain('et_EE');
  });

  it.concurrent.each(LOCALES)(
    '%s: the child process collates in that locale',
    async (locale) => {
      const script = 'process.stdout.write(new Intl.Collator().resolvedOptions().locale)';
      const tag = locale.replace('_', '-');
      expect(await node(locale, ['-e', script])).toBe(tag);
      expect(await node('en_US', ['-e', script])).toBe('en-US');
    },
    T
  );

  it.concurrent.each(LOCALES)(
    '%s renders the same bytes as en_US',
    async (locale) => {
      const [base, other] = await Promise.all([
        render('en_US', `${locale}.mmd`),
        render(locale, `${locale}.mmd`),
      ]);
      expect(base).toContain('<svg');
      expect(other).toBe(base);
    },
    T
  );
});
