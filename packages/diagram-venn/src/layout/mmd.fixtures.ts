/**
 * The layout specs' sources (spec #429 T3): every `.mmd` fixture under `e2e/diagrams/venn/`,
 * parsed as the plugin parses it, by its path in that folder without the extension
 * (`nightly-check/layout/text-grid`), with its front matter's `venn` config; and a measurer
 * with round numbers.
 *
 * Vite's `import.meta.glob` (Vitest runs it) reads the files, so the package needs no Node
 * types; this file is a spec helper and is not built (`tsconfig.build.json`).
 */
import type { Measurer } from '@mermaid-js/core/text';
import { parsedVenn, type ParsedVenn } from '../test-context.ts';

type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;

const ROOT = '../../../../e2e/diagrams/venn/';
const SOURCES = (import.meta as ImportMeta & { glob: RawGlob }).glob(
  '../../../../e2e/diagrams/venn/**/*.mmd',
  { query: '?raw', import: 'default', eager: true }
);

/** The fixture at `path` (under `e2e/diagrams/venn/`, without `.mmd`), parsed; it must parse. */
export function fixture(path: string): ParsedVenn {
  const source = SOURCES[`${ROOT}${path}.mmd`];
  if (source === undefined) throw new Error(`no fixture e2e/diagrams/venn/${path}.mmd`);
  const parsed = parsedVenn(source);
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`${path}: ${errors.map((d) => d.message).join('; ')}`);
  return parsed;
}

/** Every character 10 px wide at any size, lines 1.2 em high: round numbers for wrapping. */
export const gridMeasurer: Measurer = {
  id: 'venn-grid',
  width: (text) => [...text].length * 10,
  metrics: (font) => ({ ascent: font.size, descent: font.size / 5, lineHeight: font.size * 1.2 }),
};
