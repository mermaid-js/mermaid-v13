/**
 * `pnpm dev`'s supervisor: the server runs in a child process, restarted when the server's own
 * code (packages/dev/src outside browser/) changes. Browser code stays a live rebuild in the
 * running child.
 */
import { describe, expect, it } from 'vitest';
import { restartsServer, superviseServer, type ServerChild } from './supervise.ts';

describe('restartsServer', () => {
  it.each([
    'packages/dev/src/server.ts',
    'packages/dev/src/explorer.ts',
    'packages/dev/src/cli/dev-server.ts',
  ])('restarts for %s', (path) => expect(restartsServer(path)).toBe(true));

  it.each([
    'packages/dev/src/browser/viewer.ts',
    'packages/dev/src/browser/explorer/tabs/profile.ts',
    'packages/dev/src/explorer.spec.ts',
    'packages/dev/www/dev/index.html',
    'packages/core/src/index.ts',
    'e2e/diagrams/flowchart/a.mmd',
  ])('leaves %s to the live rebuild', (path) => expect(restartsServer(path)).toBe(false));
});

/** A fake child process: records starts and stops. */
function harness() {
  const log: string[] = [];
  const notes: string[] = [];
  let started = 0;
  let change: (paths: readonly string[]) => void = () => {};
  const start = (): ServerChild => {
    const n = ++started;
    log.push(`start ${n}`);
    return {
      stop: async () => {
        log.push(`stop ${n}`);
      },
    };
  };
  const supervisor = superviseServer({
    start,
    watch: (onChange) => {
      change = onChange;
      return { close: async () => {} };
    },
    note: (text) => notes.push(text),
  });
  return { log, notes, supervisor, change: (paths: readonly string[]) => change(paths) };
}

describe('superviseServer', () => {
  it('starts the server once', () => {
    const { log } = harness();
    expect(log).toEqual(['start 1']);
  });

  it('restarts it when server code changes, and says so', async () => {
    const { log, notes, supervisor, change } = harness();
    change(['packages/dev/src/explorer.ts']);
    await supervisor.idle();
    expect(log).toEqual(['start 1', 'stop 1', 'start 2']);
    expect(notes.join('\n')).toContain('packages/dev/src/explorer.ts');
  });

  it('leaves it running for browser-side changes', async () => {
    const { log, notes, supervisor, change } = harness();
    change(['packages/dev/src/browser/viewer.ts', 'packages/core/src/index.ts']);
    await supervisor.idle();
    expect(log).toEqual(['start 1']);
    expect(notes).toEqual([]);
  });

  it('restarts one at a time', async () => {
    const { log, supervisor, change } = harness();
    change(['packages/dev/src/server.ts']);
    change(['packages/dev/src/routes.ts']);
    await supervisor.idle();
    expect(log).toEqual(['start 1', 'stop 1', 'start 2', 'stop 2', 'start 3']);
  });

  it('stops the child on close', async () => {
    const { log, supervisor } = harness();
    await supervisor.close();
    expect(log).toEqual(['start 1', 'stop 1']);
  });
});
