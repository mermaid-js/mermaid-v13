import { describe, expect, it } from 'vitest';
import { schedule, type GanttModel } from '@mermaid-js/diagram-gantt';
import { ganttGateCorpus } from './corpus.ts';
import { scheduleFuzz } from './fuzz.ts';
import { GANTT_PARITY_NOW, v12Schedule, type V12Schedule, type V12Task } from './v12-schedule.ts';
import { parseGanttForParity } from './v13.ts';

/**
 * Schedule parity (spec #293 T3, D270, D271): the tasks `schedule()` gives a parser-produced
 * model equal v12's `getTasks()` at the same instant ({@link GANTT_PARITY_NOW}), field by field
 * (id, start, end, renderEnd, manualEnd, order, tags; texts and sections are the parser
 * parity's, where v12's entity placeholders are normalised), and a source v12 rejects
 * (at parse or at `getTasks()`) is one v13 rejects (at parse or at `schedule()`). It runs in
 * both gantt zones (UTC, America/Los_Angeles: root `vitest.config.ts`).
 *
 * Corpus: the lexer gate's (e2e files, harvested v12 spec strings, `ganttDb.spec.ts` as text,
 * click, edge and line-separator cases, each also commented and CR-cut) and generated charts.
 * A reference to an id the text never declares compares with the today fallback, not with
 * v12's stale `taskDb` (`v12-schedule.ts` flushes it).
 *
 * Listed: `topAxis` (D273), which v12's grammar rejects and v13 draws.
 */
/** What is compared of a task. */
type Times = Omit<V12Task, 'text' | 'section'>;
type V13Schedule = { ok: true; tasks: Times[] } | { ok: false; error: string };

const times = ({ text: _text, section: _section, ...rest }: V12Task): Times => rest;

const TAGS = ['active', 'done', 'crit', 'milestone', 'vert'] as const;

function v13Schedule(source: string): V13Schedule & { model?: GanttModel } {
  let model: GanttModel;
  try {
    model = parseGanttForParity(source);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const tasks = schedule(model, { now: GANTT_PARITY_NOW }).tasks.map((s): Times => {
    const t = model.tasks[s.index]!;
    return {
      id: t.id,
      ...(s.start !== undefined ? { start: s.start } : {}),
      ...(s.end !== undefined ? { end: s.end } : {}),
      ...(s.renderEnd !== undefined ? { renderEnd: s.renderEnd } : {}),
      manualEnd: s.manualEnd,
      order: s.order,
      tags: TAGS.filter((tag) => t.tags.includes(tag)),
    };
  });
  return { ok: true, tasks, model };
}

/** Why a disagreement is expected, or undefined. */
function listed(v12: V12Schedule, v13: ReturnType<typeof v13Schedule>): string | undefined {
  if (!v12.ok && v13.ok && v13.model?.topAxis) return 'topAxis (D273)';
  return undefined;
}

describe('schedule parity with v12 getTasks()', () => {
  it('schedules every source as v12 did, in this zone', async () => {
    const items = [...(await ganttGateCorpus()), ...scheduleFuzz(1500)];
    const diffs: string[] = [];
    let compared = 0;
    let scheduled = 0;
    for (const item of items) {
      const v12 = await v12Schedule(item.source);
      if (!v12.ok && v12.error.startsWith('not gantt')) continue;
      const v13 = v13Schedule(item.source);
      if (listed(v12, v13)) continue;
      compared++;
      if (v12.ok !== v13.ok) {
        diffs.push(
          `${item.id}: v12 ${v12.ok ? 'ok' : v12.error}, v13 ${v13.ok ? 'ok' : v13.error}`
        );
        continue;
      }
      if (!v12.ok || !v13.ok) continue;
      scheduled++;
      const want = JSON.stringify(v12.tasks.map(times));
      const got = JSON.stringify(v13.tasks);
      if (want !== got) diffs.push(`${item.id}:\n  v12 ${want}\n  v13 ${got}`);
    }
    process.stdout.write(
      `schedule parity: ${items.length} sources, ${compared} compared, ${scheduled} scheduled\n`
    );
    expect(diffs).toEqual([]);
    // Most sources schedule; the rest are rejected the same way.
    expect(scheduled).toBeGreaterThan(compared / 2);
  }, 300_000);
});
