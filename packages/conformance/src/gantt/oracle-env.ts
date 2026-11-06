/**
 * What the gantt oracle needs (spec #293 §Testing): v12 acceptance is "`parse` and `getTasks()`
 * both succeed", since v12 throws its scheduling errors (`Invalid date:…`, a first task with no
 * start, too many fields) only when the renderer calls `getTasks()`. So the gantt parser is
 * wrapped once, when the oracle loads: after v12's own parse it runs `getTasks()` with the clock
 * fixed at {@link GANTT_PARITY_NOW}, and a throw there rejects the source. The tasks it returns
 * are kept for the snapshot ({@link ganttOracleTasks}).
 *
 * v12's DB has no getter for `weekend`, reports `weekday` as `sunday` whether or not a statement
 * set it, keeps a task's section only by name, and keeps no click data it can be read back from
 * (links only for known ids, the callbacks as closures), so the grammar's `setWeekday`,
 * `setWeekend`, `addSection`, `addTask`, `setClickEvent` and `setLink` calls are recorded as
 * they are made; `clear()`, which v12 calls before each
 * parse, empties the record. Calls run through to v12's own DB.
 *
 * v12's `taskDb` (id → index) is never cleared, so an id the text never declares can resolve to
 * a task of the current chart through an earlier chart's entry. The record keeps the click calls
 * as written, so the raw model does not depend on what was parsed before. Acceptance did, in one
 * case: a first task with one field starts at the end of task `undefined`, which throws when the
 * chart is parsed alone, but resolves once any earlier chart had a task with more than three
 * fields (`taskDb.undefined`). The wrapper throws v12's own `TypeError` there, as v12 does on a
 * fresh page. (References in `after`/`until` only change scheduled dates, T3's to compare.)
 */

/** The instant the oracle's `getTasks()` runs at (T3's schedule parity uses it too). */
export const GANTT_PARITY_NOW = new Date(2026, 10, 5, 12, 0, 0).getTime();

/** One recorded call of the grammar on v12's gantt DB: the method and its arguments. */
export type GanttCall = readonly [method: string, args: readonly unknown[]];

const RECORDED = [
  'setWeekday',
  'setWeekend',
  'addSection',
  'addTask',
  'setClickEvent',
  'setLink',
] as const;

let calls: GanttCall[] = [];
let tasks: unknown[] = [];

/** The recorded calls of the last gantt parse (valid until the next one). */
export function ganttOracleCalls(): readonly GanttCall[] {
  return calls;
}

/** The tasks `getTasks()` returned after the last gantt parse (valid until the next one). */
export function ganttOracleTasks(): readonly unknown[] {
  return tasks;
}

/**
 * Run `fn` with `Date` reading `now` as the current time (`new Date()`, `Date.now()`), as
 * `vi.setSystemTime` does; dayjs and v12's DB read the clock only through them. Not a vitest
 * dependency, so the oracle CLI can use it too.
 */
export function atFixedTime<T>(now: number, fn: () => T): T {
  const Real = globalThis.Date;
  class Fixed extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(now);
      else super(...(args as [string]));
    }
    static override now(): number {
      return now;
    }
  }
  globalThis.Date = Fixed as DateConstructor;
  try {
    return fn();
  } finally {
    globalThis.Date = Real;
  }
}

interface MermaidV12 {
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ db: unknown }>;
  };
}

interface RawTask {
  prevTaskId?: string;
  raw?: { startTime?: { type?: string } };
}

/** Wrap v12's gantt parser and DB (once, at oracle load). */
export async function patchGanttOracle(mermaid: MermaidV12): Promise<void> {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText('gantt\n');
  const db = diagram.db as Record<string, unknown>;
  // v12's `Diagram` keeps its definition's parser (the jison module object, shared by every parse).
  const parser = (diagram as unknown as { parser: { parse(text: string): unknown } }).parser;
  const clear = db.clear as () => void;
  db.clear = () => {
    calls = [];
    tasks = [];
    clear();
  };
  for (const name of RECORDED) {
    const original = db[name] as (...args: unknown[]) => unknown;
    db[name] = (...args: unknown[]) => {
      calls.push([name, structuredClone(args)]);
      return original(...args);
    };
  }
  const parse = parser.parse.bind(parser);
  const getTasks = db.getTasks as () => unknown[];
  parser.parse = (text: string) => {
    const out = parse(text);
    const scheduled = atFixedTime(GANTT_PARITY_NOW, () => getTasks()) as RawTask[];
    if (
      scheduled.some((t) => t.raw?.startTime?.type === 'prevTaskEnd' && t.prevTaskId === undefined)
    ) {
      throw new TypeError("Cannot read properties of undefined (reading 'endTime')");
    }
    tasks = scheduled.map((t) => structuredClone(t));
    return out;
  };
}
