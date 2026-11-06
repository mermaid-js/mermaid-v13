/**
 * Hand-built `GanttLayoutModel`s for the layout specs, written with v12's DB calls on top of
 * the schedule fixtures. AST ids follow spec #293 (`t:<id>`, `s:<title>`). Parser-produced
 * models replace these once T2 (#378) lands.
 */
import { FixtureDb } from '../schedule/fixtures.ts';
import type { GanttLayoutModel, GanttModelClick, GanttModelSection } from './types.ts';

export class LayoutFixture extends FixtureDb {
  axisFormat = '';
  tickInterval: string | undefined;
  todayMarker = '';
  topAxis = false;
  weekday: string | undefined;
  title: string | undefined;
  sections: GanttModelSection[] = [];
  clicks: GanttModelClick[] = [];

  override addSection(txt: string): this {
    this.sections.push({ text: txt, ast: `s:${txt}` });
    return super.addSection(txt);
  }
  setAxisFormat(txt: string): this {
    this.axisFormat = txt;
    return this;
  }
  setTickInterval(txt: string): this {
    this.tickInterval = txt;
    return this;
  }
  setTodayMarker(txt: string): this {
    this.todayMarker = txt;
    return this;
  }
  enableTopAxis(): this {
    this.topAxis = true;
    return this;
  }
  setWeekday(txt: string): this {
    this.weekday = txt;
    return this;
  }
  setDiagramTitle(txt: string): this {
    this.title = txt;
    return this;
  }
  click(...ids: string[]): this {
    this.clicks.push({ ids });
    return this;
  }

  /** The model; `source` and task ranges when given (one task per source line after `gantt`). */
  model(source?: string): GanttLayoutModel {
    const lines = source?.split('\n') ?? [];
    let offset = 0;
    const ranges = lines.map((line) => {
      const r = { start: offset, end: offset + line.length };
      offset += line.length + 1;
      return r;
    });
    const taskLines = ranges.filter((_, i) => lines[i]!.includes(':'));
    return {
      ...this.input(),
      ...(source !== undefined ? { source } : {}),
      tasks: this.tasks.map((t, i) => ({
        ...t,
        ast: `t:${t.id}`,
        ...(taskLines[i] ? { range: taskLines[i] } : {}),
      })),
      sections: this.sections,
      clicks: this.clicks,
      ...(this.title !== undefined ? { title: this.title } : {}),
      axisFormat: this.axisFormat,
      ...(this.tickInterval !== undefined ? { tickInterval: this.tickInterval } : {}),
      todayMarker: this.todayMarker,
      topAxis: this.topAxis,
      ...(this.weekday !== undefined ? { weekday: this.weekday } : {}),
    };
  }
}

export const fixture = (): LayoutFixture => new LayoutFixture().setDateFormat('YYYY-MM-DD');
