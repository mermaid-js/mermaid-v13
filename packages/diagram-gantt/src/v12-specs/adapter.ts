/**
 * Test-only adapter for the ported v12 gantt parser spec (R-TEST-3): v12's `gantt.jison` parser
 * and its `ganttDb`, backed by the v13 parse. The spec's expectations are kept as v12 wrote them;
 * this file only translates names and shapes:
 *
 * - `parser.parse(text)` throws on an error diagnostic (v12 threw on a syntax error, and its DB
 *   on task data that is only tags), else keeps the model and replays its statements, in source
 *   order, as the DB calls v12's grammar made (`setTodayMarker('off')`, `setClickEvent(…)`, …),
 *   so the spec's spies see them. The calls do nothing: the getters read the model;
 * - `ganttDb.getTasks()` returns v12's tasks (`id`, `task`, `section`, the tag flags, `order`,
 *   `raw.data`) with the times `schedule()` gives them at {@link SPEC_NOW} (`startTime`,
 *   `endTime`, `renderEndTime`, `manualEndTime`): v13 schedules in layout (D274, T3 #379), and
 *   core never reads the clock, so the adapter fixes the instant v12 read.
 *
 * The state lives in this module because v12's DB was a module (test-only; the v13 parser keeps
 * none).
 */
import { parseGantt } from '../parser/index.ts';
import type { GanttStatementNode } from '../parser/index.ts';
import type { GanttModel } from '../model.ts';
import { schedule } from '../schedule/index.ts';

/** The instant `getTasks()` schedules at (v12 read the clock). */
export const SPEC_NOW = new Date(2026, 10, 5, 12).getTime();

let model: GanttModel | undefined;
/** Every model parsed since `clear()`: v12's DB kept the tasks of each parse until then. */
let parsed: GanttModel[] = [];

/** v12's task, as `getTasks()` returned it. */
interface RawTask {
  id: string;
  task: string;
  section: string;
  type: string;
  active: boolean;
  done: boolean;
  crit: boolean;
  milestone: boolean;
  vert: boolean;
  order: number;
  classes: string[];
  raw: { data: string };
  startTime?: Date;
  endTime?: Date;
  renderEndTime: Date | null;
  manualEndTime: boolean;
}

const date = (t: number | undefined): Date | undefined =>
  t === undefined ? undefined : new Date(t);

/** A setter v12's grammar called: it records nothing (spies watch it). */
const called = (): void => undefined;

/** The setters v12's grammar called; the getters read the model. */
export const ganttDb = {
  clear(): void {
    model = undefined;
    parsed = [];
  },
  setDateFormat: called as (_: string) => void,
  setAxisFormat: called as (_: string) => void,
  setTickInterval: called as (_: string) => void,
  setTodayMarker: called as (_: string) => void,
  setIncludes: called as (_: string) => void,
  setExcludes: called as (_: string) => void,
  enableInclusiveEndDates: called as () => void,
  enableTopAxis: called as () => void,
  setWeekday: called as (_: string) => void,
  setWeekend: called as (_: string) => void,
  setDiagramTitle: called as (_: string) => void,
  setAccTitle: called as (_: string) => void,
  setAccDescription: called as (_: string) => void,
  addSection: called as (_: string) => void,
  addTask: called as (_: string, __: string) => void,
  setClickEvent: called as (_: string, __: string, ___: string | null) => void,
  setLink: called as (_: string, __: string) => void,
  getDateFormat: (): string => model?.dateFormat ?? '',
  getAxisFormat: (): string => model?.axisFormat ?? '',
  getTickInterval: (): string | undefined => model?.tickInterval,
  getTodayMarker: (): string => model?.todayMarker ?? '',
  getIncludes: (): string[] => [...(model?.includes ?? [])],
  getExcludes: (): string[] => [...(model?.excludes ?? [])],
  endDatesAreInclusive: (): boolean => model?.inclusiveEndDates ?? false,
  topAxisEnabled: (): boolean => model?.topAxis ?? false,
  getWeekday: (): string => model?.weekday ?? 'sunday',
  getDiagramTitle: (): string => model?.title ?? '',
  getAccTitle: (): string => model?.accTitle ?? '',
  getAccDescription: (): string => model?.accDescr ?? '',
  getSections: (): string[] => model?.sections.map((s) => s.text) ?? [],
  getTasks(): RawTask[] {
    const m = model;
    if (!m) return [];
    // v12's tasks run on across parses until `clear()`: the first task of a later parse starts
    // after the last of the one before (`lastTaskID`), and the row counter goes on.
    const all = parsed.flatMap((p) =>
      p.tasks.map((t) => ({
        task: t,
        section: t.section === undefined ? '' : (p.sections[t.section]?.text ?? ''),
        source: p.source,
      }))
    );
    const tasks = all.map(({ task }, i) =>
      task.prevId === undefined && i > 0 ? { ...task, prevId: all[i - 1]!.task.id } : task
    );
    const plan = schedule({ ...m, tasks }, { now: SPEC_NOW }).tasks;
    let order = 0;
    return all.map(({ task: t, section, source }, i) => {
      const s = plan[i]!;
      const vert = t.tags.includes('vert');
      return {
        id: t.id,
        task: t.text,
        section,
        type: section,
        active: t.tags.includes('active'),
        done: t.tags.includes('done'),
        crit: t.tags.includes('crit'),
        milestone: t.tags.includes('milestone'),
        vert,
        order: vert ? -1 : order++,
        classes: [],
        raw: { data: source.slice(t.dataRange.start, t.dataRange.end) },
        ...(s.start !== undefined ? { startTime: new Date(s.start) } : {}),
        ...(s.end !== undefined ? { endTime: new Date(s.end) } : {}),
        renderEndTime: date(s.renderEnd) ?? null,
        manualEndTime: s.manualEnd,
      };
    });
  },
};

type Db = typeof ganttDb;

/** Replay the parse as v12's grammar called its DB, in source order. */
function replay(db: Db, statements: readonly GanttStatementNode[]): void {
  for (const node of statements) {
    if (node.type === 'Setting') {
      const v = node.value;
      if (node.setting === 'dateFormat') db.setDateFormat(v);
      else if (node.setting === 'axisFormat') db.setAxisFormat(v);
      else if (node.setting === 'tickInterval') db.setTickInterval(v);
      else if (node.setting === 'todayMarker') db.setTodayMarker(v);
      else if (node.setting === 'includes') db.setIncludes(v);
      else if (node.setting === 'excludes') db.setExcludes(v);
      else if (node.setting === 'inclusiveEndDates') db.enableInclusiveEndDates();
      else if (node.setting === 'topAxis') db.enableTopAxis();
      else if (node.setting === 'weekday') db.setWeekday(v);
      else db.setWeekend(v);
    } else if (node.type === 'Title') db.setDiagramTitle(node.text);
    else if (node.type === 'AccTitle') db.setAccTitle(node.text);
    else if (node.type === 'AccDescr') db.setAccDescription(node.text);
    else if (node.type === 'Section') db.addSection(node.text);
    else if (node.type === 'Task') db.addTask(node.text, node.data);
    else if (node.type === 'Click') {
      const ids = node.ids.join(',');
      if (node.callback) db.setClickEvent(ids, node.callback.name, node.callback.args ?? null);
      if (node.href !== undefined) db.setLink(ids, node.href);
    }
  }
}

export const parser = {
  yy: ganttDb,
  parse(text: string): void {
    const result = parseGantt(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    model = result.model;
    parsed.push(result.model);
    replay(parser.yy, result.ast.children);
  },
};
