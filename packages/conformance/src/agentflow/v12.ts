/**
 * The v12 side of agentflow parity (spec #523): mermaid\@12's `AgentFlowDB`, driven through the
 * oracle. The snapshot is v12's own `getSemanticModel()` after `getData()` (which emits the
 * diagnostics), with:
 *
 * - every string (ids, labels, titles, metadata keys and values) with v12's `encodeEntities`
 *   placeholders decoded, as v13 reads them (the oracle's DOMPurify is the identity);
 * - diagnostics without `position` (v13 reports ranges, D461; editors answer positions through
 *   the language service, D465), sorted, and `SHAPE_REMOVED` a warning, as D461 decides;
 * - what the renderer reads besides (`styling`): the class definitions, the accessibility
 *   texts, and each vertex's and edge's styles and classes, from the DB's getters.
 */
import { decodeEntities } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for agentflow sources. */
export const AGENTFLOW_V12_TYPES = ['agentflow'];

/** The plain-data form both sides of agentflow parity normalise to: v12's semantic model. */
export interface AgentflowSnapshot {
  direction: string | null;
  vertices: unknown[];
  edges: unknown[];
  subGraphs: unknown[];
  connectors: unknown[];
  diagnostics: { id: string; severity: string; message: string; nodeId: string | null }[];
  styling: unknown;
}

interface AgentflowDbV12 {
  getData(): unknown;
  getAccTitle(): string;
  getAccDescription(): string;
  getClasses(): Map<string, { id: string; styles: string[]; textStyles: string[] }>;
  getVertices(): Map<string, { id: string; styles: string[]; classes: string[] }>;
  getEdges(): { id: string; classes: string[]; style?: string[]; interpolate?: string }[];
  getSubGraphs(): { id: string }[];
  getSemanticModel(): {
    direction?: string;
    vertices: unknown[];
    edges: unknown[];
    subGraphs: unknown[];
    connectors: unknown[];
    diagnostics: readonly { id: string; severity: string; message: string; nodeId?: string }[];
  };
}

/** `value` with every string in it (keys included) decoded. */
export function decoded(value: unknown): unknown {
  if (typeof value === 'string') return decodeEntities(value);
  if (Array.isArray(value)) return value.map(decoded);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[decodeEntities(k)] = decoded(v);
  return out;
}

/** Diagnostics in one order on both sides (v12 emits them in its `getData` walk). */
export function sortDiagnostics(
  list: AgentflowSnapshot['diagnostics']
): AgentflowSnapshot['diagnostics'] {
  const key = (d: AgentflowSnapshot['diagnostics'][number]) =>
    `${d.id}\0${d.nodeId ?? ''}\0${d.message}`;
  return [...list].sort((a, b) => key(a).localeCompare(key(b)));
}

export function agentflowV12Snapshot(dbValue: unknown): AgentflowSnapshot {
  const db = dbValue as AgentflowDbV12;
  db.getData();
  const m = db.getSemanticModel();
  const flows = new Set(db.getSubGraphs().map((f) => f.id));
  const diagnostics = m.diagnostics.map((d) => ({
    id: d.id,
    // D461: v12 reported SHAPE_REMOVED as an error yet drew the diagram; v13 warns.
    severity: d.id === 'SHAPE_REMOVED' ? 'warning' : d.severity,
    message: decodeEntities(d.message),
    nodeId: d.nodeId === undefined ? null : decodeEntities(d.nodeId),
  }));
  return {
    direction: m.direction ?? null,
    vertices: decoded(m.vertices) as unknown[],
    edges: decoded(m.edges) as unknown[],
    subGraphs: decoded(m.subGraphs) as unknown[],
    connectors: decoded(m.connectors) as unknown[],
    diagnostics: sortDiagnostics(diagnostics),
    styling: decoded({
      accTitle: db.getAccTitle(),
      accDescr: db.getAccDescription(),
      classes: [...db.getClasses().values()],
      vertices: [...db.getVertices().values()]
        .filter((v) => !flows.has(v.id))
        .map((v) => ({ id: v.id, styles: v.styles, classes: v.classes })),
      edges: db.getEdges().map((e) => ({
        id: e.id,
        classes: e.classes,
        style: e.style ?? null,
        interpolate: e.interpolate ?? null,
      })),
    }),
  };
}
