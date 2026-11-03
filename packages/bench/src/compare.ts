/**
 * The comparison: a few chosen diagrams, measured over many rounds. Every round opens fresh
 * pages (browser) or processes (Node) for all renderers, measures each diagram on all of them
 * alternating (the order rotating with the round and the diagram), then closes them.
 *
 * Fresh sessions matter more than repetitions: one page or process can run a few percent
 * faster than another for its whole life (where the OS placed it, how its JIT warmed up), and
 * repeating inside it measures that bias again each time. Across rounds it averages out, and
 * the spread of the rounds says how much a difference can be trusted.
 */
import type { Fixture } from './fixtures.ts';
import type { Session } from './interleave.ts';
import { rotation } from './interleave.ts';
import type {
  CompareDiagram,
  CompareEnv,
  CompareRenderer,
  RendererId,
  RendererRun,
} from './report.ts';

/** The default comparison set: one scaling series and two feature-heavy diagrams. */
export const COMPARE_DIAGRAMS: CompareDiagram[] = [
  { id: 'pele/flowchart-7', label: 'Small (7 nodes)' },
  { id: 'pele/flowchart-50', label: 'Medium (50 nodes)' },
  { id: 'pele/flowchart-500', label: 'Large (500 nodes)' },
  { id: 'perf/medium3', label: 'Subgraphs and edge labels' },
  {
    id: 'pr-check/12-should-render-a-flowchart-with-long-names-and-class-definitions',
    label: 'Long labels and classes',
  },
];

/** Mermaid 12 is 20-50x slower and dominates the time; it runs in only some rounds. */
export const SOME_ROUNDS: readonly RendererId[] = ['v12-frozen', 'v12-current'];

/** The rounds, spread evenly over `rounds`, in which a "some rounds" renderer runs. */
export function spreadRounds(rounds: number, count: number): Set<number> {
  const n = Math.max(0, Math.min(count, rounds));
  return new Set(Array.from({ length: n }, (_, i) => Math.floor((i * rounds) / n)));
}

export interface CompareOptions {
  renderers: RendererId[];
  diagrams: { diagram: CompareDiagram; fixture: Fixture }[];
  rounds: number;
  /** Rounds that Mermaid 12 runs in. */
  someRounds: number;
  /** Opens one renderer for one round: a session, or a finished run when it did not start. */
  open: (renderer: RendererId) => Promise<Session | RendererRun>;
  log: (line: string) => void;
  env: string;
}

/** Keeps a renderer's version and size from the first round it started (else why it did not). */
function note(
  info: Map<RendererId, CompareRenderer>,
  r: RendererId,
  opened: Session | RendererRun
) {
  const known = info.get(r);
  if ('measure' in opened) {
    if (!known || known.error !== undefined)
      info.set(r, { renderer: r, version: opened.run.version, size: opened.run.size });
  } else if (!known) {
    info.set(r, {
      renderer: r,
      version: opened.version,
      size: null,
      error: opened.error ?? opened.status,
    });
  }
}

export async function compareRounds(o: CompareOptions): Promise<CompareEnv> {
  const some = spreadRounds(o.rounds, o.someRounds);
  const info = new Map<RendererId, CompareRenderer>();
  const warm: CompareEnv['warm'] = {};
  for (const { diagram } of o.diagrams) {
    warm[diagram.id] = Object.fromEntries(
      o.renderers.map((r) => [r, Array<number | null>(o.rounds).fill(null)])
    );
  }
  o.log(
    `Comparing ${o.renderers.join(', ')} in ${o.env} on ${o.diagrams.length} diagrams, ${o.rounds} rounds`
  );
  for (let round = 0; round < o.rounds; round++) {
    const active = o.renderers.filter((r) => !SOME_ROUNDS.includes(r) || some.has(round));
    const sessions: Session[] = [];
    try {
      // Opening rotates too, so no renderer always gets the freshest machine state.
      for (const r of rotation(active, round)) {
        const opened = await o.open(r);
        note(info, r, opened);
        if ('measure' in opened) sessions.push(opened);
      }
      // Measure in the renderers' own order rotated by round and diagram. Rotating the opening
      // order again would cancel out: with two renderers one would always go first.
      const ordered = active.flatMap((r) => sessions.filter((s) => s.renderer === r));
      for (const [d, { diagram, fixture }] of o.diagrams.entries()) {
        for (const s of rotation(ordered, round + d)) {
          const r = await s.measure(fixture);
          warm[diagram.id]![s.renderer]![round] = r.status === 'ok' ? r.warmMs : null;
        }
      }
    } finally {
      await Promise.all(sessions.map((s) => s.close()));
    }
    o.log(
      `  ${o.env} round ${round + 1}/${o.rounds}: ${sessions.map((s) => s.renderer).join(', ')}`
    );
  }
  return {
    rounds: o.rounds,
    renderers: o.renderers.flatMap((r) => (info.has(r) ? [info.get(r)!] : [])),
    warm,
  };
}
