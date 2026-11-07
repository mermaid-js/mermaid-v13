/**
 * Hand-built `GanttModel`s for the layout specs, written with v12's DB calls on top of the
 * schedule fixtures. AST ids follow spec #293 (`t:<id>`, `s:<title>`). Parser-produced models
 * are checked over the corpus in `packages/conformance/src/gantt/layout-corpus.spec.ts`.
 */
import type { GanttClick, GanttModel, GanttWeekday } from '../model.ts';
import { FixtureDb } from '../schedule/fixtures.ts';

export class LayoutFixture extends FixtureDb {
  axisFormat = '';
  tickInterval: string | undefined;
  todayMarker = '';
  topAxis = false;
  weekday: GanttWeekday | undefined;
  title: string | undefined;
  clicks: GanttClick[] = [];

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
  setWeekday(txt: GanttWeekday): this {
    this.weekday = txt;
    return this;
  }
  setDiagramTitle(txt: string): this {
    this.title = txt;
    return this;
  }
  click(...ids: string[]): this {
    this.clicks.push({ ast: `click:${this.clicks.length + 1}`, ids, range: this.nextRange() });
    return this;
  }

  model(): GanttModel {
    return {
      ...this.input(),
      source: '',
      ...(this.title !== undefined ? { title: this.title } : {}),
      accTitle: '',
      accDescr: '',
      axisFormat: this.axisFormat,
      ...(this.tickInterval !== undefined ? { tickInterval: this.tickInterval } : {}),
      todayMarker: this.todayMarker,
      topAxis: this.topAxis,
      ...(this.weekday !== undefined ? { weekday: this.weekday } : {}),
      sections: this.sections,
      tasks: this.tasks,
      clicks: this.clicks,
      warnings: [],
    };
  }
}

export const fixture = (): LayoutFixture => new LayoutFixture().setDateFormat('YYYY-MM-DD');
