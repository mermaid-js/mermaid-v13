/**
 * Test-only adapter for the ported v12 agentflow specs (R-TEST-3): v12's `agentflow.parser`
 * and its `AgentFlowDB` getters, backed by the v13 parse. The specs' expectations are kept as
 * v12 wrote them; this file only translates names and shapes:
 *
 * - `agentflow.parser.parse(text)` (and `agentflow.parse`) throws the first error diagnostic's
 *   message, as v12 threw, else loads the model into `agentflow.parser.yy`;
 * - `getVertices()`, `getEdges()`, `getSubGraphs()`, `getConnectors()`, `getClasses()` and
 *   `getDirection()` return the model in v12's record shapes;
 * - `getSemanticModel()` is the pure `semanticModel()` (D465) and `getDiagnostics()` its
 *   diagnostics, each with a v12 `position` (1-based line, 0-based column) from the v13 range;
 * - `getData()` is the part of v12's LayoutData the specs read: nodes (flows as `flowGroup` or
 *   `collapsedGroup`, hidden members left out, v12's shape names and `parentId`) and edges
 *   (redirected to the collapsed flow, collapse-made self-loops dropped).
 *
 * v12's other DB methods (`emitWarning`, the element mappings) are gone in v13 (D465); the
 * specs that call them are skipped in `scripts/port-v12-specs.ts`.
 */
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseAgentflow } from '../parser/index.ts';
import type { AgentflowModel, AgentflowParseResult } from '../parser/index.ts';
import { drawnShape } from '../parser/shapes.ts';
import { semanticModel } from '../semantic.ts';

interface Config {
  securityLevel?: string;
  maxEdges?: number;
  flowchart?: { inheritDir?: boolean };
  [key: string]: unknown;
}

let config: Config = {};

export function setConfig(next: Config): void {
  config = { ...config, ...next };
}

const nothing = (...args: unknown[]): void => void args;
export const log = {
  trace: nothing,
  debug: nothing,
  info: nothing,
  warn: nothing,
  error: nothing,
  fatal: nothing,
};

/** v12's diagnostic vocabulary (`diagnostics.ts`): the twelve ids. */
export const AgentflowWarning = {
  SHAPE_UNSUPPORTED: 'SHAPE_UNSUPPORTED',
  SHAPE_REMOVED: 'SHAPE_REMOVED',
  EDGE_OPERATOR_UNSUPPORTED: 'EDGE_OPERATOR_UNSUPPORTED',
  REFERENCE_EDGE_LABEL_REJECTED: 'REFERENCE_EDGE_LABEL_REJECTED',
  CONNECTOR_REF_UNRESOLVED: 'CONNECTOR_REF_UNRESOLVED',
  CONNECTOR_REF_NOT_A_CONNECTOR: 'CONNECTOR_REF_NOT_A_CONNECTOR',
  METADATA_KEY_MISAPPLIED: 'METADATA_KEY_MISAPPLIED',
  DUPLICATE_ID_NODE: 'DUPLICATE_ID_NODE',
  RESERVED_SYNTHETIC_ID: 'RESERVED_SYNTHETIC_ID',
  CONTAINMENT_VIOLATION: 'CONTAINMENT_VIOLATION',
  EDGE_SEMANTIC_CONTRADICTION: 'EDGE_SEMANTIC_CONTRADICTION',
  FLOW_NO_INPUT: 'FLOW_NO_INPUT',
} as const;

export const PARSER_EMITTED_DIAGNOSTICS: ReadonlySet<string> = new Set([
  'SHAPE_UNSUPPORTED',
  'SHAPE_REMOVED',
  'CONTAINMENT_VIOLATION',
]);

export const RESERVED_DIAGNOSTICS: ReadonlySet<string> = new Set(
  Object.values(AgentflowWarning).filter((id) => !PARSER_EMITTED_DIAGNOSTICS.has(id))
);

/** v12's position of a diagnostic: lines 1-based, columns 0-based. */
interface Position {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

type Rec = Record<string, unknown>;

/** v12's name for the shape a vertex is drawn with (`normaliseNodeShapes`). */
function v12Shape(type: string | undefined): string {
  const check = drawnShape(type);
  return check.problem || check.name === 'rect' || check.name === 'squareRect'
    ? 'roundedRect'
    : check.name;
}

export class AgentFlowDB {
  private result: AgentflowParseResult | undefined;
  private source = '';
  /** v12's `setFrontmatterLineOffset`: lines before the text, for thrown positions. */
  frontmatterLineOffset = 0;

