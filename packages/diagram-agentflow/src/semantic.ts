/**
 * The tool builders' view of an agentflow (D465): v12's `AgentFlowDB.getSemanticModel()`
 * (`fa796a943`), as a pure function of the parsed model. Presentation keys are left out of the
 * metadata (`shape`, `view`, `icon`, `img`, `form`, `pos`, `w`, `h`, `class`, `style`,
 * `labelType`), as v12 left them out. Positions are the language service's (symbols, `astAt`).
 */
import type { AgentflowModel, EdgeSemantic } from './parser/model.ts';
import { resolveShape } from './parser/shapes.ts';
import type { VertexKind } from './parser/shapes.ts';

/** A vertex as tooling sees it. */
export interface SemanticVertex {
  id: string;
  label?: string;
  /** The shape as v12 resolved it (`task` is `roundedRect`, `[/x/]` is `lean-right`). */
  shape?: string;
  vertexKind?: Exclude<VertexKind, 'connector'>;
  metadata?: Record<string, unknown>;
}

export interface SemanticEdge {
  start: string;
  end: string;
  id?: string;
  label?: string;
  /** `arrow_point`, `arrow_cross` or `arrow_open`. */
  type?: string;
  /** `normal` or `dotted`. */
  stroke?: string;
  edgeSemantic?: EdgeSemantic;
  length?: number;
  /** Every `@{ … }` key, presentation keys included (as v12 kept them on edges). */
  metadata?: Record<string, unknown>;
}

export interface SemanticSubGraph {
  id: string;
  /** Always `flow`. */
  type?: string;
  title?: string;
  /** Direct members. */
  nodes: string[];
  metadata?: Record<string, unknown>;
  direction?: string;
}

export interface SemanticConnector {
  id: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

/** One of the diagnostics v12 emitted (D461 makes `SHAPE_REMOVED` a warning). */
export interface SemanticDiagnostic {
  id: 'SHAPE_REMOVED' | 'SHAPE_UNSUPPORTED' | 'CONTAINMENT_VIOLATION';
  severity: 'warning';
  message: string;
  nodeId?: string;
}

export interface AgentflowSemanticModel {
  direction?: string;
  vertices: SemanticVertex[];
  edges: SemanticEdge[];
  subGraphs: SemanticSubGraph[];
  connectors: SemanticConnector[];
  diagnostics: SemanticDiagnostic[];
}

const SKIP_KEYS: ReadonlySet<string> = /* @__PURE__ */ new Set([
  'shape',
  'view',
  'icon',
  'img',
  'form',
  'pos',
  'w',
  'h',
  'class',
  'style',
  'labelType',
]);

/** The metadata without its presentation keys; undefined when nothing is left. */
function semantic(
  meta: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> | undefined {
  if (meta === undefined) return undefined;
  let out: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(meta)) {
    if (SKIP_KEYS.has(key)) continue;
    (out ??= {})[key] = value;
  }
  return out;
}

/** v12's semantic model of `model`. Pure: the model is not changed. */
export function semanticModel(model: AgentflowModel): AgentflowSemanticModel {
  const vertices: SemanticVertex[] = [];
  const connectors: SemanticConnector[] = [];
  for (const v of model.vertices) {
    const meta = semantic(v.metadata);
    if (v.connector) {
      const c: SemanticConnector = { id: v.id };
      if (v.text !== v.id) c.title = v.text;
      if (meta) c.metadata = meta;
      connectors.push(c);
      continue;
    }
    const out: SemanticVertex = { id: v.id, label: v.text };
    const shape = resolveShape(v.type);
    if (shape !== undefined) out.shape = shape;
    out.vertexKind = v.kind === 'connector' ? 'task' : v.kind;
    if (meta) out.metadata = meta;
    vertices.push(out);
  }
  const edges = model.edges.map((e) => {
    const out: SemanticEdge = { start: e.start, end: e.end, id: e.id };
    if (e.text.length > 0) out.label = e.text;
    out.type = e.type;
    out.stroke = e.stroke;
    if (e.semantic !== undefined) out.edgeSemantic = e.semantic;
    if (e.length !== undefined) out.length = e.length;
    if (e.metadata && Object.keys(e.metadata).length > 0) out.metadata = { ...e.metadata };
    return out;
  });
  const subGraphs = model.flows.map((f) => {
    const out: SemanticSubGraph = { id: f.id, nodes: [...f.nodes], type: 'flow', title: f.title };
    if (f.dir !== undefined) out.direction = f.dir;
    const meta = semantic(f.metadata);
    if (meta) out.metadata = meta;
    return out;
  });
  const diagnostics = model.findings.map(({ id, severity, message, nodeId }) => ({
    id,
    severity,
    message,
    nodeId,
  }));
  return { vertices, edges, subGraphs, connectors, diagnostics, direction: model.direction };
}
