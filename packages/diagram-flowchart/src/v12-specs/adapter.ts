/**
 * Test-only adapter for the ported v12 flowchart specs (R-TEST-3): v12's `flow.parser.parse`
 * and `FlowDB` getters, backed by the v13 flowchart parse. The specs' expectations are kept as
 * v12 wrote them; this file only translates names.
 *
 * The `set…` methods the specs spy on (`setClickEvent`, `setLink`, `setTooltip`) are called
 * after each parse with the arguments v12's grammar passed, from the parsed model.
 */
import { parseFlowchart } from '../parser/index.ts';
import type { FlowModel, FlowParseResult } from '../parser/index.ts';

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

export function getConfig(): Config {
  return config;
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

/** v12 `cleanupComments` (the specs call it before parsing). */
export function cleanupComments(text: string): string {
  return text.replace(/^\s*%%(?!{)[^\n]+\n?/gm, '').trimStart();
}

const EMPTY: FlowModel = {
  direction: 'TB',
  vertices: [],
  edges: [],
  classes: [],
  subgraphs: [],
  tooltips: [],
  links: [],
  callbacks: [],
  accTitle: '',
  accDescr: '',
  warnings: [],
};

type Edges = Record<string, unknown>[] & { defaultStyle?: string[]; defaultInterpolate?: string };

export class FlowDB {
  private model: FlowModel | undefined;
  lex = { firstGraph: (): boolean => true };

  clear(): void {
    this.model = undefined;
  }

  setGen(): void {}

  load(result: FlowParseResult): void {
    this.model = result.model;
  }

  private get m(): FlowModel {
    return this.model ?? EMPTY;
  }

  getVertices(): Map<string, Record<string, unknown>> {
    return new Map(this.m.vertices.map((v) => [v.id, { ...v, domId: `flowchart-${v.id}` }]));
  }

  getEdges(): Edges {
    const edges: Edges = this.m.edges.map((e) => ({ ...e }));
    if (this.m.defaultStyle) edges.defaultStyle = this.m.defaultStyle;
    if (this.m.defaultInterpolate) edges.defaultInterpolate = this.m.defaultInterpolate;
    return edges;
  }

  getClasses(): Map<string, FlowModel['classes'][number]> {
    return new Map(this.m.classes.map((c) => [c.id, c]));
  }

  getSubGraphs(): Record<string, unknown>[] {
    return this.m.subgraphs.map((s) => ({ ...s }));
  }

  getDirection(): string {
    return this.m.direction;
  }

  getTooltip(id: string): string | undefined {
    return this.m.tooltips.find(([k]) => k === id)?.[1];
  }

  getAccTitle(): string {
    return this.m.accTitle;
  }

  getAccDescription(): string {
    return this.m.accDescr;
  }

  /** The node and edge fields of v12's LayoutData that the parser specs read. */
  getData(): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } {
    const groups = new Set(this.m.subgraphs.map((s) => s.id));
    const nodes: Record<string, unknown>[] = this.m.subgraphs
      .map((s) => ({ id: s.id, label: s.title, isGroup: true, shape: 'rect' }))
      .reverse();
    for (const v of this.m.vertices) {
      if (groups.has(v.id)) continue;
      nodes.push({ id: v.id, label: v.text, labelType: v.labelType, shape: shapeOf(v) });
    }
    const edges = this.m.edges.map((e) => ({
      id: e.id,
      start: e.start,
      end: e.end,
      animate: e.animate,
      animation: e.animation,
      curve: e.interpolate,
    }));
    return { nodes, edges };
  }

  // Spy targets: the state comes from the parse result.
  setClickEvent = nothing;
  setLink = nothing;
  setTooltip = nothing;
}

function shapeOf(v: FlowModel['vertices'][number]): string {
  if (v.img) return 'imageSquare';
  if (v.icon) {
    if (v.form === 'circle') return 'iconCircle';
    if (v.form === 'square') return 'iconSquare';
    if (v.form === 'rounded') return 'iconRounded';
    return 'icon';
  }
  if (v.type === 'square' || v.type === undefined) return 'squareRect';
  if (v.type === 'round') return 'roundedRect';
  return v.type;
}

/** Replays the click statements with the arguments v12's grammar actions used. */
function replay(db: FlowDB, model: FlowModel): void {
  const tips = new Map(model.tooltips);
  for (const c of model.callbacks) {
    if (c.args === undefined) db.setClickEvent(c.id, c.name);
    else db.setClickEvent(c.id, c.name, c.args);
  }
  for (const l of model.links) {
    if (l.target === undefined) db.setLink(l.id, l.url);
    else db.setLink(l.id, l.url, l.target);
  }
  for (const [id, tip] of tips) db.setTooltip(id, tip);
}

const parser = {
  yy: new FlowDB(),
  parse(text: string): void {
    const result = parseFlowchart(text, {
      maxEdges: config.maxEdges ?? 500,
      inheritDir: config.flowchart?.inheritDir ?? false,
    });
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    for (const d of result.diagnostics) if (d.severity === 'warning') log.warn(d.message);
    parser.yy.load(result);
    replay(parser.yy, result.model);
  },
};

export default { parser };
