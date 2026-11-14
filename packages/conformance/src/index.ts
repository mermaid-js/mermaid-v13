/**
 * Conformance: oracle runner, normaliser API and divergences (DESIGN §13.1).
 */
export type * from './types.ts';
export { loadOracle } from './oracle.ts';
export type { Oracle, OracleResult } from './oracle.ts';
export { diffPaths, runParity } from './runner.ts';
export type { RunParityOptions } from './runner.ts';
export { inputHash, loadDivergences, parseDivergences } from './divergences.ts';
export { REPO_ROOT, corpusFromDir, resolveCorpus } from './corpus.ts';
export type { ParitySuite } from './corpus.ts';
export { clusterDivergences } from './cluster.ts';
export type { DivergenceCluster } from './cluster.ts';
export { FLOWCHART_V12_TYPES, flowchartV12Snapshot } from './flowchart/v12.ts';
export { v12DecodeEntities } from './v12-entities.ts';
export type { FlowEdgeSnapshot, FlowSnapshot, FlowVertexSnapshot } from './flowchart/v12.ts';
