import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Divergence, DivergenceKind } from './types.ts';

/** Hash recorded in a divergence entry, so the entry goes stale when its source changes. */
export function inputHash(source: string): string {
  return 'sha256:' + createHash('sha256').update(source).digest('hex').slice(0, 16);
}

const KINDS: readonly DivergenceKind[] = ['accept', 'reject', 'model'];
const FIELDS = ['id', 'inputHash', 'kind', 'reason', 'owner', 'since'] as const;

/**
 * Read and validate a divergence list: one JSON file, or every `*.json` of a folder (the
 * committed list, `divergences/<type>.json`, one file per diagram type), in file-name order.
 * Throws on malformed entries and on an entry listed twice, in one file or across two.
 */
export function loadDivergences(path: string): Divergence[] {
  if (!statSync(path).isDirectory())
    return parseDivergences(JSON.parse(readFileSync(path, 'utf8')) as unknown, path);
  const files = readdirSync(path)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (files.length === 0) throw new Error(`${path}: no divergence files`);
  const all: Divergence[] = [];
  const seen = new Map<string, string>();
  for (const f of files) {
    for (const d of parseDivergences(JSON.parse(readFileSync(join(path, f), 'utf8')), f)) {
      const k = `${d.id}\0${d.kind}`;
      const other = seen.get(k);
      if (other !== undefined)
        throw new Error(`${f}: duplicate entry for ${d.id} (${d.kind}), also in ${other}`);
      seen.set(k, f);
      all.push(d);
    }
  }
  return all;
}

export function parseDivergences(data: unknown, origin = 'divergences'): Divergence[] {
  if (!Array.isArray(data)) throw new Error(`${origin}: expected an array of entries`);
  const seen = new Set<string>();
  return data.map((entry: unknown, i) => {
    const where = `${origin}[${i}]`;
    if (typeof entry !== 'object' || entry === null) throw new Error(`${where}: not an object`);
    const record = entry as Record<string, unknown>;
    for (const field of FIELDS) {
      if (typeof record[field] !== 'string' || record[field] === '') {
        throw new Error(`${where}: "${field}" must be a non-empty string`);
      }
    }
    const d = record as unknown as Divergence;
    if (!KINDS.includes(d.kind)) throw new Error(`${where}: unknown kind "${d.kind}"`);
    const k = `${d.id}\0${d.kind}`;
    if (seen.has(k)) throw new Error(`${where}: duplicate entry for ${d.id} (${d.kind})`);
    seen.add(k);
    return {
      id: d.id,
      inputHash: d.inputHash,
      kind: d.kind,
      reason: d.reason,
      owner: d.owner,
      since: d.since,
    };
  });
}
