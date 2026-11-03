/**
 * The page side of the file API (`src/explorer.ts`). Paths are relative to the explorer root.
 */
export interface Entry {
  readonly name: string;
  readonly kind: 'dir' | 'file';
  readonly path: string;
}

export interface Listing {
  /** How `/events` names files below the root (see `eventPathToFile`). */
  readonly root: string;
  readonly path: string;
  readonly entries: readonly Entry[];
}

const endpoint = (name: 'files' | 'file', path: string): URL => {
  const url = new URL(`/dev/api/${name}`, window.location.origin);
  if (path) url.searchParams.set('path', path);
  return url;
};

/**
 * Sent on every write: the server refuses writes without it (`src/explorer.ts`), and a cross-site
 * page can't add it without a CORS preflight the server never grants.
 */
const WRITE_HEADERS = { 'content-type': 'text/plain; charset=utf-8', 'x-mermaid-dev': '1' };

async function failure(res: Response): Promise<Error> {
  const text = await res.text();
  let message = text;
  try {
    message = (JSON.parse(text) as { error?: string }).error ?? text;
  } catch {
    // A plain-text body.
  }
  return new Error(message || `HTTP ${res.status}`);
}

export async function listFiles(dir: string): Promise<Listing> {
  const res = await fetch(endpoint('files', dir));
  if (!res.ok) throw await failure(res);
  return (await res.json()) as Listing;
}

export async function readFile(path: string): Promise<string> {
  const res = await fetch(endpoint('file', path));
  if (!res.ok) throw await failure(res);
  return res.text();
}

/** `PUT`: overwrites an existing file. */
export async function saveFile(path: string, text: string): Promise<void> {
  const res = await fetch(endpoint('file', path), {
    method: 'PUT',
    headers: WRITE_HEADERS,
    body: text,
  });
  if (!res.ok) throw await failure(res);
}

/** `POST`: creates a file; `exists` when one is already there. */
export async function createFile(
  path: string,
  text = ''
): Promise<{ path: string } | { exists: true }> {
  const res = await fetch(endpoint('file', path), {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: text,
  });
  if (res.status === 409) return { exists: true };
  if (!res.ok) throw await failure(res);
  return (await res.json()) as { path: string };
}

/** The root-relative file an `/events` path names, or `undefined` outside the root. */
export function eventPathToFile(root: string, eventPath: string): string | undefined {
  if (!root) return eventPath;
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return eventPath.startsWith(prefix) ? eventPath.slice(prefix.length) : undefined;
}

export const parentDir = (path: string): string => {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
};
