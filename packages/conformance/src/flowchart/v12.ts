/**
 * The v12 side of flowchart parity: a plain-data snapshot of mermaid@12's FlowDB.
 *
 * The shape is the Chevrotain branch's `flow.db-parity.spec.ts` snapshot (`snapshotVertex`,
 * `snapshotEdge`, DESIGN §13.1), plus `accTitle`/`accDescr` (R-COMPAT-6). Differences from it:
 * vertices keep insertion order (v13's FlowModel is insertion-ordered), and text has v12's
 * `encodeEntities` placeholders decoded back to what the author wrote. The v13 normaliser
 * (ticket #8) must produce a `FlowSnapshot` from a FlowModel.
 */
import { v12DecodeEntities } from '../v12-entities.ts';

/** `diagram.type` values mermaid@12 reports for flowchart sources. */
export const FLOWCHART_V12_TYPES = ['flowchart-v2', 'flowchart', 'flowchart-elk'];

export interface FlowVertexSnapshot {
  id: string;
  text: string | undefined;
  type: string | undefined;
  labelType: string | undefined;
  styles: string[];
  classes: string[];
  link: string | undefined;
  linkTarget: string | undefined;
  props: unknown;
  dir: string | undefined;
}

export interface FlowEdgeSnapshot {
  start: string;
  end: string;
  type: string | undefined;
  stroke: string | undefined;
  length: number | undefined;
  text: string | undefined;
  labelType: string | undefined;
  id: string | undefined;
  classes: string[];
  style: string[] | undefined;
  interpolate: string | undefined;
}

export interface FlowSnapshot {
  direction: string | undefined;
  accTitle: string;
  accDescr: string;
  vertices: FlowVertexSnapshot[];
  edges: FlowEdgeSnapshot[];
  classes: { id: string; styles: string[]; textStyles: string[] }[];
  subGraphs: {
    id: string;
    title: string;
    nodes: string[];
    dir: string | undefined;
    classes: string[];
  }[];
  /** `[vertexId, tooltip]` in vertex order, for vertices that have one. */
  tooltips: [string, string][];
}

/** The parts of v12's FlowDB the snapshot reads. */
interface FlowDbV12 {
  getDirection(): string | undefined;
  getAccTitle(): string;
  getAccDescription(): string;
  getVertices(): Map<string, Record<string, unknown>>;
  getEdges(): Record<string, unknown>[];
  getClasses(): Map<string, { id: string; styles: string[]; textStyles: string[] }>;
  getSubGraphs(): { id: string; title: string; nodes: string[]; dir?: string; classes: string[] }[];
  getTooltip(id: string): string | undefined;
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' ? v12DecodeEntities(v) : undefined;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function flowchartV12Snapshot(dbValue: unknown): FlowSnapshot {
  const db = dbValue as FlowDbV12;
  const vertices = [...db.getVertices().values()].map(
    (v): FlowVertexSnapshot => ({
      id: String(v.id),
      text: text(v.text),
      type: str(v.type),
      labelType: str(v.labelType),
      styles: strings(v.styles),
      classes: strings(v.classes),
      link: str(v.link),
      linkTarget: str(v.linkTarget),
      props: v.props,
      dir: str(v.dir),
    })
  );
  const edges = db.getEdges().map(
    (e): FlowEdgeSnapshot => ({
      start: String(e.start),
      end: String(e.end),
      type: str(e.type),
      stroke: str(e.stroke),
      length: typeof e.length === 'number' ? e.length : undefined,
      text: text(e.text),
      labelType: str(e.labelType),
      id: text(e.id),
      classes: strings(e.classes),
      style: Array.isArray(e.style) ? strings(e.style) : undefined,
      interpolate: str(e.interpolate),
    })
  );
  const tooltips: [string, string][] = [];
  for (const v of vertices) {
    const tip = db.getTooltip(v.id);
    if (tip !== undefined) tooltips.push([v.id, v12DecodeEntities(tip)]);
  }
  return {
    direction: db.getDirection(),
    accTitle: v12DecodeEntities(db.getAccTitle()),
    accDescr: v12DecodeEntities(db.getAccDescription()),
    vertices,
    edges,
    classes: [...db.getClasses().values()].map((c) => ({
      id: c.id,
      styles: [...c.styles],
      textStyles: [...c.textStyles],
    })),
    subGraphs: db.getSubGraphs().map((s) => ({
      id: s.id,
      title: v12DecodeEntities(s.title),
      nodes: [...s.nodes].sort(),
      dir: s.dir,
      classes: [...s.classes],
    })),
    tooltips,
  };
}
