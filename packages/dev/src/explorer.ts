/**
 * The Dev Explorer's server side (#58; v12 `.esbuild/server.ts:250-267, 364-569`): the page at
 * `/dev/`, its script (`/build/explorer.js`), the vendored Shoelace theme and icons, and the
 * file API over the explorer root.
 *
 * - `GET /dev/api/files?path=<dir>` → `{ root, path, entries: [{ name, kind, path }] }`: folders
 *   first, then `.mmd` files. At the top level only `folders()` are listed (by default, for the
 *   e2e root, the folders the snapshot run collects: `supportedFixtureFolders()`).
 * - `GET /dev/api/file?path=<file.mmd>` → the text; `PUT` overwrites an existing file; `POST`
 *   creates one (starter text when the body is empty) and answers 409 if it exists.
 *
 * Every path is relative to the root; anything that resolves outside it, or isn't `.mmd`, is a
 * 400. `root` in the listing is how `/events` reports paths below it (repo-relative posix, or
 * absolute outside the checkout), so the page can match a change to the open file.
 */
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
// The e2e snapshot discovery itself (#63), so the explorer lists exactly what CI snapshots.
// eslint-disable-next-line mermaid/import-boundaries -- private dev tool; e2e/helpers has no package entry
import { supportedFixtureFolders } from '../../../e2e/helpers/mmd-snapshots.ts';
import { REPO_ROOT } from './fixtures.ts';
import { readBody, sendFile, type Route } from './routes.ts';
import type { ServerOptions } from './server.ts';
import { versionsRoute } from './versions.ts';

export const DEFAULT_EXPLORER_ROOT = join(REPO_ROOT, 'e2e', 'diagrams');
export const EXPLORER_ENTRY = join(import.meta.dirname, 'browser', 'explorer', 'app.ts');
/** The Compare tab's iframe script (`www/dev/compare-pane.html` loads `/build/compare-pane.js`). */
export const COMPARE_PANE_ENTRY = join(import.meta.dirname, 'browser', 'compare-pane.ts');

/** Written by a `POST` with an empty body (v12's starter). */
export const NEW_DIAGRAM = 'flowchart TD\n  A[Start] --> B[End]\n';

// `dist/`; resolved through a theme file, the package exports no `require` entry point.
const SHOELACE = dirname(
  dirname(createRequire(import.meta.url).resolve('@shoelace-style/shoelace/dist/themes/dark.css'))
);
const MAX_BODY = 1024 * 1024;

/** `MERMAID_DEV_EXPLORER_ROOT` (relative to the checkout), else the e2e fixture folders. */
export function resolveExplorerRoot(env: Readonly<Record<string, string | undefined>>): string {
  const override = env.MERMAID_DEV_EXPLORER_ROOT?.trim();
  return override ? resolve(REPO_ROOT, override) : DEFAULT_EXPLORER_ROOT;
}

export interface ExplorerOptions {
  /**
   * The top-level folders to list. Default: `supportedFixtureFolders()` for the e2e root,
   * every folder for any other root.
   */
  readonly folders?: () => readonly string[];
}

export interface ExplorerEntry {
  readonly name: string;
  readonly kind: 'dir' | 'file';
  /** Relative to the root, posix. */
  readonly path: string;
}

const posix = (p: string): string => p.split(sep).join('/');

class BadPath extends Error {}

