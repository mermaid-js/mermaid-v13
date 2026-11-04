import { inputHash } from './divergences.ts';
import { loadOracle } from './oracle.ts';
import type { Oracle } from './oracle.ts';
import type {
  CorpusItem,
  DiagramAdapter,
  Divergence,
  DivergenceKind,
  ItemResult,
  ObservedDivergence,
  ParityReport,
} from './types.ts';

export interface RunParityOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapters of any model type
  adapters: DiagramAdapter<any>[];
  corpus: Iterable<CorpusItem> | AsyncIterable<CorpusItem>;
  divergences?: Divergence[];
  /** Defaults to the mermaid@12 oracle. */
  oracle?: Oracle;
  /** Called after each item, e.g. for progress output on large external runs. */
  onResult?(result: ItemResult): void;
}

/**
 * Run every corpus item through mermaid@12 and the matching v13 adapter, compare accept/reject
 * and the normalised models, and check the outcome against the divergence list.
 *
 * The adapter is picked by the oracle's diagram type, or by the adapter's own detector when the
 * oracle rejects. Items no adapter claims are `skipped`.
 */
export async function runParity(options: RunParityOptions): Promise<ParityReport> {
  const oracle = options.oracle ?? (await loadOracle());
  const listed = options.divergences ?? [];
  const results: ItemResult[] = [];
  const observed: ObservedDivergence[] = [];
  const seenIds = new Set<string>();
  let count = 0;

  for await (const item of options.corpus) {
    seenIds.add(item.id);
    const result = await checkItem(item, options.adapters, oracle);
    results.push(result);
    if (result.divergence) observed.push(result.divergence);
    options.onResult?.(result);
    // Let the event loop breathe on long runs (timers, reporters).
    if (++count % 50 === 0) await new Promise((resolve) => setImmediate(resolve));
  }

  const listedKeys = new Set(listed.map((d) => key(d.id, d.kind, d.inputHash)));
  const observedKeys = new Set(observed.map((d) => key(d.id, d.kind, d.inputHash)));
  const unlisted = observed.filter((d) => !listedKeys.has(key(d.id, d.kind, d.inputHash)));
  const expected = observed.filter((d) => listedKeys.has(key(d.id, d.kind, d.inputHash)));
  const disappeared = listed.filter(
    (d) => seenIds.has(d.id) && !observedKeys.has(key(d.id, d.kind, d.inputHash))
  );
  return {
    results,
    unlisted,
    disappeared,
    expected,
    ok: unlisted.length === 0 && disappeared.length === 0,
  };
}

const key = (id: string, kind: DivergenceKind, hash: string) => `${id}\0${kind}\0${hash}`;

async function checkItem(
  item: CorpusItem,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapters of any model type
  adapters: DiagramAdapter<any>[],
  oracle: Oracle
): Promise<ItemResult> {
  const v12 = await oracle.parse(item.source);
  const adapter = v12.accepted
    ? adapters.find((a) => a.v12Types.includes(v12.diagramType))
    : adapters.find((a) => a.detect(item.source));
  if (!adapter) return { id: item.id, status: 'skipped', oracleAccepted: v12.accepted };

  // Normalise v12 first: its DB may be a singleton that the v13 side must not see changed.
  const withConfig =
    v12.accepted && adapter.v12Config ? await oracle.parse(item.source, adapter.v12Config) : v12;
  const v12Model = withConfig.accepted ? adapter.normaliseV12(withConfig.db) : undefined;
  let v13Model: unknown;
  let v13Error: string | undefined;
  try {
    v13Model = adapter.normaliseV13(adapter.parse(item.source));
  } catch (error) {
    v13Error = error instanceof Error ? error.message : String(error);
  }
  const v13Accepted = v13Error === undefined;
  const base = { id: item.id, adapter: adapter.id, oracleAccepted: v12.accepted, v13Accepted };

  let kind: DivergenceKind | undefined;
  let detail = '';
  if (v12.accepted && !v13Accepted) {
    kind = 'reject';
    detail = v13Error ?? '';
  } else if (!v12.accepted && v13Accepted) {
    kind = 'accept';
    detail = v12.error;
  } else if (v12.accepted) {
    const paths = diffPaths(v12Model, v13Model);
    if (paths.length > 0) {
      kind = 'model';
      detail = paths.join(', ');
    }
  }
  if (!kind) return { ...base, status: 'agree' };
  return {
    ...base,
    status: 'diverge',
    divergence: {
      id: item.id,
      adapter: adapter.id,
      inputHash: inputHash(item.source),
      kind,
      detail,
    },
  };
}

/** Paths where two plain-data values differ, e.g. `vertices[2].text`. At most `max` paths. */
export function diffPaths(a: unknown, b: unknown, path = '', max = 5): string[] {
  const out: string[] = [];
  walk(a, b, path, out, max);
  return out;
}

function walk(a: unknown, b: unknown, path: string, out: string[], max: number): void {
  if (out.length >= max || Object.is(a, b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}.length`);
    for (let i = 0; i < Math.min(a.length, b.length); i++)
      walk(a[i], b[i], `${path}[${i}]`, out, max);
    return;
  }
  if (isRecord(a) && isRecord(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) walk(a[k], b[k], path ? `${path}.${k}` : k, out, max);
    return;
  }
  out.push(path || '(root)');
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
