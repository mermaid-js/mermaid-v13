import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Divergence, DivergenceKind } from './types.ts';

/** Hash recorded in `divergences.json`, so an entry goes stale when its source changes. */
export function inputHash(source: string): string {
  return 'sha256:' + createHash('sha256').update(source).digest('hex').slice(0, 16);
}

const KINDS: readonly DivergenceKind[] = ['accept', 'reject', 'model'];
const FIELDS = ['id', 'inputHash', 'kind', 'reason', 'owner', 'since'] as const;

/** Read and validate a divergence list. Throws on malformed or duplicate entries. */
export function loadDivergences(file: string): Divergence[] {
  return parseDivergences(JSON.parse(readFileSync(file, 'utf8')) as unknown, file);
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