  setFrontmatterLineOffset(offset: number): void {
    this.frontmatterLineOffset = offset;
  }
  lex = { firstGraph: (): boolean => true };

  clear(): void {
    this.result = undefined;
    this.source = '';
    this.frontmatterLineOffset = 0;
  }

  /** v12's generation switch: v13 has one. */
  setGen(): void {
    // Nothing to set.
  }

  load(result: AgentflowParseResult, source: string): void {
    this.result = result;
    this.source = source;
  }

  private get m(): AgentflowModel | undefined {
    return this.result?.model;
  }

  getDirection(): string | undefined {
    return this.m?.direction;
  }

  getVertices(): Map<string, Rec> {
    const out = new Map<string, Rec>();
    for (const v of this.m?.vertices ?? []) {
      const rec: Rec = {
        id: v.id,
        text: v.text,
        labelType: v.labelType,
        domId: `agentflow-${v.id}`,
        styles: v.styles,
        classes: v.classes,
        props: v.props,
      };
      if (v.type !== undefined) rec.type = v.type;
      if (v.metadata !== undefined) rec.metadata = v.metadata;
      if (v.connector) rec.isConnector = true;
      if (v.link !== undefined) rec.link = v.link;
      if (v.linkTarget !== undefined) rec.linkTarget = v.linkTarget;
      out.set(v.id, rec);
    }
    return out;
  }

  getEdges(): Rec[] & { defaultInterpolate?: string; defaultStyle?: string[] } {
    const m = this.m;
    const edges: Rec[] & { defaultInterpolate?: string; defaultStyle?: string[] } = (
      m?.edges ?? []
    ).map((e) => {
      const rec: Rec = { ...e };
      delete rec.ast;
      delete rec.semantic;
      if (e.semantic !== undefined) rec.edgeSemantic = e.semantic;
      return rec;
    });
    if (m?.defaultInterpolate !== undefined) edges.defaultInterpolate = m.defaultInterpolate;
    if (m?.defaultStyle !== undefined) edges.defaultStyle = m.defaultStyle;
    return edges;
  }

  getSubGraphs(): Rec[] {
    return (this.m?.flows ?? []).map((f) => {
      const rec: Rec = {
        id: f.id,
        nodes: f.nodes,
        title: f.title,
        classes: f.classes,
        labelType: f.labelType,
        type: 'flow',
      };
      if (f.dir !== undefined) rec.dir = f.dir;
      if (f.metadata !== undefined) rec.metadata = f.metadata;
      return rec;
    });
  }

  getConnectors(): Rec[] {
    const all = this.getVertices();
    return (this.m?.connectors ?? []).flatMap((id) => {
      const v = all.get(id);
      return v ? [v] : [];
    });
  }

  getTools(): Rec[] {
    return [...this.getVertices().values()].filter((v) => this.isToolDefinition(v));
  }

  getClasses(): Map<string, Rec> {
    return new Map((this.m?.classes ?? []).map((c) => [c.id, { ...c }]));
  }

  isToolDefinition(vertex: Rec): boolean {
    return ['subroutine', 'subprocess', 'subproc', 'framed-rectangle', 'tool'].includes(
      String(vertex.type)
    );
  }

  private position(range: { start: number; end: number }): Position {
    const lines = new LineIndex(this.source);
    const a = lines.position(range.start);
    const b = lines.position(range.end);
    return {
      startLine: a.line + 1,
      startColumn: a.column,
      endLine: b.line + 1,
      endColumn: b.column,
    };
  }

  getDiagnostics(): Rec[] {
    const m = this.m;
    if (!m) return [];
    return m.findings.map(({ range, ...d }) => ({ ...d, position: this.position(range) }));
  }

  getSemanticModel(): ReturnType<typeof semanticModel> | Rec {
    const m = this.m;
    if (!m) return { vertices: [], edges: [], subGraphs: [], connectors: [], diagnostics: [] };
    const model = semanticModel(m);
    return { ...model, diagnostics: this.getDiagnostics() };
  }

