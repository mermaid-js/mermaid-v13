/**
 * The v12 side of quadrant layout parity (spec #289 T3): mermaid\@12's quadrant DB, driven
 * through the oracle.
 *
 * Until the v13 parser (#301) exists, `v12QuadrantModel` is the interim fixture source: it records
 * the calls v12's jison grammar makes on the DB (`yy`) during a parse and builds the
 * `QuadrantModel` they describe, the way #301's parser is specified to (texts trimmed, styles split
 * and checked as v12's `parseStyles`, points in source order, coordinates as lexed). Calls run
 * through to v12's own DB, so `getQuadrantData()` afterwards is v12's builder output for the same
 * parse. Text keeps v12's `encodeEntities` placeholders (the corpus has none).
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
  type QuadrantLabel,
  type QuadrantLabels,
  type QuadrantLayoutConfig,
  type QuadrantModel,
  type QuadrantPoint,
  type QuadrantStyles,
  type QuadrantText,
} from '@mermaid-js/diagram-quadrant';
import { loadOracle } from '../oracle.ts';

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

type Call = readonly [method: string, args: readonly unknown[]];

interface QuadrantDb {
  getQuadrantData(): V12QuadrantData;
  [method: string]: unknown;
}

/** The DB methods the grammar calls, which the recorder wraps. */
const RECORDED = [
  'setQuadrant1Text',
  'setQuadrant2Text',
  'setQuadrant3Text',
  'setQuadrant4Text',
  'setXAxisLeftText',
  'setXAxisRightText',
  'setYAxisBottomText',
  'setYAxisTopText',
  'addPoint',
  'addClass',
  'setDiagramTitle',
  'setAccTitle',
  'setAccDescription',
] as const;

let calls: Call[] = [];
let recording: Promise<void> | undefined;

/** Wrap v12's quadrant DB (a module singleton, the grammar's `yy`) once, to record its calls. */
function record(): Promise<void> {
  recording ??= (async () => {
    const result = await (await loadOracle()).parse('quadrantChart\n');
    if (!result.accepted) throw new Error(`v12 rejected an empty quadrant chart: ${result.error}`);
    const db = result.db as QuadrantDb;
    const clear = db.clear as () => void;
    db.clear = () => {
      calls = [];
      clear();
    };
    for (const name of RECORDED) {
      const original = db[name] as (...args: unknown[]) => unknown;
      db[name] = (...args: unknown[]) => {
        const out = original(...args);
        // Recorded after the call: a call v12 rejects (a bad style) throws first.
        calls.push([name, structuredClone(args)]);
        return out;
      };
    }
  })();
  return recording;
}

/** v12 parses one source: the model its DB calls describe and its builder output. */
export type V12QuadrantParse =
  | { accepted: true; model: QuadrantModel; data: V12QuadrantData }
  | { accepted: false; error: string };

export async function v12Quadrant(source: string): Promise<V12QuadrantParse> {
  await record();
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
    return { accepted: true, model: modelOf(calls), data };
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

const text = (t: LexText): QuadrantText => ({
  text: t.text.trim(),
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

function modelOf(log: readonly Call[]): QuadrantModel {
  const quadrants: (QuadrantLabel | undefined)[] = [undefined, undefined, undefined, undefined];
  let xAxis: { ast: string; start?: QuadrantText; end?: QuadrantText } | undefined;
  let yAxis: typeof xAxis;
  let title: string | undefined;
  let accTitle = '';
  let accDescr = '';
  const points: QuadrantPoint[] = [];
  const seen = new Map<string, number>();
  const classes = new Map<string, { ast: string; styles: QuadrantStyles }>();
  for (const [name, args] of log) {
    const quadrant = /^setQuadrant(\d)Text$/.exec(name);
    if (quadrant) {
      const n = Number(quadrant[1]);
      quadrants[n - 1] = { ast: `q:${n}`, ...text(args[0] as LexText) };
    } else if (name === 'setXAxisLeftText' || name === 'setXAxisRightText') {
      xAxis = {
        ast: 'ax:x',
        ...xAxis,
        [name === 'setXAxisLeftText' ? 'start' : 'end']: text(args[0] as LexText),
      };
    } else if (name === 'setYAxisBottomText' || name === 'setYAxisTopText') {
      yAxis = {
        ast: 'ax:y',
        ...yAxis,
        [name === 'setYAxisBottomText' ? 'start' : 'end']: text(args[0] as LexText),
      };
    } else if (name === 'setDiagramTitle') title = args[0] as string;
    else if (name === 'setAccTitle') accTitle = args[0] as string;
    else if (name === 'setAccDescription') accDescr = args[0] as string;
    else if (name === 'addPoint') {
      const [label, className, x, y, list] = args as [LexText, string, string, string, string[]];
      const t = text(label);
      const count = (seen.get(t.text) ?? 0) + 1;
      seen.set(t.text, count);
      points.push({
        ast: count === 1 ? `pt:${t.text}` : `pt:${t.text}@${count}`,
        label: t,
        ...(className ? { className } : {}),
        x: String(x),
        y: String(y),
        styles: styles(list),
      });
    } else if (name === 'addClass') {
      const [className, list] = args as [string, string[]];
      classes.set(className, { ast: `c:${className}`, styles: styles(list) });
    }
  }
  return {
    ...(title === undefined ? {} : { title, titleAst: 'st:title' }),
    accTitle,
    accDescr,
    quadrants: quadrants as unknown as QuadrantLabels,
    ...(xAxis ? { xAxis } : {}),
    ...(yAxis ? { yAxis } : {}),
    points,
    classes,
    warnings: [],
  };
}

/** The resolved `quadrantChart` options of `source`: its `%%{init}` directives over the defaults. */
export function v13QuadrantConfig(source: string): QuadrantLayoutConfig {
  return { ...quadrantChartConfigDefaults, ...directiveOptions(source) } as QuadrantLayoutConfig;
}
