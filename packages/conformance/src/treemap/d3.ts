/**
 * The d3 side of treemap's layout oracle (#485): d3-hierarchy and d3-format as `mermaid@12.2.0`
 * resolves them (3.1.2 each, through its `d3@7.9.0`), and v12's two uses of them, copied from
 * `renderer.ts` at the harvest commit: the value formatter (`:50-77`) and the treemap layout
 * (`:144-161`). The treemap package re-implements both with no dependency (R-PERF-2); the specs
 * compare its output with what these give.
 */
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/** The part of a d3-hierarchy node the oracle reads. */
export interface D3Node<T> {
  readonly data: T;
  readonly depth: number;
  readonly value?: number;
  readonly children?: D3Node<T>[];
  readonly parent: D3Node<T> | null;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  sum(value: (d: T) => number): D3Node<T>;
  sort(compare: (a: D3Node<T>, b: D3Node<T>) => number): D3Node<T>;
  descendants(): D3Node<T>[];
  leaves(): D3Node<T>[];
}

type Padding<T> = number | ((d: D3Node<T>) => number);

interface D3Treemap<T> {
  (root: D3Node<T>): D3Node<T>;
  size(size: [number, number]): D3Treemap<T>;
  paddingTop(p: Padding<T>): D3Treemap<T>;
  paddingInner(p: Padding<T>): D3Treemap<T>;
  paddingLeft(p: Padding<T>): D3Treemap<T>;
  paddingRight(p: Padding<T>): D3Treemap<T>;
  paddingBottom(p: Padding<T>): D3Treemap<T>;
  round(round: boolean): D3Treemap<T>;
}

export interface D3 {
  hierarchy<T>(data: T): D3Node<T>;
  treemap<T>(): D3Treemap<T>;
  /** d3-format's default-locale `format`: throws on a specifier it rejects. */
  format(specifier: string): (value: number) => string;
  versions: { hierarchy: string; format: string };
}

let loading: Promise<D3> | undefined;

/** Loads (once) d3-hierarchy and d3-format from mermaid\@12's own `d3`. */
export function loadD3(): Promise<D3> {
  loading ??= load();
  return loading;
}

async function load(): Promise<D3> {
  const here = createRequire(import.meta.url);
  const mermaid = createRequire(realpathSync(here.resolve('mermaid-v12/package.json')));
  const d3 = createRequire(realpathSync(mermaid.resolve('d3')));
  const entry = async (name: string): Promise<[Record<string, unknown>, string]> => {
    const main = realpathSync(d3.resolve(name));
    const version = /@(\d+\.\d+\.\d+)\//.exec(main)?.[1] ?? 'unknown';
    return [(await import(pathToFileURL(main).href)) as Record<string, unknown>, version];
  };
  const [hierarchy, hierarchyVersion] = await entry('d3-hierarchy');
  const [format, formatVersion] = await entry('d3-format');
  return {
    hierarchy: hierarchy.hierarchy as D3['hierarchy'],
    treemap: hierarchy.treemap as D3['treemap'],
    format: format.format as D3['format'],
    versions: { hierarchy: hierarchyVersion, format: formatVersion },
  };
}

/**
 * v12's value formatter (`renderer.ts:50-77`), over the real d3-format. A specifier d3 rejects
 * throws at creation and falls back to `,`; a `$` with a rejected rest throws when a value is
 * formatted (v12's render then failed), as here.
 */
export function v12ValueFormat(d3: D3, valueFormat: unknown): (value: number) => string {
  const format = (specifier: string) => d3.format(specifier);
  try {
    const formatStr = (valueFormat as string) || ',';
    if (formatStr === '$0,0') return (value) => '$' + format(',')(value);
    if (formatStr.startsWith('$') && formatStr.includes(',')) {
      const precision = /\.\d+/.exec(formatStr);
      const precisionStr = precision ? precision[0] : '';
      return (value) => '$' + format(',' + precisionStr)(value);
    }
    if (formatStr.startsWith('$')) {
      const restOfFormat = formatStr.substring(1);
      return (value) => '$' + format(restOfFormat || '')(value);
    }
    return format(formatStr);
  } catch {
    return format(',');
  }
}

/** v12's data node (`getRoot()` and `buildHierarchy`): sections hold children, leaves a value. */
export interface V12Data {
  readonly name: string;
  readonly value?: number;
  readonly children?: readonly V12Data[];
}

/** The layout options v12's draw read. */
export interface V12LayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
}

/** v12's treemap layout (`renderer.ts:144-161`) of `root` (the nameless synthetic root). */
export function v12Treemap<T extends V12Data>(
  d3: D3,
  root: T,
  options: V12LayoutOptions
): D3Node<T> {
  const SECTION_INNER_PADDING = 10;
  const SECTION_HEADER_HEIGHT = 25;
  const branch = (d: D3Node<T>) => d.children !== undefined && d.children.length > 0;
  const hierarchyRoot = d3
    .hierarchy<T>(root)
    .sum((d) => d.value ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const layout = d3
    .treemap<T>()
    .size([options.width, options.height])
    .paddingTop((d) => (branch(d) ? SECTION_HEADER_HEIGHT + SECTION_INNER_PADDING : 0))
    .paddingInner(options.padding)
    .paddingLeft((d) => (branch(d) ? SECTION_INNER_PADDING : 0))
    .paddingRight((d) => (branch(d) ? SECTION_INNER_PADDING : 0))
    .paddingBottom((d) => (branch(d) ? SECTION_INNER_PADDING : 0))
    .round(true);
  return layout(hierarchyRoot);
}
