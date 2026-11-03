/**
 * Alternating runs: every renderer is open at once and each fixture is measured on all of them
 * before the next one. A slow patch of the machine (a shared CI runner, another job, thermal
 * throttling) then lands on every renderer instead of on whichever ran at that moment, which is
 * what made renderer-against-renderer numbers swing by 20% between identical runs.
 *
 * The order rotates with each fixture, so no renderer is always first (cold caches, a fresh
 * time slice) or always last.
 */
import type { Fixture } from './fixtures.ts';
import type { DiagramResult, RendererId, RendererRun } from './report.ts';

/** A renderer that is open and ready to measure fixtures. */
export interface Session {
  renderer: RendererId;
  /** The run being filled; `measure` results are appended to it in fixture order. */
  run: RendererRun;
  measure(f: Fixture): Promise<DiagramResult>;
  close(): Promise<void>;
}

/** Renderer order for fixture `index`: the list rotated by `index`. */
export function rotation<T>(items: readonly T[], index: number): T[] {
  if (items.length === 0) return [];
  const k = index % items.length;
  return [...items.slice(k), ...items.slice(0, k)];
}

const brief = (r: DiagramResult) =>
  r.status === 'ok' && r.warmMs !== null ? `${r.warmMs.toFixed(3)} ms` : r.status;

/**
 * Measures every fixture on every session, alternating, and closes the sessions. Returns the
 * runs in the order the sessions were given.
 */
export async function interleave(
  sessions: Session[],
  fixtures: Fixture[],
  log: (line: string) => void,
  env: string
): Promise<RendererRun[]> {
  try {
    for (const [i, f] of fixtures.entries()) {
      const parts: string[] = [];
      for (const s of rotation(sessions, i)) {
        const r = await s.measure(f);
        s.run.results.push(r);
        parts.push(`${s.renderer} ${brief(r)}`);
      }
      log(`  ${env} ${i + 1}/${fixtures.length} ${f.id}: ${parts.join(', ')}`);
    }
  } finally {
    await Promise.all(sessions.map((s) => s.close()));
  }
  return sessions.map((s) => s.run);
}

/**
 * Opens every renderer (each `open` returns a session, or a finished run when the renderer
 * could not start), runs the open ones alternating, and returns all runs in renderer order.
 */
export async function runAll(
  renderers: RendererId[],
  open: (renderer: RendererId) => Promise<Session | RendererRun>,
  fixtures: Fixture[],
  log: (line: string) => void,
  env: string
): Promise<RendererRun[]> {
  const opened: (Session | RendererRun)[] = [];
  for (const r of renderers) opened.push(await open(r));
  const sessions = opened.filter((x): x is Session => 'measure' in x);
  if (sessions.length > 0)
    log(
      `Running ${sessions.map((s) => s.renderer).join(', ')} in ${env}, alternating, over ${fixtures.length} fixtures`
    );
  await interleave(sessions, fixtures, log, env);
  return opened.map((x) => ('measure' in x ? x.run : x));
}
