/**
 * The layout specs' sources (spec #522 T3): every `.mmd` fixture under `e2e/diagrams/c4/`, by
 * its path in that folder without the extension (`nightly-check/docs/1-system-context`), parsed
 * as the plugin parses it, with the config its text resolves to.
 *
 * Vite's `import.meta.glob` (Vitest runs it) reads the files, so the package needs no Node
 * types; this file is a spec helper and is not built (`tsconfig.build.json`).
 */
import { parsedC4, type ParsedC4 } from '../test-context.ts';

type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;

const ROOT = '../../../../e2e/diagrams/c4/';
const SOURCES = (import.meta as ImportMeta & { glob: RawGlob }).glob(
  '../../../../e2e/diagrams/c4/**/*.mmd',
  { query: '?raw', import: 'default', eager: true }
);

/** Every fixture's path (under `e2e/diagrams/c4/`, without `.mmd`), sorted. */
export const FIXTURES: readonly string[] = Object.keys(SOURCES)
  .map((k) => k.slice(ROOT.length, -'.mmd'.length))
  .sort();

/** The text of the fixture at `path`. */
export function fixtureSource(path: string): string {
  const source = SOURCES[`${ROOT}${path}.mmd`];
  if (source === undefined) throw new Error(`no fixture e2e/diagrams/c4/${path}.mmd`);
  return source;
}

/** The fixture at `path`, parsed (its diagnostics kept: a fixture may hold a listed error). */
export function fixture(path: string): ParsedC4 {
  return parsedC4(fixtureSource(path));
}
