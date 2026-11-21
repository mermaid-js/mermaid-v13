/**
 * What the dev server sends over the wire (#958): gzip for text a browser asks for compressed,
 * and cache headers. Content-hashed files are immutable. A file whose name stays the same across
 * builds carries an ETag and is revalidated, so an unchanged build answers 304. A remote browser
 * (over a VPN) then downloads a few MB once, not tens of MB on every load.
 */
import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { createGzip, gzip } from 'node:zlib';

/** For a file whose name changes with its content. */
export const IMMUTABLE = 'public, max-age=31536000, immutable';
/** For a file whose name stays the same across builds: the browser revalidates by ETag. */
export const REVALIDATE = 'no-cache';

const COMPRESSIBLE = /^(?:text\/|application\/(?:json|javascript)|image\/svg\+xml)/;
const gzipAsync = promisify(gzip);

/** Whether the request takes a gzip body. */
export const acceptsGzip = (req: IncomingMessage): boolean =>
  /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));

/** Whether a body of this content type is worth compressing (text, not fonts or images). */
export const compressible = (type: string | undefined): boolean =>
  type !== undefined && COMPRESSIBLE.test(type);

/** A file built in memory and served as is. */
export interface ServedFile {
  readonly type: string;
  readonly body: Uint8Array;
  readonly etag: string;
  readonly cacheControl: string;
  /** Its gzip body, made on the first request that takes one. */
  gzipped?: Promise<Buffer>;
}

export function servedFile(type: string, body: Uint8Array, cacheControl: string): ServedFile {
  const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`;
  return { type, body, etag, cacheControl };
}

/** Sends `file`: 304 when the request already holds this version, gzip when it takes it. */
export async function sendServed(
  req: IncomingMessage,
  res: ServerResponse,
  file: ServedFile
): Promise<void> {
  const headers: Record<string, string> = {
    'content-type': file.type,
    'cache-control': file.cacheControl,
    etag: file.etag,
    vary: 'accept-encoding',
  };
  if (req.headers['if-none-match'] === file.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  if (acceptsGzip(req) && compressible(file.type)) {
    file.gzipped ??= gzipAsync(file.body);
    const body = await file.gzipped;
    res.writeHead(200, { ...headers, 'content-encoding': 'gzip' });
    res.end(body);
    return;
  }
  res.writeHead(200, headers);
  res.end(file.body);
}

/**
 * Relays an upstream (esbuild's serve) answer to `res`: gzip-compressed when the request takes
 * it and the body is text, with `cacheControl` when given.
 */
export function relay(
  req: IncomingMessage,
  upstream: NodeJS.ReadableStream & { statusCode?: number; headers: IncomingHttpHeaders },
  res: ServerResponse,
  cacheControl?: string
): void {
  const status = upstream.statusCode ?? 502;
  const headers: IncomingHttpHeaders = { ...upstream.headers };
  if (cacheControl && status === 200) headers['cache-control'] = cacheControl;
  const type = headers['content-type'];
  if (
    status === 200 &&
    acceptsGzip(req) &&
    compressible(type) &&
    headers['content-encoding'] === undefined
  ) {
    delete headers['content-length'];
    res.writeHead(status, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
    upstream.pipe(createGzip()).pipe(res);
    return;
  }
  res.writeHead(status, headers);
  upstream.pipe(res);
}
