/**
 * The bin's lifecycle and flags (#805, R-LANG-2, D98): it stops with its client, says its
 * version, and refuses the transports it does not have instead of waiting on stdio for ever.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli, startClient } from './testing/lsp-client.ts';

const T = 60_000;
const VERSION = (
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
    version: string;
  }
).version;

/** The exit code, or a failure when the process has not exited `ms` after `since`. */
const exitWithin = (exited: Promise<number | null>, ms: number): Promise<number | null> =>
  Promise.race([
    exited,
    new Promise<never>((_, fail) =>
      setTimeout(() => fail(new Error(`the server still runs ${ms} ms after stdin ended`)), ms)
    ),
  ]);

describe('mermaid-language-server lifecycle', () => {
  it(
    'exits with code 1 when stdin ends without shutdown, though the client process lives',
    async () => {
      // `processId` is this process, which stays alive: only the end of stdin can stop it.
      const client = await startClient({ processId: process.pid });
      client.endInput();
      expect(await exitWithin(client.exited, 1000)).toBe(1);
      client.connection.dispose();
    },
    T
  );

  it(
    'exits with code 0 when stdin ends after shutdown',
    async () => {
      const client = await startClient({ processId: process.pid });
      await client.connection.sendRequest('shutdown');
      client.endInput();
      expect(await exitWithin(client.exited, 1000)).toBe(0);
      client.connection.dispose();
    },
    T
  );

  it(
    'still serves with the flags clients pass (--stdio --clientProcessId=…)',
    async () => {
      const client = await startClient({ args: ['--stdio', `--clientProcessId=${process.pid}`] });
      try {
        client.open('file:///w/a.mmd', 'flowchart LR\n  A --> B[\n');
        expect((await client.diagnostics('file:///w/a.mmd')).diagnostics).toHaveLength(1);
      } finally {
        expect(await client.stop()).toBe(0);
      }
    },
    T
  );

  it(
    'names its version in serverInfo',
    async () => {
      const client = await startClient();
      try {
        expect(client.init.serverInfo).toEqual({
          name: 'mermaid-language-server',
          version: VERSION,
        });
      } finally {
        await client.stop();
      }
    },
    T
  );
});

describe('mermaid-language-server flags', () => {
  it(
    '--version prints the package.json version and exits 0',
    async () => {
      const run = await runCli(['--version']);
      expect(run).toMatchObject({ code: 0, stdout: `${VERSION}\n` });
    },
    T
  );

  it(
    '--help prints the usage to stdout and exits 0',
    async () => {
      const run = await runCli(['--help']);
      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/^Usage: mermaid-language-server/);
      expect(run.stdout).toContain('--version');
      expect(run.stderr).toBe('');
    },
    T
  );

  it.each([['--node-ipc'], ['--socket=6009'], ['--socket', '6009'], ['--pipe=/tmp/mermaid.sock']])(
    '%s exits non-zero with one line saying only stdio is supported',
    async (...args) => {
      const run = await runCli(args);
      expect(run.code).not.toBe(0);
      expect(run.code).not.toBeNull();
      expect(run.stdout).toBe('');
      expect(run.stderr).toMatch(/^mermaid-language-server: only stdio is supported.*\n$/);
      expect(run.stderr.trimEnd().split('\n')).toHaveLength(1);
    },
    T
  );
});
