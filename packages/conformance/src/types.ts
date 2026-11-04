/**
 * Per-diagram hook-up between a v13 plugin and the `mermaid@12` oracle (the normaliser API).
 *
 * Both normalisers map into the same plain-data shape; the runner deep-compares the results.
 * `normaliseV12` receives the live v12 DB right after a successful oracle parse. Some v12 DBs
 * are singletons, so it must copy what it needs and not keep the reference.
 */
export interface DiagramAdapter<M = unknown> {
  /** Adapter id, used in reports and issue titles. */
  id: string;
  /** `diagram.type` values the oracle reports for this diagram, e.g. `['flowchart-v2', 'flowchart']`. */
  v12Types: string[];
  /** v13 detection, used to pick the adapter when the oracle rejects the input. */
  detect(text: string): boolean;
  /** v13 parse: returns the model, or throws when v13 rejects the source. */
  parse(text: string): M;
  normaliseV13(model: M): unknown;
  /**
   * Site config the oracle parses this diagram's sources with, for `normaliseV12` (e.g.
   * `{ securityLevel: 'loose' }`, so v12's click bindings run). Accept/reject is taken
   * from the plain parse.
   */
  v12Config?: Record<string, unknown>;
  normaliseV12(db: unknown): unknown;
}

export interface CorpusItem {
  /** Stable id, e.g. the fixture path relative to the repo root. */
  id: string;
  source: string;
}

export type DivergenceKind =
  /** v13 accepts a source the oracle rejects. */
  | 'accept'
  /** v13 rejects a source the oracle accepts. */
  | 'reject'
  /** Both accept; the normalised models differ. */
  | 'model';

/** One entry of `divergences.json` (R-COMPAT-4). */
export interface Divergence {
  id: string;
  inputHash: string;
  kind: DivergenceKind;
  reason: string;
  owner: string;
  since: string;
}

export interface ObservedDivergence {
  id: string;
  adapter: string;
  inputHash: string;
  kind: DivergenceKind;
  /** v12 error (accept), v13 error (reject) or the first differing paths (model). */
  detail: string;
}

export type ItemStatus = 'agree' | 'diverge' | 'skipped';

export interface ItemResult {
  id: string;
  adapter?: string;
  status: ItemStatus;
  oracleAccepted: boolean;
  v13Accepted?: boolean;
  divergence?: ObservedDivergence;
}

export interface ParityReport {
  results: ItemResult[];
  /** Divergences seen in this run that `divergences.json` does not list. */
  unlisted: ObservedDivergence[];
  /** Listed divergences for corpus items in this run that no longer diverge. */
  disappeared: Divergence[];
  /** Listed divergences that matched an observed one. */
  expected: ObservedDivergence[];
  ok: boolean;
}
