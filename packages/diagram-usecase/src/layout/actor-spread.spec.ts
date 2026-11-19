// #650 (spec #995 T4): under the default `layered` engine, actors outside a system boundary sit
// beside the use cases they link to, so associations stay about as long as the diagram grows.
// The engine pulls the nodes and bends that lead to a group's held ends toward those ends
// (`pullToHeld` in core's layered.ts).
import { describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { validateLayout, type LayoutGraph } from '@mermaid-js/core/layout';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { parseUsecase } from '../parser/index.ts';
import { usecaseLayoutProblems } from './invariants.ts';
import { layoutUsecase, type UsecaseLayout } from './layout.ts';

type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;
/** Vite's `import.meta.glob` (Vitest runs it) reads the files: the package needs no Node types. */
const FIXTURES = (import.meta as ImportMeta & { glob: RawGlob }).glob(
  '../../../../e2e/diagrams/usecase/nightly-check/650-*.mmd',
  { query: '?raw', import: 'default', eager: true }
);

let theme: Theme | undefined;

async function lay(name: string): Promise<{ out: UsecaseLayout; graph: LayoutGraph }> {
  const text = FIXTURES[`../../../../e2e/diagrams/usecase/nightly-check/${name}.mmd`];
  if (text === undefined) throw new Error(`no fixture ${name}`);
  theme ??= createTheme(await loadTheme('default'));
  const parse = parseUsecase(text);
  expect(parse.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const out = layoutUsecase(parse.model, {
    config: { usecase: {} } as unknown as ResolvedConfig,
    measurer: tableMeasurer,
    theme,
    warn: () => undefined,
  });
  return { out, graph: out.usecase!.graph };
}

/** The mean length of the associations, each measured along its route's points. */
function meanLength(out: UsecaseLayout): number {
  let total = 0;
  for (const { points } of out.edges.values())
    for (let i = 1; i < points.length; i++)
      total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return total / out.edges.size;
}

describe('actors beside their use cases (#650)', () => {
  it.each(['650-actors-spread-5-25', '650-actors-spread-20-100'])(
    'lays %s out validly',
    async (name) => {
      const { out, graph } = await lay(name);
      expect(validateLayout(graph, out)).toEqual([]);
      expect(usecaseLayoutProblems(out)).toEqual([]);
    }
  );

  it('keeps associations about as long with 20 actors and 100 use cases as with 5 and 25', async () => {
    const small = meanLength((await lay('650-actors-spread-5-25')).out);
    const large = meanLength((await lay('650-actors-spread-20-100')).out);
    expect(large / small).toBeLessThanOrEqual(1.5);
  });

  it.each(['650-actors-spread-5-25', '650-actors-spread-20-100'])(
    'puts each actor of %s across from its use cases',
    async (name) => {
      const { out, graph } = await lay(name);
      const across = out.direction === 'LR' || out.direction === 'RL' ? 'y' : 'x';
      const reach = new Map<string, [number, number]>();
      for (const e of graph.edges) {
        const at = out.nodes.get(e.target)![across];
        const [lo, hi] = reach.get(e.source) ?? [Infinity, -Infinity];
        reach.set(e.source, [Math.min(lo, at), Math.max(hi, at)]);
      }
      for (const [actor, [lo, hi]] of reach) {
        const at = out.nodes.get(actor)![across];
        expect(at, actor).toBeGreaterThanOrEqual(lo);
        expect(at, actor).toBeLessThanOrEqual(hi);
      }
    }
  );
});
