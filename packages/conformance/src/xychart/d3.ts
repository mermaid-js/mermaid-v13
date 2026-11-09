/**
 * d3 7.9.0, the instance mermaid\@12 imports (pnpm puts v12's dependencies next to it): the oracle
 * for the XY chart's re-implemented `ticks`, `scaleLinear`, `scaleBand` and `line` (spec #426).
 */
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface D3 {
  version: string;
  ticks(start: number, stop: number, count: number): number[];
  scaleLinear(): {
    domain(d: number[]): ReturnType<D3['scaleLinear']>;
    range(r: number[]): ReturnType<D3['scaleLinear']>;
    ticks(count?: number): number[];
    (x: number): number;
  };
  scaleBand(): {
    domain(d: string[]): ReturnType<D3['scaleBand']>;
    range(r: number[]): ReturnType<D3['scaleBand']>;
    paddingInner(p: number): ReturnType<D3['scaleBand']>;
    paddingOuter(p: number): ReturnType<D3['scaleBand']>;
    align(a: number): ReturnType<D3['scaleBand']>;
    (x: string): number | undefined;
  };
  line(): ((data: [number, number][]) => string | null) & {
    defined(f: (d: [number, number]) => boolean): ReturnType<D3['line']>;
  };
}

let loading: Promise<D3> | undefined;

/** Load (once) v12's d3. */
export function loadD3(): Promise<D3> {
  loading ??= (async () => {
    const require = createRequire(import.meta.url);
    const pkgDir = realpathSync(dirname(require.resolve('mermaid-v12/package.json')));
    const dir = realpathSync(join(dirname(pkgDir), 'd3'));
    const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      version: string;
    };
    const d3 = (await import(pathToFileURL(join(dir, 'src/index.js')).href)) as Omit<D3, 'version'>;
    return { ...d3, version };
  })();
  return loading;
}