  /** The part of v12's `getData()` the specs read. */
  getData(): { nodes: Rec[]; edges: Rec[] } {
    const m = this.m;
    if (!m) return { nodes: [], edges: [] };
    const nodes: Rec[] = [];
    for (let i = m.flows.length - 1; i >= 0; i--) {
      const f = m.flows[i];
      if (!f || f.collapsedInto !== undefined) continue;
      const node: Rec = {
        id: f.id,
        label: f.title,
        labelType: f.labelType,
        parentId: f.parent,
        shape: f.collapsed ? 'collapsedGroup' : 'flowGroup',
        isGroup: !f.collapsed,
        dir: f.dir,
      };
      node.metadata = f.collapsed ? { ...f.metadata, containerType: 'flow' } : f.metadata;
      nodes.push(node);
    }
    for (const v of m.vertices) {
      if (v.collapsedInto !== undefined) continue;
      nodes.push({
        id: v.id,
        label: v.text,
        labelType: v.labelType,
        parentId: v.parent,
        shape: v12Shape(v.type),
        isGroup: false,
        metadata: v.metadata,
        cssStyles: v.styles,
        cssClasses: ['default', ...v.classes].join(' '),
      });
    }
    const into = new Map<string, string>();
    for (const x of [...m.flows, ...m.vertices]) {
      if (x.collapsedInto !== undefined) into.set(x.id, x.collapsedInto);
    }
    const edges: Rec[] = [];
    for (const e of m.edges) {
      const start = into.get(e.start) ?? e.start;
      const end = into.get(e.end) ?? e.end;
      if (start === end && e.start !== e.end) continue;
      edges.push({
        id: e.id,
        start,
        end,
        type: e.type,
        label: e.text,
        labelType: e.labelType,
        thickness: e.stroke,
        minlen: e.length,
        arrowTypeEnd: e.type === 'arrow_open' ? 'none' : e.type,
        animate: e.animate,
        animation: e.animation,
        curve: e.interpolate ?? m.defaultInterpolate,
        metadata: e.metadata,
      });
    }
    return { nodes, edges };
  }
}

/** The codes of syntax errors, which jison reported as `Parse error on line N`. */
const SYNTAX = new Set([
  'UNEXPECTED',
  'UNEXPECTED_CHARACTER',
  'UNEXPECTED_END',
  'UNCLOSED',
  'UNCLOSED_STRING',
  'UNCLOSED_BLOCK',
  'UNKNOWN_DIRECTION',
  'HEADER_COMMENT',
]);

/**
 * Parse `text` as v12's parser did: the first error throws (a syntax error as
 * `Parse error on line N: …`, with jison's `hash.loc` from the v13 range), else `yy` gets the
 * model.
 */
function run(text: string, yy: AgentFlowDB | undefined): void {
  const result = parseAgentflow(text, {
    inheritDir: config.flowchart?.inheritDir,
    ...(config.maxEdges === undefined ? {} : { maxEdges: config.maxEdges }),
  });
  const error = result.diagnostics.find((d) => d.severity === 'error');
  if (error) {
    const lines = new LineIndex(text);
    const offset = yy?.frontmatterLineOffset ?? 0;
    const a = lines.position(error.range.start);
    const b = lines.position(error.range.end);
    const line = a.line + 1 + offset;
    const message = SYNTAX.has(error.code)
      ? `Parse error on line ${line}: ${error.message}`
      : error.message;
    throw Object.assign(new Error(message), {
      hash: {
        line: line - 1,
        loc: {
          first_line: line,
          last_line: b.line + 1 + offset,
          first_column: a.column,
          last_column: b.column,
        },
      },
    });
  }
  yy?.load(result, text);
}

const parser = {
  yy: undefined as AgentFlowDB | undefined,
  parse(text: string): void {
    run(text, this.yy);
  },
};

const agentflow = {
  parser,
  get yy(): AgentFlowDB | undefined {
    return parser.yy;
  },
  set yy(db: AgentFlowDB | undefined) {
    parser.yy = db;
  },
  parse(text: string): void {
    run(text, parser.yy);
  },
};

export default agentflow;
