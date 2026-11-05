/**
 * The harness cache: a directory outside the repository (so an installed app never resolves
 * a package from the monorepo's own `node_modules`), content hashes, and a cross-process lock
 * for the Playwright workers that build, pack or install at the same time.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

/** `MERMAID_PLATFORM_CACHE`, else `<os tmpdir>/mermaid-v13-platform`. Safe to delete. */
export function cacheRoot(): string {
  const root = process.env.MERMAID_PLATFORM_CACHE ?? join(tmpdir(), 'mermaid-v13-platform');
  mkdirSync(root, { recursive: true });
  return root;
}

export const sha256 = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex');

/** Files under `dir`, sorted, as paths relative to it; `skip` gets each entry's name. */
export function listFiles(dir: string, skip: (name: string) => boolean = () => false): string[] {
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const name of readdirSync(at).sort()) {
      if (skip(name)) continue;
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path));
    }
  };
  walk(dir);
  return out;
}

/** One hash over the files of `dir` (names and contents); `transform` may rewrite a file first. */
export function hashTree(
  dir: string,
  skip?: (name: string) => boolean,
  transform: (path: string, content: Buffer) => string | Buffer = (_p, c) => c
): string {
  const h = createHash('sha256');
  for (const file of listFiles(dir, skip)) {
    h.update(`${file}\0`);
    h.update(transform(file, readFileSync(join(dir, file))));
    h.update('\0');
  }
  return h.digest('hex');
}

/** Sorts object keys recursively, so key order (which `pnpm pack` does not keep) hashes the same. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : typeof v === 'object' && v !== null
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])])
          )
        : v;
  return JSON.stringify(sort(value));
}

const sleep = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

function holderAlive(lock: string): boolean {
  try {
    const pid = Number(readFileSync(join(lock, 'pid'), 'utf8'));
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but is not ours. No pid file yet: the lock is being taken.
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM') return true;
    return code === 'ENOENT' && Date.now() - statSync(lock).mtimeMs < 10_000;
  }
}

/**
 * Runs `fn` while holding the named lock (a directory in the cache). Waits while another
 * process holds it and takes over a lock whose process has died.
 */
export function withLock<T>(name: string, fn: () => T): T {
  const locks = join(cacheRoot(), 'locks');
  const lock = join(locks, name);
  mkdirSync(locks, { recursive: true });
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (!holderAlive(lock)) rmSync(lock, { recursive: true, force: true });
      } catch {
        // Released meanwhile.
      }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for the lock ${lock}`);
      sleep(200);
    }
  }
  try {
    writeFileSync(join(lock, 'pid'), String(process.pid));
    return fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
