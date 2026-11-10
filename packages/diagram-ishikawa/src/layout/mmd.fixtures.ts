/**
 * The layout specs' sources (spec #519): every `.mmd` fixture under `e2e/diagrams/ishikawa/`,
 * parsed as the plugin parses it, by its path in that folder without the extension
 * (`nightly-check/layout/side-minimum`), with its front matter's `ishikawa` config; and a
 * measurer with round numbers standing in for v12's `getBBox` sizes.
 *
 * Vite's `import.meta.glob` (Vitest runs it) reads the files, so the package needs no Node
 * types; this file is a spec helper and is not built (`tsconfig.build.json`).
 */
import type { Measurer } from '@mermaid-js/core/text';
import { parsedIshikawa, type ParsedIshikawa } from '../test-context.ts';

type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;

const ROOT = '../../../../e2e/diagrams/ishikawa/';
const SOURCES = (import.meta as ImportMeta & { glob: RawGlob }).glob(
  '../../../../e2e/diagrams/ishikawa/**/*.mmd',
  { query: '?raw', import: 'default', eager: true }
);

/** The paths of every fixture (under `e2e/diagrams/ishikawa/`, without `.mmd`). */
export const FIXTURES: readonly string[] = Object.keys(SOURCES).map((k) =>
  k.slice(ROOT.length, -'.mmd'.length)
);

/** The source of the fixture at `path` (under `e2e/diagrams/ishikawa/`, without `.mmd`). */
export function fixtureSource(path: string): string {
  const source = SOURCES[`${ROOT}${path}.mmd`];
  if (source === undefined) throw new Error(`no fixture e2e/diagrams/ishikawa/${path}.mmd`);
  return source;
}

/** The fixture at `path` (under `e2e/diagrams/ishikawa/`, without `.mmd`), parsed; it must parse. */
export function fixture(path: string): ParsedIshikawa {
  const parsed = parsedIshikawa(fixtureSource(path));
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`${path}: ${errors.map((d) => d.message).join('; ')}`);
  return parsed;
}

/**
 * v12's sizes in round numbers: every character 8 px wide and every line 20 px high (ascent 16,
 * descent 4), at any font, so a worked example can be computed by hand.
 */
export const roundMeasurer: Measurer = {
  id: 'ishikawa-round',
  width: (text) => [...text].length * 8,
  metrics: () => ({ ascent: 16, descent: 4, lineHeight: 20 }),
};
