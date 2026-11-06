/**
 * v12's schedule, for the schedule parity (spec #293 T3): the v12 oracle parses the source, and
 * its gantt wrapper (`oracle-env.ts`) runs `db.getTasks()` with the clock at `now` (dayjs and
 * v12's today fallback read it); a throw there rejects the source, as v12's render did.
 *
 * v12's `taskDb` is module state that `clear()` never resets, so an id the text never declares
 * can resolve to a task of an earlier diagram. The spec compares such a reference with the
 * today fallback, so before each source a flush diagram points every id it references (after,
 * until, click, and `undefined`) past the end of any task list the source can make.
 *
 * Calls must be sequential (the oracle is one shared v12 instance).
 */
import { loadOracle } from '../oracle.ts';
import { atOracleNow, GANTT_PARITY_NOW, ganttOracleTasks } from './oracle-env.ts';

export { GANTT_PARITY_NOW };

export interface V12Task {
  readonly id: string;
  readonly text: string;
  readonly section: string;
  readonly start?: number;
  readonly end?: number;
  readonly renderEnd?: number;
  readonly manualEnd: boolean;
  /** -1 for `vert`. */
  readonly order: number;
  readonly tags: readonly string[];
}

export type V12Schedule =
  | { readonly ok: true; readonly tasks: readonly V12Task[] }
  | { readonly ok: false; readonly error: string };

interface V12RawTask {
  id?: string;
  task: string;
  section: string;
  startTime?: Date;
  endTime?: Date;
  renderEndTime: Date | null;
  manualEndTime: boolean;
  order: number;
  active?: boolean;
  done?: boolean;
  crit?: boolean;
  milestone?: boolean;
  vert?: boolean;
}

const TAGS = ['active', 'done', 'crit', 'milestone', 'vert'] as const;
const RE_REFS = /(?:after|until)\s+([\d\w- ]+)/g;
const RE_CLICK = /click\s+(\S+)/g;
const RE_ID = /^[\w-]+$/;

/** The flush diagram for `source`: its referenced ids, each after more tasks than it has. */
export function flushSource(source: string): string {
  // A task with more than three fields stores the id `undefined`, which a first task with one
  // field then finds as its previous task (`taskDb[undefined]`).
  const ids = new Set<string>(['undefined']);
  for (const m of source.matchAll(RE_REFS)) for (const id of m[1]!.split(' ')) ids.add(id);
  for (const m of source.matchAll(RE_CLICK)) for (const id of m[1]!.split(',')) ids.add(id);
  const refs = [...ids].filter((id) => RE_ID.test(id) && id !== '__proto__');
  const pad = (source.match(/:/g)?.length ?? 0) + 1;
  return [
    'gantt',
    'dateFormat YYYY-MM-DD',
    ...Array.from({ length: pad }, () => 'f :2020-01-01,1d'),
    ...refs.map((id) => `f :${id},2020-01-01,1d`),
  ].join('\n');
}

const time = (d: Date | null | undefined): number | undefined =>
  d instanceof Date ? d.getTime() : undefined;

function taskOf(t: V12RawTask): V12Task {
  const start = time(t.startTime);
  const end = time(t.endTime);
  const renderEnd = time(t.renderEndTime);
  return {
    id: t.id ?? '',
    text: t.task,
    section: t.section,
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
    ...(renderEnd !== undefined ? { renderEnd } : {}),
    manualEnd: t.manualEndTime,
    order: t.order,
    tags: TAGS.filter((tag) => t[tag] === true),
  };
}

/** v12's scheduled tasks for `source` at `now` (default `GANTT_PARITY_NOW`), or why v12 rejected it. */
export function v12Schedule(source: string, now = GANTT_PARITY_NOW): Promise<V12Schedule> {
  return atOracleNow(now, async (): Promise<V12Schedule> => {
    const oracle = await loadOracle();
    await oracle.parse(flushSource(source));
    const parsed = await oracle.parse(source);
    if (!parsed.accepted) return { ok: false, error: parsed.error };
    if (parsed.diagramType !== 'gantt')
      return { ok: false, error: `not gantt: ${parsed.diagramType}` };
    return { ok: true, tasks: (ganttOracleTasks() as V12RawTask[]).map(taskOf) };
  });
}
