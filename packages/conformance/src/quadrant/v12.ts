/**
 * The v12 side of quadrant parity (spec #289): mermaid\@12's quadrant DB, driven through the
 * oracle.
 *
 * - Model parity (#301): v12's DB keeps its builder's data private, so the oracle records the
 *   calls v12's jison grammar makes on the DB (`oracle-env.ts`), and {@link quadrantV12Snapshot}
 *   builds from them what v12's DB stored: texts trimmed and with `encodeEntities` placeholders
 *   decoded, styles as `parseStyles` kept them (the oracle accepted the source, so all are
 *   valid), the last `quadrant-N`, `title`, `accTitle`, `accDescr` and `classDef` of a name,
 *   axis labels merged as `setData` merges them, points in source order (`addPoints` prepends).
 * - Builder parity (#332): {@link v12Quadrant} returns `getQuadrantData()` for a source.
 *
 * Config: `getQuadrantData()` reads v12's global config when called. `oracle.parse(text, config)`
 * resets that config before returning, and `getDiagramFromText` does not apply `%%{init}`
 * directives (12.2.0: `preprocessDiagram` returns their config, only `render` applies it). So
 * `v12Quadrant` sets the source's `quadrantChart` directive options as v12's site config
 * (`initialize`, which `oracle.parse`'s `reset()` restores) around the parse and the
 * `getQuadrantData()` call, and `v13QuadrantConfig` resolves the same options for v13.
 */
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  quadrantChartConfigDefaults,
  type QuadrantLayoutConfig,
  type QuadrantStyles,
  type QuadrantText,
} from '@mermaid-js/diagram-quadrant';
import { decodeEntities } from '../flowchart/v12.ts';
import { loadOracle } from '../oracle.ts';
import { quadrantCalls } from './oracle-env.ts';

/** `diagram.type` values mermaid\@12 reports for quadrant sources. */
export const QUADRANT_V12_TYPES = ['quadrantChart'];

/** v12's `QuadrantTextType`. */
export interface V12QuadrantText {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  verticalPos: 'left' | 'center' | 'right';
  horizontalPos: 'top' | 'middle' | 'bottom';
  rotation: number;
  fill: string;
}

/** v12's `QuadrantBuildType`, the result of `getQuadrantData()`. */
export interface V12QuadrantData {
  points: {
    x: number;
    y: number;
    radius: number;
    fill: string;
    strokeColor: string;
    strokeWidth: string;
    text: V12QuadrantText;
  }[];
  quadrants: {
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    text: V12QuadrantText;
  }[];
  axisLabels: V12QuadrantText[];
  title?: V12QuadrantText;
  borderLines: {
    strokeWidth: number;
    strokeFill: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }[];
}

interface LexText {
  text: string;
  type: 'text' | 'markdown';
}

interface QuadrantDb {
  getQuadrantData(): V12QuadrantData;
}

/** v12 parses one source: its builder output. */
export type V12QuadrantParse =
  | { accepted: true; data: V12QuadrantData }
  | { accepted: false; error: string };

export async function v12Quadrant(source: string): Promise<V12QuadrantParse> {
  const oracle = await loadOracle();
  // The oracle has loaded (and patched) this instance already.
  const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
  mermaid.initialize({ quadrantChart: directiveOptions(source) });
  try {
    const result = await oracle.parse(source);
    if (!result.accepted) return { accepted: false, error: result.error };
    if (result.diagramType !== 'quadrantChart')
      return { accepted: false, error: `not a quadrant chart: ${result.diagramType}` };
    // Read now: the builder is a singleton, and the config is v12's global one.
    const data = structuredClone((result.db as QuadrantDb).getQuadrantData());
    return { accepted: true, data };
  } finally {
    mermaid.initialize({});
  }
}

interface MermaidV12 {
  initialize(config: Record<string, unknown>): void;
}

