/**
 * The v12 side of wardley parity: a plain-data snapshot of mermaid\@12's wardley DB
 * (`getWardleyData()`, the title and accessibility), in the shape of v13's `WardleyModel`
 * without AST ids and warnings. v12's DB is a module singleton: this copies what it needs right
 * after the oracle's parse.
 *
 * Normalisation, chosen so the snapshot holds what v12 built and nothing else:
 * - text is what v12 drew: each `encodeEntities` placeholder (`#name;`, `#123;`) as the
 *   character v12's SVG showed (core's named set and numeric references; another name stays
 *   `&name;`, as a browser shows it), and a literal `&name;` as written (GAPS #493);
 * - flags v12 left unset (`inertia` on an anchor, `inPipeline`, `isPipelineParent`) are `false`;
 * - an annotation's one point is `x`, `y`; `axes` is the evolution, when it has stages;
 * - the title is the in-text one: the oracle never passes the front matter on, so
 *   `getDiagramTitle()` holds no front-matter title (the v13 side leaves it out too).
 */
import { entityAt } from '@mermaid-js/core/text';

/** A placeholder `ﬂ°name¶ß` / `ﬂ°°123¶ß`, which v12's SVG wrote as `&name;` / `&#123;`. */
const RE_PLACEHOLDER = /ﬂ°(°?)(\w+)¶ß/g;

/** v12's text as drawn: its placeholders as their characters. */
const d = (text: string): string =>
  text.replace(RE_PLACEHOLDER, (_, hash: string, name: string) => {
    const ref = `&${hash ? '#' : ''}${name};`;
    return entityAt(ref, 0)?.[0] ?? ref;
  });

/** `diagram.type` values mermaid\@12 reports for wardley sources. */
export const WARDLEY_V12_TYPES = ['wardley'];

interface Point {
  x: number;
  y: number;
}

export interface WardleySnapshot {
  nodes: {
    id: string;
    label: string;
    x: number;
    y: number;
    className: string | undefined;
    labelOffsetX: number | undefined;
    labelOffsetY: number | undefined;
    inertia: boolean;
    sourceStrategy: string | undefined;
    inPipeline: boolean;
    isPipelineParent: boolean;
  }[];
  links: {
    source: string;
    target: string;
    dashed: boolean;
    label: string | undefined;
    flow: string | undefined;
  }[];
  trends: { nodeId: string; targetX: number; targetY: number }[];
  pipelines: { nodeId: string; componentIds: string[] }[];
  notes: ({ text: string } & Point)[];
  annotations: ({ number: number; text: string | undefined } & Point)[];
  annotationsBox: Point | undefined;
  accelerators: ({ name: string } & Point)[];
  deaccelerators: ({ name: string } & Point)[];
  evolution: { stages: string[]; boundaries: number[] } | undefined;
  size: { width: number; height: number } | undefined;
  title: string;
  accTitle: string;
  accDescr: string;
}

interface WardleyNodeV12 {
  id: string;
  label: string;
  x: number;
  y: number;
  className?: string;
  labelOffsetX?: number;
  labelOffsetY?: number;
  inertia?: boolean;
  sourceStrategy?: string;
  inPipeline?: boolean;
  isPipelineParent?: boolean;
}

interface WardleyDataV12 {
  nodes: WardleyNodeV12[];
  links: { source: string; target: string; dashed?: boolean; label?: string; flow?: string }[];
  trends: { nodeId: string; targetX: number; targetY: number }[];
  pipelines: { nodeId: string; componentIds: string[] }[];
  annotations: { number: number; coordinates: Point[]; text?: string }[];
  notes: ({ text: string } & Point)[];
  accelerators: ({ name: string } & Point)[];
  deaccelerators: ({ name: string } & Point)[];
  annotationsBox?: Point;
  axes: { stages?: string[]; stageBoundaries?: number[] };
  size?: { width: number; height: number };
}

interface WardleyDbV12 {
  getWardleyData(): WardleyDataV12;
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

const opt = (v: string | undefined) => (v === undefined ? undefined : d(v));
const point = (p: Point): Point => ({ x: p.x, y: p.y });

export function wardleyV12Snapshot(dbValue: unknown): WardleySnapshot {
  const db = dbValue as WardleyDbV12;
  const data = db.getWardleyData();
  const point0 = (a: { coordinates: Point[] }) => point(a.coordinates[0] ?? { x: NaN, y: NaN });
  return {
    nodes: data.nodes.map((n) => ({
      id: d(n.id),
      label: d(n.label),
      x: n.x,
      y: n.y,
      className: n.className,
      labelOffsetX: n.labelOffsetX,
      labelOffsetY: n.labelOffsetY,
      inertia: n.inertia === true,
      sourceStrategy: n.sourceStrategy,
      inPipeline: n.inPipeline === true,
      isPipelineParent: n.isPipelineParent === true,
    })),
    links: data.links.map((l) => ({
      source: d(l.source),
      target: d(l.target),
      dashed: l.dashed === true,
      label: opt(l.label),
      flow: l.flow,
    })),
    trends: data.trends.map((t) => ({
      nodeId: d(t.nodeId),
      targetX: t.targetX,
      targetY: t.targetY,
    })),
    pipelines: data.pipelines.map((p) => ({
      nodeId: d(p.nodeId),
      componentIds: p.componentIds.map(d),
    })),
    notes: data.notes.map((n) => ({ text: d(n.text), ...point(n) })),
    annotations: data.annotations.map((a) => ({
      number: a.number,
      text: opt(a.text),
      ...point0(a),
    })),
    annotationsBox: data.annotationsBox && point(data.annotationsBox),
    accelerators: data.accelerators.map((a) => ({ name: d(a.name), ...point(a) })),
    deaccelerators: data.deaccelerators.map((a) => ({ name: d(a.name), ...point(a) })),
    evolution: data.axes.stages && {
      stages: data.axes.stages.map(d),
      boundaries: [...(data.axes.stageBoundaries ?? [])],
    },
    size: data.size && { width: data.size.width, height: data.size.height },
    title: d(db.getDiagramTitle()),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
  };
}
