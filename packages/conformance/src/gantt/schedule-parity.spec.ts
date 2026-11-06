import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  parseGantt,
  schedule,
  ScheduleError,
  type GanttModel,
  type GanttTask,
  type ScheduleErrorKind,
} from '@mermaid-js/diagram-gantt';
import { ganttGateCorpus } from './corpus.ts';
import { scheduleFuzz } from './fuzz.ts';
import { GANTT_PARITY_NOW, v12Schedule, type V12Schedule, type V12Task } from './v12-schedule.ts';

/**
 * Schedule parity (spec #293 T3, D270, D271): the tasks `schedule()` gives a parser-produced
 * model equal v12's `getTasks()` at the same instant (two: {@link GANTT_PARITY_NOW} and one in
 * many charts' domains), field by field
 * (id, start, end, renderEnd, manualEnd, order, tags; texts and sections are the parser
 * parity's, where v12's entity placeholders are normalised), and a source v12 rejects
 * (at parse or at `getTasks()`) is one v13 rejects the same way: at parse, or at `schedule()`
 * with the same error kind at the same task (D274's position). It runs in
 * both gantt zones (UTC, America/Los_Angeles: root `vitest.config.ts`).
 *
 * Corpus: the lexer gate's (e2e files, harvested v12 spec strings, parser cases and
 * line-separator cases, each also commented and CR-cut) and generated charts.
 * A reference to an id the text never declares compares with the today fallback, not with
 * v12's stale `taskDb` (`v12-schedule.ts` flushes it).
 *
 * Listed: `topAxis` (D273), which v12's grammar rejects and v13 draws.
 */
/** What is compared of a task. */
type Times = Omit<V12Task, 'text' | 'section'>;
/** Why a side rejected a source: the parse, or the schedule error's kind at a task (D274). */
interface Failure {
  readonly kind: 'parse' | ScheduleErrorKind;
  readonly index?: number;
  readonly error: string;
}
type V13Schedule =
  | { ok: true; tasks: Times[]; model: GanttModel }
  | ({ ok: false; model?: GanttModel } & Failure);

const times = ({ text: _text, section: _section, ...rest }: V12Task): Times => rest;

const TAGS = ['active', 'done', 'crit', 'milestone', 'vert'] as const;
/** A second instant: inside many corpus charts' domains (today lines, today fallbacks). */
const NOWS = [GANTT_PARITY_NOW, new Date(2019, 1, 3, 8, 15).getTime()];

function v13Schedule(source: string, now: number): V13Schedule {
  const pre = preprocess(source);
  const { model, diagnostics } = parseGantt(source, { preprocessed: pre });
  const error = [...pre.diagnostics, ...diagnostics].find((d) => d.severity === 'error');
  if (error) return { ok: false, kind: 'parse', error: `${error.code}: ${error.message}` };
  let plan;
  try {
    plan = schedule(model, { now });
  } catch (e) {
    if (!(e instanceof ScheduleError)) throw e;
    return { ok: false, kind: e.kind, index: e.index, error: e.message, model };
  }
  const tasks = plan.tasks.map((s): Times => {
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

/**
 * The kind of v12's rejection, from its message, and the task it threw at: v12 compiles tasks in
 * order and throws at the first that fails, so it is the first task of the model that fails that
 * way (an `Invalid date:` names the start it read). The exclude guard names no task.
 */
function v12Failure(error: string, model: GanttModel | undefined): Omit<Failure, 'error'> {
  const tasks = model?.tasks ?? [];
  const first = (test: (t: GanttTask) => boolean): number | undefined => {
    const i = tasks.findIndex(test);
    return i < 0 ? undefined : i;
  };
  const invalid = /^Invalid date:(.*)$/s.exec(error);
  if (invalid) {
    const index = first((t) => t.start?.trim() === invalid[1]);
    return { kind: 'invalidDate', ...(index !== undefined ? { index } : {}) };
  }
  if (error.includes("reading 'type'")) {
    const index = first((t) => t.fields.length > 3);
    return { kind: 'tooManyFields', ...(index !== undefined ? { index } : {}) };
  }
  if (error.includes("reading 'endTime'")) {
    const index = first(
      (t) => t.start === undefined && (t.prevId === undefined || t.prevId === '__proto__')
    );
    return { kind: 'noStart', ...(index !== undefined ? { index } : {}) };
  }
  if (error.startsWith('Failed to find a valid date')) return { kind: 'excluded' };
  return { kind: 'parse' };
}

/** Why a disagreement is expected, or undefined. */
function listed(v12: V12Schedule, v13: V13Schedule): string | undefined {
  // v12's grammar threw on `topAxis` before scheduling; v13 schedules (and may reject) it.
  if (!v12.ok && v12.error.includes('TopAxis') && v13.model?.topAxis) return 'topAxis (D273)';
  return undefined;
}

describe('schedule parity with v12 getTasks()', () => {
  it('schedules every source as v12 did, at two instants, in this zone', async () => {
    const items = [...(await ganttGateCorpus()), ...scheduleFuzz(1500)];
    const diffs: string[] = [];
    let compared = 0;
    let scheduled = 0;
    let failedAtTask = 0;
    for (const now of NOWS)
      for (const item of items) {
        const v12 = await v12Schedule(item.source, now);
        if (!v12.ok && v12.error.startsWith('not gantt')) continue;
        const v13 = v13Schedule(item.source, now);
        if (listed(v12, v13)) continue;
        compared++;
        const at = `${item.id} @${new Date(now).toISOString()}`;
        if (v12.ok !== v13.ok) {
          diffs.push(`${at}: v12 ${v12.ok ? 'ok' : v12.error}, v13 ${v13.ok ? 'ok' : v13.error}`);
          continue;
        }
        if (!v12.ok && !v13.ok) {
          const want = v12Failure(v12.error, v13.model);
          const got = { kind: v13.kind, ...(want.index !== undefined ? { index: v13.index } : {}) };
          if (want.index !== undefined) failedAtTask++;
          if (JSON.stringify(want) !== JSON.stringify(got))
            diffs.push(
              `${at}: v12 ${JSON.stringify(want)} (${v12.error}), v13 ${JSON.stringify(got)}`
            );
          continue;
        }
        if (!v12.ok || !v13.ok) continue;
        scheduled++;
        const want = JSON.stringify(v12.tasks.map(times));
        const got = JSON.stringify(v13.tasks);
        if (want !== got) diffs.push(`${at}:\n  v12 ${want}\n  v13 ${got}`);
      }
    process.stdout.write(
      `schedule parity: ${items.length} sources x ${NOWS.length} instants, ${compared} compared, ` +
        `${scheduled} scheduled, ${failedAtTask} rejected at the same task\n`
    );
    expect(diffs.slice(0, 20)).toEqual([]);
    // Most sources schedule; the rest are rejected the same way.
    expect(scheduled).toBeGreaterThan(compared / 2);
    expect(failedAtTask).toBeGreaterThan(100);
  }, 600_000);
});
