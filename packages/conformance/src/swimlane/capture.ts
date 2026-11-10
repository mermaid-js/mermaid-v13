// The swimlane engine's DDLT fixtures (D538): the `LayoutGraph` flowchart hands its layout engine
// for each `dev-diagrams/layout-tests/swimlanes` diagram, measured by v13's measurer, with the
// render's `swimlane` tuning. Core's specs read them as JSON (core cannot import flowchart).
//
// Flowchart detects `swimlane-beta` only from T1 (#597) on, so each source's header is written as
// `flowchart` (same direction, same body) and the frontmatter's `layout` is dropped; the graph is
// taken from a capturing engine registered under its own name, through the public render path.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { layered, type LayoutEngine, type LayoutGraph } from '@mermaid-js/core/layout';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../corpus.ts';

const FIXTURE_DIR = join(REPO_ROOT, 'dev-diagrams/layout-tests/swimlanes');
export const OUT_DIR = join(REPO_ROOT, 'packages/core/src/layout/swimlane/__tests__/ddlt');

/** The `swimlane` config keys the engine reads (`SwimlaneTuning`). */
const TUNING = ['ignoreCrossLaneEdges', 'optimizeRanksByCrossings', 'automaticLaneOrdering'];

export interface SwimlaneFixture {
  /** Path under the fixture folder without `.mmd`, e.g. `regressions/title-band-rails`. */
  id: string;
  graph: LayoutGraph;
  tuning: Record<string, boolean>;
}

async function mmdFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await mmdFiles(p)));
    else if (ent.name.endsWith('.mmd')) out.push(p);
  }
  return out.sort();
}

/** The source as flowchart reads it before T1: `flowchart` for `swimlane-beta`, no `layout`. */
function asFlowchart(source: string): string {
  return source
    .replace(/^(\s*)swimlane-beta\b/m, '$1flowchart')
    .replace(/^(---\n[\s\S]*?)^\s*layout:.*\n([\s\S]*?^---)/m, '$1$2');
}

/** Every swimlane fixture's graph and tuning, sorted by id. */
export async function captureSwimlaneFixtures(): Promise<SwimlaneFixture[]> {
  const captures: Omit<SwimlaneFixture, 'id'>[] = [];
  const capture: LayoutEngine = (graph, ctx) => {
    const section = (ctx?.config as Record<string, unknown> | undefined)?.swimlane as
      | Record<string, unknown>
      | undefined;
    const tuning: Record<string, boolean> = {};
    for (const key of TUNING) if (typeof section?.[key] === 'boolean') tuning[key] = section[key];
    captures.push({ graph: structuredClone(graph), tuning });
    return layered(graph);
  };
  const m = createMermaid();
  m.initialize({ deterministic: true, layout: 'swimlane-capture' });
  m.registerLayoutLoaders([{ name: 'swimlane-capture', loader: () => Promise.resolve(capture) }]);
  const out: SwimlaneFixture[] = [];
  for (const file of await mmdFiles(FIXTURE_DIR)) {
    const id = relative(FIXTURE_DIR, file)
      .split(sep)
      .join('/')
      .replace(/\.mmd$/, '');
    captures.length = 0;
    const result = await m.render(
      `swimlane-${out.length}`,
      asFlowchart(await readFile(file, 'utf8'))
    );
    const captured = captures.pop();
    if (!captured) throw new Error(`${id}: no graph reached the layout (${result.diagramType})`);
    out.push({ id, ...captured });
  }
  return out;
}

/** A fixture as stored: stable key order, two-space indent, trailing newline. */
export function serialiseFixture(f: SwimlaneFixture): string {
  return JSON.stringify({ tuning: f.tuning, graph: f.graph }, null, 2) + '\n';
}
