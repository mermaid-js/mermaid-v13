/**
 * Hand-built schedule inputs for the specs, written with v12's DB calls (`ganttDb.js`
 * `addSection`, `addTask(text, data)`, `setExcludes` …), so a case reads like v12's own
 * `ganttDb.spec.ts`. `addTask` splits the data as v12's `parseData` did. Parser-produced models
 * replace these once T2 (#378) lands.
 */
import type { GanttTag, RawGanttTask, ScheduleInput } from './types.ts';

const TAGS: readonly GanttTag[] = ['active', 'done', 'crit', 'milestone', 'vert'];
const RE_TAG = /^\s*(active|done|crit|milestone|vert)\s*$/;

const merge = (existing: string[], txt: string): string[] => [
  ...new Set([
    ...existing,
    ...txt
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((t) => t !== ''),
  ]),
];

/** v12's DB setters over a {@link ScheduleInput}. */
export class FixtureDb {
  dateFormat = '';
  includes: string[] = [];
  excludes: string[] = [];
  inclusiveEndDates = false;
  weekend: 'friday' | 'saturday' = 'saturday';
  tasks: RawGanttTask[] = [];
  private section = '';
  private count = 0;

  setDateFormat(txt: string): this {
    this.dateFormat = txt;
    return this;
  }
  setExcludes(txt: string): this {
    this.excludes = merge(this.excludes, txt);
    return this;
  }
  setIncludes(txt: string): this {
    this.includes = merge(this.includes, txt);
    return this;
  }
  enableInclusiveEndDates(): this {
    this.inclusiveEndDates = true;
    return this;
  }
  setWeekend(day: 'friday' | 'saturday'): this {
    this.weekend = day;
    return this;
  }
  addSection(txt: string): this {
    this.section = txt;
    return this;
  }

  /** v12 `addTask` + `parseData`; throws where v12 threw at parse time (only tags). */
  addTask(text: string, data: string): this {
    const fields = (data.startsWith(':') ? data.slice(1) : data).split(',');
    const tags: GanttTag[] = [];
    for (let m = RE_TAG.exec(fields[0] ?? ''); m; m = RE_TAG.exec(fields[0] ?? '')) {
      tags.push(m[1] as GanttTag);
      fields.shift();
      if (fields.length === 0) throw new TypeError('A task needs data after its tags');
    }
    const f = fields.map((x) => x.trim());
    const nextId = (): string => `task${++this.count}`;
    let task: RawGanttTask;
    if (f.length === 1) task = { text, section: this.section, tags, id: nextId(), end: f[0]! };
    else if (f.length === 2)
      task = { text, section: this.section, tags, id: nextId(), start: f[0]!, end: f[1]! };
    else if (f.length === 3)
      task = { text, section: this.section, tags, id: f[0]!, start: f[1]!, end: f[2]! };
    else task = { text, section: this.section, tags, id: '' };
    this.tasks.push(task);
    return this;
  }

  input(): ScheduleInput {
    return {
      dateFormat: this.dateFormat,
      includes: this.includes,
      excludes: this.excludes,
      inclusiveEndDates: this.inclusiveEndDates,
      weekend: this.weekend,
      tasks: this.tasks,
    };
  }
}

export { TAGS };
