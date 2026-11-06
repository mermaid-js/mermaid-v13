/**
 * GanttModel: the plain-data result of a gantt parse (spec #293 §Parser, T2) and the input of
 * the schedule and layout (T3, #379). It keeps v12's raw data and nothing scheduled (D274):
 * dates, durations and `after`/`until` references stay as written, so the parse and its cache
 * do not depend on `now`. Source order is kept (R-ARCH-7): sections, tasks and clicks in the
 * order written.
 *
 * Values are what v12's DB stored (model parity, T2): a setting's value is the statement text
 * after its keyword and one blank (`$1.substr(n)`, untrimmed); a task's text keeps its trailing
 * blanks; `excludes`/`includes` are v12's merged tokens; the accessibility values are trimmed.
 * Texts are as v12's parser read them (entities as written, CRLF as LF).
 *
 * AST ids (DESIGN §4.2; spec #293): a task `t:<id>` (`t:<id>@2` for a repeated id, pitfall 9;
 * lookups by id keep v12's last-wins), a section `s:<name>` (the name trimmed, `@n` on repeats),
 * a click `click:<n>`, every other statement `st:<n>` (`st:1` is the `gantt` header). Ordinals
 * are 1-based.
 */
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/parser-kit';

/** The tags a task's data may start with (v12 `tags`, case-sensitive). */
export type GanttTag = 'active' | 'done' | 'crit' | 'milestone' | 'vert';

/** `weekday <day>`: the day week ticks start on. */
export type GanttWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/** `weekend friday|saturday`: the first day of the two-day weekend `excludes weekends` skips. */
export type GanttWeekend = 'friday' | 'saturday';

export interface GanttSection {
  /** `s:<name>`. */
  readonly ast: AstId;
  /** The name after `section ` (v12 `substr(8)`), untrimmed; `<br>` as written. */
  readonly text: string;
}

/**
 * One task, as v12's `addTask` recorded it (`rawTasks`): nothing is scheduled. The data after
 * `:` is split on `,`; leading tags are taken off (any order, each `^\s*tag\s*$`), the rest are
 * the {@link GanttTask.fields}, trimmed:
 *
 * | fields | id         | start                    | end |
 * | ------ | ---------- | ------------------------ | --- |
 * | 1      | `task<n>`  | the previous task's end  | 1st |
 * | 2      | `task<n>`  | 1st                      | 2nd |
 * | 3+     | 1st        | 2nd                      | 3rd |
 *
 * More than three fields is a schedule error (v12 threw in `getTasks`; D274), as are a start or
 * end that is neither a date, a duration nor a reference, and a first task with no start.
 */
export interface GanttTask {
  /** `t:<id>`, `t:<id>@2` for the second task with that id. */
  readonly ast: AstId;
  /**
   * The id: the first field of three or more, else `task<n>`, `n` counting the tasks with fewer
   * than three fields (v12 `parseId`). Ids repeat; a reference takes the last task with the id.
   */
  readonly id: string;
  /** The text before `:` as written (v12 `task`), trailing blanks kept. */
  readonly text: string;
  /** Index into {@link GanttModel.sections}; undefined before the first section (v12 `''`). */
  readonly section?: number;
  /** The leading tags, in the order written, each once. */
  readonly tags: readonly GanttTag[];
  /** The fields after the tags, trimmed (at least one). */
  readonly fields: readonly string[];
  /**
   * The start as written: a date in `dateFormat`, or `after <ids>`. Undefined with one field: the
   * task starts where the task before it ({@link GanttTask.prevId}) ends.
   */
  readonly start?: string;
  /** The end as written: a date, a duration (`3d`) or `until <ids>`. */
  readonly end: string;
  /**
   * The id of the task written before this one (v12 `prevTaskId`), any section; undefined for
   * the first task. A one-field task starts at the end of the last task with this id.
   */
  readonly prevId?: string;
  /** The whole statement in the source. */
  readonly range: Range;
  /** The data, from its `:` to its end, in the source (for schedule errors, D274). */
  readonly dataRange: Range;
}

/** `click <ids> href "<url>"` and/or `call <fn>(<args>)`, either order. */
export interface GanttClick {
  /** `click:<n>`. */
  readonly ast: AstId;
  /** The task ids, split on `,` as written (v12 did not trim them). */
  readonly ids: readonly string[];
  /** The link as written between the quotes (checked when drawn, not here). */
  readonly href?: string;
  /** `call <name>(<args>)`: the name as written (up to `(`), the arguments as written. */
  readonly call?: GanttCall;
  readonly range: Range;
}

export interface GanttCall {
  readonly name: string;
  /** The text between the parentheses; undefined for `()` (blanks only) or none. */
  readonly args?: string;
}

export interface GanttModel {
  /**
   * The text this model was parsed from, front matter included: every `range` is an offset into
   * it. Layout reports schedule errors with it (D274), as it gets only the model and the context.
   */
  readonly source: string;
  /**
   * The last in-text `title …` (v12 `substr(6)`, untrimmed), else the front-matter `title`
   * (D218: v12 set the front-matter title first, so an in-text one replaces it); undefined when
   * neither is set.
   */
  readonly title?: string;
  /** The `st:<n>` of the in-text `title` the {@link GanttModel.title} is; undefined otherwise. */
  readonly titleAst?: AstId;
  readonly accTitle: string;
  readonly accDescr: string;
  /** `dateFormat <format>`, the last one; `''` when none (every date then takes `new Date`). */
  readonly dateFormat: string;
  /** `axisFormat <format>`, the last one; `''` when none. */
  readonly axisFormat: string;
  /** `tickInterval <interval>`, the last one; undefined when none. */
  readonly tickInterval?: string;
  /** `todayMarker <off|style>`, the last one; `''` when none. */
  readonly todayMarker: string;
  /** `includes …` on every line: lower-cased tokens split on blanks and commas, each once. */
  readonly includes: readonly string[];
  /** `excludes …` on every line, merged as {@link GanttModel.includes} (v12 #6270). */
  readonly excludes: readonly string[];
  /** `inclusiveEndDates`. */
  readonly inclusiveEndDates: boolean;
  /** `topAxis` (D273: v12's grammar threw on it; v13 draws the top axis). */
  readonly topAxis: boolean;
  /** `weekday <day>`, the last one; undefined when none (`gantt.weekday` applies, D279). */
  readonly weekday?: GanttWeekday;
  /** `weekend <day>`, the last one; `'saturday'` when none, as in v12. */
  readonly weekend: GanttWeekend;
  /** In source order; names may repeat, each one is its own section. */
  readonly sections: readonly GanttSection[];
  /** In source order, `vert` markers included. */
  readonly tasks: readonly GanttTask[];
  /** In source order. Ids that name no task are kept (T3 warns, D276). */
  readonly clicks: readonly GanttClick[];
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
