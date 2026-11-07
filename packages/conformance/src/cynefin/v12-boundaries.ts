import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

/** v12's own boundary generator, as `mermaid@12.2.0` ships it (`cynefinBoundaries.ts`). */
export interface V12Boundaries {
  seededRandom(seed: number): number;
  hashString(str: string): number;
  resolveSeed(seed: number | undefined, id: string): number;
  generateFoldPath(width: number, height: number, seed: number, amplitude?: number): string;
  generateHorizontalBoundary(
    width: number,
    height: number,
    seed: number,
    amplitude?: number
  ): string;
  generateCliffPath(width: number, height: number): string;
  generateConfusionPath(cx: number, cy: number, rx: number, ry: number): string;
}

const START = '// src/diagrams/cynefin/cynefinBoundaries.ts';
const END = '// src/diagrams/cynefin/cynefinRenderer.ts';

/**
 * Loads the generator from v12's cynefin chunk. The chunk exports only the diagram, so the
 * module's `cynefinBoundaries.ts` section (plain functions, no imports) is cut out and run as
 * it is: the oracle is the shipped code, not a copy of it.
 */
export function loadV12Boundaries(): V12Boundaries {
  const require = createRequire(import.meta.url);
  const pkgDir = realpathSync(dirname(require.resolve('mermaid-v12/package.json')));
  const dir = join(pkgDir, 'dist/chunks/mermaid.esm');
  const chunk = readdirSync(dir).find((f) => /^cynefinDiagram-\w+\.mjs$/.test(f));
  if (chunk === undefined) throw new Error(`no cynefin chunk in ${dir}`);
  const source = readFileSync(join(dir, chunk), 'utf8');
  const from = source.indexOf(START);
  const to = source.indexOf(END);
  if (from < 0 || to < from) throw new Error(`no cynefinBoundaries section in ${chunk}`);
  const names = [
    'seededRandom',
    'hashString',
    'resolveSeed',
    'generateFoldPath',
    'generateHorizontalBoundary',
    'generateCliffPath',
    'generateConfusionPath',
  ];
  const body = `(() => {\n${source.slice(from, to)}\nreturn { ${names.join(', ')} };\n})()`;
  // v12's bundle wraps each function in `__name(f, "f")` for stack traces; it is a no-op here.
  return runInNewContext(body, { __name: (f: unknown) => f }) as V12Boundaries;
}
