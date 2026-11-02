import type { DivergenceKind, ObservedDivergence } from './types.ts';

/** Unlisted divergences that share a cause; the oracle-bump job opens one issue per cluster. */
export interface DivergenceCluster {
  key: string;
  title: string;
  adapter: string;
  kind: DivergenceKind;
  signature: string;
  ids: string[];
}

/** Group divergences by adapter, kind and a position-free signature of the detail. */
export function clusterDivergences(divergences: ObservedDivergence[]): DivergenceCluster[] {
  const clusters = new Map<string, DivergenceCluster>();
  for (const d of divergences) {
    const signature = signatureOf(d);
    const key = `${d.adapter}\0${d.kind}\0${signature}`;
    let cluster = clusters.get(key);
    if (!cluster) {
      const title = `Oracle divergence (${d.adapter}, ${d.kind}): ${signature}`;
      cluster = {
        key,
        title: title.slice(0, 200),
        adapter: d.adapter,
        kind: d.kind,
        signature,
        ids: [],
      };
      clusters.set(key, cluster);
    }
    cluster.ids.push(d.id);
  }
  return [...clusters.values()];
}

function signatureOf(d: ObservedDivergence): string {
  if (d.kind === 'model') {
    // Differing paths without indices: `vertices[3].text` → `vertices[].text`.
    const paths = d.detail.split(', ').map((p) => p.replace(/\[\d+\]/g, '[]'));
    return [...new Set(paths)].join(', ');
  }
  // v12 jison errors end with the "Expecting …, got …" line; other errors are one line.
  const lines = d.detail.split('\n').filter((l) => l.trim() !== '');
  const line = (lines.length > 1 ? lines[lines.length - 1] : lines[0]) ?? '';
  return line.trim().replace(/\d+/g, 'N');
}
