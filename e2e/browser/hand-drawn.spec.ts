/**
 * Hand-drawn H1: the sketch adapter gives the same bytes in Chromium as in Node (R-ARCH-6).
 * The browser runs a bundle of the adapter's sources (esbuild, the `mermaid-source` condition;
 * roughjs is its ES module bundle, as for any bundler); Node runs the same sources unbundled
 * through tsx, resolving roughjs the way Node does. Both sketch the same cases: every outline
 * tag, filled and not, in each role's option set, over several seeds (0 included).
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

type Case = [tag: string, attrs: Record<string, unknown>, options: object, seed: number];

const NODE = { roughness: 0.7, fillStyle: 'hachure', fillWeight: 1.5, hachureGap: 1.5 };
const OPTIONS = [
  NODE,
  { ...NODE, fillWeight: 3 },
  { ...NODE, fillStyle: 'solid' },
  { ...NODE, hachureAngle: 120 },
  { ...NODE, roughness: 0.3 },
];
const OUTLINES: [string, Record<string, unknown>][] = [
  ['rect', { x: 3.25, y: -7, width: 143.5, height: 54 }],
  ['rect', { x: 0, y: 0, width: 220, height: 80, rx: 6, ry: 6 }],
  ['circle', { cx: 12, cy: 12, r: 17.3 }],
  ['ellipse', { cx: 0, cy: 0, rx: 90, ry: 31 }],
  ['polygon', { points: [0, 30, 45, 0, 90, 30, 45, 60] }],
  ['line', { x1: 0, y1: 0, x2: 610, y2: 0 }],
  ['path', { d: 'M0,0L120,0C160,0 160,80 120,80L0,80Z' }],
  ['path', { d: 'M10,10C40,90 200,-40 300,120' }],
];
const CASES: Case[] = OUTLINES.flatMap(([tag, geometry]) =>
  OPTIONS.flatMap((options) =>
    [0, 1, 7, 2147483647].flatMap((seed) =>
      ['#ffeeaa', 'none'].map(
        (fill): Case => [tag, { ...geometry, fill, stroke: '#333' }, options, seed]
      )
    )
  )
);

const ROOT = join(import.meta.dirname, '..', '..');
const PLUGIN = JSON.stringify(join(ROOT, 'packages', 'plugin-hand-drawn', 'src', 'index.ts'));
/** Sketches `cases` and returns each result as JSON text. */
const RUN = `(cases) => cases.map((c) => JSON.stringify(sketch(...c)))`;

test('the sketch adapter writes the same bytes in Chromium and in Node', async ({ page }) => {
  const node = JSON.parse(
    execFileSync(
      'pnpm',
      [
        'exec',
        'tsx',
        '--conditions=mermaid-source',
        '--eval',
        `import { sketch } from ${PLUGIN};
         process.stdout.write(JSON.stringify((${RUN})(${JSON.stringify(CASES)})));`,
      ],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
  ) as string[];

  const bundle = await build({
    stdin: {
      contents: `import { sketch } from ${PLUGIN};\nglobalThis.sketchCases = ${RUN};`,
      resolveDir: ROOT,
      sourcefile: 'hand-drawn-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    conditions: ['mermaid-source'],
    logLevel: 'silent',
  });
  await page.goto('about:blank');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const browser = await page.evaluate(
    (cases) => (globalThis as unknown as { sketchCases(c: Case[]): string[] }).sketchCases(cases),
    CASES
  );

  expect(node).toHaveLength(CASES.length);
  expect(node.every((s) => s.startsWith('[{"set":'))).toBe(true);
  expect(browser).toEqual(node);
});