/** The `quadrantChart` options of the source's `%%{init}` directives, merged in order. */
function directiveOptions(source: string): Record<string, unknown> {
  let section: Record<string, unknown> = {};
  for (const d of preprocess(source).directives) {
    const args = d.args as { quadrantChart?: Record<string, unknown> } | undefined;
    if (d.kind === 'init' && args?.quadrantChart) section = { ...section, ...args.quadrantChart };
  }
  return section;
}

/** What v12's quadrant DB stored for a parse, in the shape of v13's `QuadrantModel`. */
export interface QuadrantSnapshot {
  /** The in-text title (the oracle skips front matter); `''` without one. */
  title: string;
  accTitle: string;
  accDescr: string;
  quadrants: (QuadrantText | null)[];
  xAxis: { start: QuadrantText | null; end: QuadrantText | null } | null;
  yAxis: { start: QuadrantText | null; end: QuadrantText | null } | null;
  points: {
    label: QuadrantText;
    className: string;
    x: string;
    y: string;
    styles: QuadrantStyles;
  }[];
  classes: [name: string, styles: QuadrantStyles][];
}

const text = (t: LexText): QuadrantText => ({
  text: decodeEntities(t.text.trim()),
  markdown: t.type === 'markdown',
});

/** v12's `parseStyles`, into model values; v12 has already checked them. */
function styles(list: readonly string[]): QuadrantStyles {
  const out: { -readonly [K in keyof QuadrantStyles]: QuadrantStyles[K] } = {};
  for (const style of list) {
    const [key, value = ''] = style.trim().split(/\s*:\s*/);
    if (key === 'radius') out.radius = Number.parseInt(value, 10);
    else if (key === 'color') out.color = value;
    else if (key === 'stroke-color') out.strokeColor = value;
    else if (key === 'stroke-width') out.strokeWidth = Number.parseInt(value, 10);
  }
  return out;
}

/** The snapshot of v12's DB after the oracle's last parse (the parity normaliser). */
export function quadrantV12Snapshot(_db: unknown): QuadrantSnapshot {
  const out: QuadrantSnapshot = {
    title: '',
    accTitle: '',
    accDescr: '',
    quadrants: [null, null, null, null],
    xAxis: null,
    yAxis: null,
    points: [],
    classes: [],
  };
  const classes = new Map<string, QuadrantStyles>();
  const axis = (which: 'xAxis' | 'yAxis', end: 'start' | 'end', t: LexText) => {
    out[which] = { start: null, end: null, ...out[which], [end]: text(t) };
  };
  for (const [name, args] of quadrantCalls()) {
    const a = args[0] as LexText;
    const quadrant = /^setQuadrant(\d)Text$/.exec(name);
    if (quadrant) out.quadrants[Number(quadrant[1]) - 1] = text(a);
    else if (name === 'setXAxisLeftText') axis('xAxis', 'start', a);
    else if (name === 'setXAxisRightText') axis('xAxis', 'end', a);
    else if (name === 'setYAxisBottomText') axis('yAxis', 'start', a);
    else if (name === 'setYAxisTopText') axis('yAxis', 'end', a);
    else if (name === 'setDiagramTitle') out.title = decodeEntities(args[0] as string);
    else if (name === 'setAccTitle') out.accTitle = decodeEntities(args[0] as string);
    else if (name === 'setAccDescription')
      out.accDescr = decodeEntities((args[0] as string).replace(/\n\s+/g, '\n'));
    else if (name === 'addPoint') {
      const [label, className, x, y, list] = args as [LexText, string, string, string, string[]];
      out.points.push({
        label: text(label),
        className,
        x: decodeEntities(String(x)),
        y: decodeEntities(String(y)),
        styles: styles(list),
      });
    } else if (name === 'addClass') {
      const [className, list] = args as [string, string[]];
      classes.set(decodeEntities(className), styles(list));
    }
  }
  out.classes = [...classes];
  return out;
}

/** The resolved `quadrantChart` options of `source`: its `%%{init}` directives over the defaults. */
export function v13QuadrantConfig(source: string): QuadrantLayoutConfig {
  return { ...quadrantChartConfigDefaults, ...directiveOptions(source) } as QuadrantLayoutConfig;
}
