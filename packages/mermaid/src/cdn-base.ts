/**
 * Where the CDN build's first-party chunks load from (D163; spec #218 T6). The build rewrites
 * each lazy `import('…')` to `import(cdnUrl('chunks/<name>.mjs'))` (`scripts/cdn-build.ts`), so
 * every lazy load goes through this module. Its state belongs to one copy of the build, never
 * to the page: two mermaid copies on a page keep their own bases.
 */

let fallback: URL | undefined;
let chosen: URL | undefined;

/** `value` as a directory URL: no query or hash, a trailing `/`. */
function directory(value: string | URL, against?: string): URL {
  const url = new URL(value, against);
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

/** The default base: the directory of the ESM entry (`cdn.ts` passes its `import.meta.url`). */
export function setDefaultBase(entryUrl: string): void {
  fallback = directory(new URL('./', entryUrl));
}

/**
 * Sets the base from `initialize({ cdnBase })`. A relative value resolves against
 * `document.baseURI` (the page). `undefined` returns to the default. Throws `TypeError` on
 * anything but a non-empty string or `undefined`.
 */
export function setCdnBase(value: unknown): void {
  if (value === undefined) {
    chosen = undefined;
    return;
  }
  if (typeof value !== 'string' || value.trim() === '')
    throw new TypeError('cdnBase must be a non-empty URL string');
  chosen = directory(value, typeof document === 'undefined' ? undefined : document.baseURI);
}

/** The URL of the chunk at `path` (relative to the build's `dist/`) under the current base. */
export function cdnUrl(path: string): string {
  const base = chosen ?? fallback;
  if (!base) throw new Error('mermaid: the CDN base is not set');
  return new URL(path, base).href;
}
