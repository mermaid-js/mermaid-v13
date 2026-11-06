/**
 * Hand-built gantt models for the specs, written with v12's DB calls (`ganttDb.js`
 * `addSection`, `addTask(text, data)`, `setExcludes` …), so a case reads like v12's own
 * `ganttDb.spec.ts`. `addTask` splits the data as v12's `parseData` did and T2's parser does
 * (`GanttTask.fields`); ranges are 0 (the layout specs that need a position parse text).
 */
import type { GanttSection, GanttTag, GanttTask, GanttWeekend } from '../model.ts';
import type { ScheduleInput } from './types.ts';

const RE_TAG = /^\s*(active|done|crit|milestone|vert)\s*$/;
const NOWHERE = { start: 0, end: 0 };

const merge = (existing: readonly string[], txt: string): string[] => [
  ...new Set([
    ...existing,
    ...txt
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((t) => t !== ''),
  ]),
];

/** v12's DB setters over a model's schedule fields. */
export class FixtureDb {
  dateFormat = '';
  includes: string[] = [];
  excludes: string[] = [];
  inclusiveEndDates = false;
  weekend: GanttWeekend = 'saturday';
  sections: GanttSection[] = [];
  tasks: GanttTask[] = [];
  private count = 0;
  private readonly asts = new Map<string, number>();

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
  setWeekend(day: GanttWeekend): this {
    this.weekend = day;
    return this;
  }
  addSection(txt: string): this {
    this.sections.push({ ast: this.ast(`s:${txt.trim()}`), text: txt });
    return this;
  }

  private ast(base: string): string {
    const n = (this.asts.get(base) ?? 0) + 1;
    this.asts.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }

  /** v12 `addTask` + `parseData`; throws where v12 threw at parse time (only tags). */
  addTask(text: string, data: string): this {
    const parts = (data.startsWith(':') ? data.slice(1) : data).split(',');
    const tags: GanttTag[] = [];
    for (let m = RE_TAG.exec(parts[0] ?? ''); m; m = RE_TAG.exec(parts[0] ?? '')) {
      if (!tags.includes(m[1] as GanttTag)) tags.push(m[1] as GanttTag);
      parts.shift();
      if (parts.length === 0) throw new TypeError('A task needs data after its tags');
    }
    const fields = parts.map((x) => x.trim());
    const id = fields.length >= 3 ? fields[0]! : `task${++this.count}`;
    const prevId = this.tasks.at(-1)?.id;
    this.tasks.push({
      ast: this.ast(`t:${id}`),
      id,
      text,
      ...(this.sections.length > 0 ? { section: this.sections.length - 1 } : {}),
      tags,
      fields,
      ...(fields.length >= 2 ? { start: fields[fields.length >= 3 ? 1 : 0]! } : {}),
      end: fields[Math.min(fields.length, 3) - 1]!,
      ...(prevId !== undefined ? { prevId } : {}),
      range: NOWHERE,
      dataRange: NOWHERE,
    });
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
