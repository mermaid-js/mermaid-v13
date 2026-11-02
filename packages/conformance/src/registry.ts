import type { ParitySuite } from './corpus.ts';

/**
 * The diagrams under oracle parity. Each first-party diagram ticket adds its suite here, e.g.
 * `{ adapter: flowchartAdapter, corpusDirs: ['e2e/diagrams/flowchart'] }` (ticket #8).
 */
export const PARITY_SUITES: ParitySuite[] = [];

/** The committed divergence list (R-COMPAT-4). */
export const DIVERGENCES_FILE = new URL('../divergences.json', import.meta.url);
