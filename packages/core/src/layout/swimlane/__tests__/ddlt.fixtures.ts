/**
 * The swimlane DDLT fixtures (D538): for each `dev-diagrams/layout-tests/swimlanes` diagram, the
 * `LayoutGraph` flowchart hands the engine (v13's measurer) and the render's `swimlane` tuning,
 * captured into `ddlt/` by `pnpm --filter @mermaid-js/conformance capture:swimlane` (conformance's
 * `swimlane-capture.spec.ts` keeps them in sync). Keyed by path under that folder without the
 * extension (`regressions/title-band-rails`).
 *
 * Vite's `import.meta.glob` (Vitest runs it) reads the files, so core needs no Node types; this
 * file is a spec helper and is not built (`tsconfig.build.json`).
 */
import type { LayoutGraph } from '../../types.ts';
import type { SwimlaneTuning } from '../layoutData.ts';

interface DdltFixture {
  graph: LayoutGraph;
  tuning: SwimlaneTuning;
}

type JsonGlob = (
  pattern: string,
  options: { import: 'default'; eager: true }
) => Readonly<Record<string, DdltFixture>>;

const FILES = (import.meta as ImportMeta & { glob: JsonGlob }).glob('./ddlt/**/*.json', {
  import: 'default',
  eager: true,
});

/** Every fixture, by its path under the fixture folder without `.json`, sorted. */
export const DDLT_FIXTURES: Readonly<Record<string, DdltFixture>> = Object.fromEntries(
  Object.entries(FILES)
    .map(([path, f]): [string, DdltFixture] => [path.slice('./ddlt/'.length, -'.json'.length), f])
    .sort(([a], [b]) => a.localeCompare(b))
);

/** A fresh copy of a fixture's graph, so a spec may change it. */
export function fixtureGraph(id: string): LayoutGraph {
  const f = DDLT_FIXTURES[id];
  if (!f) throw new Error(`no swimlane DDLT fixture '${id}'`);
  return JSON.parse(JSON.stringify(f.graph)) as LayoutGraph;
}