/** v12's guard: resolve below `root`, refuse NUL and anything that escapes it. */
export function resolveWithin(
  root: string,
  requested: string | null
): { abs: string; rel: string } {
  const raw = requested ?? '';
  if (raw.includes('\0')) throw new BadPath('Invalid path');
  const abs = resolve(root, raw.replaceAll('\\', '/').replace(/^\/+/, ''));
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new BadPath('Path escapes the explorer root');
  return { abs, rel: posix(rel) };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const refuse = (res: ServerResponse, error: string): void => json(res, 400, { error });

/** Where `/events` reports files below `root`: repo-relative posix, or absolute outside. */
function eventRoot(root: string): string {
  const rel = relative(REPO_ROOT, root);
  return rel.startsWith('..') || isAbsolute(rel) ? posix(root) : posix(rel);
}

const byName = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

export function explorerRoutes(root: string, options: ExplorerOptions = {}): Route[] {
  const folders =
    options.folders ??
    (root === DEFAULT_EXPLORER_ROOT
      ? () => supportedFixtureFolders({ diagramsDir: root })
      : undefined);

  /** A `.mmd` path below the root, or a 400 (answered here) and `undefined`. */
  const mmd = (res: ServerResponse, url: URL): { abs: string; rel: string } | undefined => {
    try {
      const target = resolveWithin(root, url.searchParams.get('path'));
      if (!target.abs.endsWith('.mmd')) {
        refuse(res, 'Only .mmd files are allowed');
        return undefined;
      }
      return target;
    } catch {
      refuse(res, 'Invalid path');
      return undefined;
    }
  };
  const isFile = async (abs: string): Promise<boolean> =>
    (await stat(abs).catch(() => undefined))?.isFile() ?? false;

  return [
    {
      path: '/dev',
      handle: (_req, res) => {
        res.writeHead(302, { location: '/dev/' });
        res.end();
      },
    },
    {
      path: '/dev/vendor/shoelace/',
      prefix: true,
      method: 'GET',
      handle: (_req, res, url) => {
        const rel = decodeURIComponent(url.pathname.slice('/dev/vendor/shoelace/'.length));
        let abs: string;
        try {
          abs = resolveWithin(SHOELACE, rel).abs;
        } catch {
          abs = '';
        }
        const type = CONTENT_TYPES[extname(abs)];
        if (!abs || !type) {
          res.writeHead(404);
          res.end();
          return;
        }
        sendFile(res, abs, type);
      },
    },
    {
      path: '/dev/api/files',
      method: 'GET',
      handle: async (_req, res, url) => {
        let dir: { abs: string; rel: string };
        try {
          dir = resolveWithin(root, url.searchParams.get('path'));
        } catch {
          refuse(res, 'Invalid path');
          return;
        }
        const listed = await readdir(dir.abs, { withFileTypes: true }).catch(() => undefined);
        if (!listed) {
          refuse(res, 'Not a directory');
          return;
        }
        const allowed = dir.rel === '' && folders ? new Set(folders()) : undefined;
        const entry = (name: string, kind: ExplorerEntry['kind']): ExplorerEntry => ({
          name,
          kind,
          path: dir.rel ? `${dir.rel}/${name}` : name,
        });
        const dirs = listed
          .filter((d) => d.isDirectory() && (!allowed || allowed.has(d.name)))
          .map((d) => d.name)
          .sort(byName);
        const files = listed
          .filter((d) => d.isFile() && d.name.endsWith('.mmd'))
          .map((d) => d.name)
          .sort(byName);
        json(res, 200, {
          root: eventRoot(root),
          path: dir.rel,
          entries: [...dirs.map((n) => entry(n, 'dir')), ...files.map((n) => entry(n, 'file'))],
        });
      },
    },
    {
      path: '/dev/api/file',
      method: 'GET',
      handle: async (_req, res, url) => {
        const target = mmd(res, url);
        if (!target) return;
        if (!(await isFile(target.abs))) {
          refuse(res, 'Not a file');
          return;
        }
        res.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(await readFile(target.abs, 'utf8'));
      },
    },
    {
      path: '/dev/api/file',
      method: 'POST',
      handle: async (req, res, url) => {
        const target = mmd(res, url);
        if (!target) return;
        const body = await readBody(req);
        if (body.length > MAX_BODY) {
          refuse(res, 'Body too large');
          return;
        }
        const content = body.length > 0 ? body : NEW_DIAGRAM;
        await mkdir(dirname(target.abs), { recursive: true });
        try {
          // `wx`: never overwrite, even if the file appears meanwhile.
          await writeFile(target.abs, content, { encoding: 'utf8', flag: 'wx' });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            json(res, 409, { error: 'File already exists' });
            return;
          }
          throw error;
        }
        json(res, 201, { path: target.rel, bytes: Buffer.byteLength(content) });
      },
    },
    {
      path: '/dev/api/file',
      method: 'PUT',
      handle: async (req, res, url) => {
        const target = mmd(res, url);
        if (!target) return;
        if (!(await isFile(target.abs))) {
          refuse(res, 'Not a file');
          return;
        }
        const body = await readBody(req);
        if (body.length > MAX_BODY) {
          refuse(res, 'Body too large');
          return;
        }
        await writeFile(target.abs, body, 'utf8');
        json(res, 200, { path: target.rel, bytes: Buffer.byteLength(body) });
      },
    },
  ];
}

/**
 * Everything the explorer adds to `startServer`: its routes (plus the Compare tab's
 * `/dev/api/versions`), its page scripts and a watch on the root (a `.mmd` change rebuilds and reaches the page on `/events`).
 */
export function explorerServerOptions(
  root: string,
  options: ExplorerOptions = {}
): Pick<ServerOptions, 'routes' | 'entries' | 'watch'> {
  return {
    routes: [...explorerRoutes(root, options), versionsRoute()],
    entries: { explorer: EXPLORER_ENTRY, 'compare-pane': COMPARE_PANE_ENTRY },
    watch: { paths: [root] },
  };
}
