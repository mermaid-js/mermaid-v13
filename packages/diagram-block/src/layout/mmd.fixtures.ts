/**
 * The layout specs' sources (spec #521 T3): every `.mmd` fixture under `e2e/diagrams/block/`,
 * parsed as the plugin parses it, by its path in that folder without the extension
 * (`nightly-check/composite-with-a-label`); and a measurer with round numbers.
 *
 * Vite's `import.meta.glob` (Vitest runs it) reads the files, so the package needs no Node
 * types; this file is a spec helper and is not built (`tsconfig.build.json`).
 */
import type { Measurer } from '@mermaid-js/core/text';
import { parsedBlock, type ParsedBlock } from '../test-context.ts';

type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;

const ROOT = '../../../../e2e/diagrams/block/';
const SOURCES = (import.meta as ImportMeta & { glob: RawGlob }).glob(
  '../../../../e2e/diagrams/block/**/*.mmd',
  { query: '?raw', import: 'default', eager: true }
);

/** Every fixture path (under `e2e/diagrams/block/`, without `.mmd`), sorted. */
export const FIXTURES: readonly string[] = Object.keys(SOURCES)
  .map((k) => k.slice(ROOT.length, -'.mmd'.length))
  .sort();

/** The raw text of the fixture at `path` (front matter included), or undefined. */
export const fixtureSource = (path: string): string | undefined => SOURCES[`${ROOT}${path}.mmd`];

/** The fixture at `path`, parsed; it must parse. */
export function fixture(path: string): ParsedBlock {
  const source = SOURCES[`${ROOT}${path}.mmd`];
  if (source === undefined) throw new Error(`no fixture e2e/diagrams/block/${path}.mmd`);
  const parsed = parsedBlock(source);
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`${path}: ${errors.map((d) => d.message).join('; ')}`);
  return parsed;
}

/** Every character 10 px wide at any size, lines 1.25 em high: round numbers. */
export const gridMeasurer: Measurer = {
  id: 'block-grid',
  width: (text) => [...text].length * 10,
  metrics: (font) => ({ ascent: font.size, descent: font.size / 4, lineHeight: font.size * 1.25 }),
};
