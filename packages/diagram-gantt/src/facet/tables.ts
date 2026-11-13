/**
 * The gantt facet's completion tables and shared helpers (DESIGN §4.5, D95). Keyword docs come
 * from the grammar file (`generated/docs.ts`); the words inside a task's data and a setting's
 * value, which no token of their own holds, are documented here.
 */
import type { CompletionKind } from '@mermaid-js/core/parser-kit';
import type { GanttModel, GanttTag, GanttTask } from '../model.ts';
import { clickTargets, lastById } from '../ids.ts';
import { T } from '../parser/tokens.ts';

export { code, span } from '@mermaid-js/core/parser-kit/facet';

/** An item offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  readonly item: CompletionKind;
  /** What follows the label when the text after it holds none (`section `, `accTitle: `). */
  readonly separator?: string;
  /** What the author types next, for the lexer check: `x` unless set. */
  readonly sample?: string;
  /** The token kinds the inserted text may lex as, when not just `kind`. */
  readonly reads?: readonly number[];
  readonly detail?: string;
}

/** The header, offered where the parser expects it (an empty text). */
export const HEADER_ITEMS: readonly KeywordItem[] = [
  { kind: T.Gantt, label: 'gantt', item: 'keyword' },
];

const WEEKDAY_KINDS = [
  T.WeekdayMonday,
  T.WeekdayTuesday,
  T.WeekdayWednesday,
  T.WeekdayThursday,
  T.WeekdayFriday,
  T.WeekdaySaturday,
  T.WeekdaySunday,
];
const WEEKEND_KINDS = [T.WeekendFriday, T.WeekendSaturday];

/** The statements completion offers, in the order it offers them. */
export const STATEMENT_ITEMS: readonly KeywordItem[] = [
  { kind: T.Section, label: 'section', item: 'keyword', separator: ' ' },
  { kind: T.Title, label: 'title', item: 'keyword', separator: ' ' },
  { kind: T.DateFormat, label: 'dateFormat', item: 'keyword', separator: ' ' },
  { kind: T.AxisFormat, label: 'axisFormat', item: 'keyword', separator: ' ' },
  { kind: T.TickInterval, label: 'tickInterval', item: 'keyword', separator: ' ' },
  { kind: T.Excludes, label: 'excludes', item: 'keyword', separator: ' ' },
  { kind: T.Includes, label: 'includes', item: 'keyword', separator: ' ' },
  { kind: T.TodayMarker, label: 'todayMarker', item: 'keyword', separator: ' ' },
  { kind: T.InclusiveEndDates, label: 'inclusiveEndDates', item: 'keyword', sample: '' },
  { kind: T.TopAxis, label: 'topAxis', item: 'keyword', sample: '' },
  {
    kind: T.WeekdayMonday,
    label: 'weekday',
    item: 'keyword',
    separator: ' ',
    sample: 'monday',
    reads: WEEKDAY_KINDS,
  },
  {
    kind: T.WeekendFriday,
    label: 'weekend',
    item: 'keyword',
    separator: ' ',
    sample: 'friday',
    reads: WEEKEND_KINDS,
  },
  { kind: T.ClickKeyword, label: 'click', item: 'keyword', separator: ' ' },
  { kind: T.AccTitle, label: 'accTitle', item: 'keyword', separator: ': ' },
  {
    kind: T.AccDescr,
    label: 'accDescr',
    item: 'keyword',
    separator: ': ',
    reads: [T.AccDescr, T.AccDescrMultiline],
  },
];

/** After `click <ids> `: what a click does. The text opens the value v12 reads next. */
export const CLICK_ACTION_ITEMS: readonly KeywordItem[] = [
  { kind: T.HrefKeyword, label: 'href', item: 'keyword', separator: ' "', sample: 'u"' },
  { kind: T.CallKeyword, label: 'call', item: 'keyword', separator: ' ', sample: 'f()' },
];

/** v12's tags, in the order `getTaskTags` tries them, with what each one draws. */
export const TAGS: readonly (readonly [GanttTag, string])[] = [
  ['active', 'drawn as in progress'],
  ['done', 'drawn as finished'],
  ['crit', 'drawn as critical'],
  ['milestone', 'drawn as a diamond at its start'],
  ['vert', 'drawn as a vertical line, not a bar'],
];

/** `after <ids>` (a start) and `until <ids>` (an end), with their docs. */
export const REFERENCE_WORDS: readonly (readonly [word: 'after' | 'until', doc: string])[] = [
  ['after', '`after <ids>`: the task starts when the last of these tasks ends.'],
  ['until', '`until <ids>`: the task ends when the first of these tasks starts.'],
];

/** v12 `parseDuration` units (`ms` and the one-letter ones), in the order offered. */
export const DURATION_UNITS: readonly (readonly [unit: string, name: string])[] = [
  ['d', 'days'],
  ['w', 'weeks'],
  ['h', 'hours'],
  ['m', 'minutes'],
  ['s', 'seconds'],
  ['ms', 'milliseconds'],
  ['M', 'months'],
  ['y', 'years'],
];

/** The days of `weekday <day>`, v12's `weekday_*` tokens. */
export const WEEKDAYS: readonly string[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
/** The days of `weekend <day>`. */
export const WEEKENDS: readonly string[] = ['friday', 'saturday'];
/** What `excludes`/`includes` name besides dates (v12 `isInvalidDate`). */
export const DAY_WORDS: readonly string[] = ['weekends', ...WEEKDAYS];

/**
 * Tokens that hold the text after their keyword (`title Plan`, `dateFormat YYYY-MM-DD`): hover
 * explains the keyword only.
 */
export const TEXT_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.Section]: 'section',
  [T.DateFormat]: 'dateFormat',
  [T.AxisFormat]: 'axisFormat',
  [T.TickInterval]: 'tickInterval',
  [T.Includes]: 'includes',
  [T.Excludes]: 'excludes',
  [T.TodayMarker]: 'todayMarker',
  [T.HrefKeyword]: 'href',
};

/** The text of `at`'s line before `at`. */
export function lineBefore(text: string, at: number): string {
  let start = at;
  while (start > 0 && !/[\n\r]/.test(text.charAt(start - 1))) start--;
  return text.slice(start, at);
}

/** Each id's last task: the one `after`/`until` name (`ids.ts` `lastById`). */
export function tasksById(model: GanttModel | undefined): Map<string, GanttTask> {
  const tasks = model?.tasks ?? [];
  return new Map([...lastById(tasks)].map(([id, i]) => [id, tasks[i]!]));
}

/**
 * The task the id `name` of the `click` at `offset` names: the latest task with it written
 * before the click (`ids.ts` `clickTargets`), undefined when none is (or no click is there).
 */
export function clickTask(
  model: GanttModel | undefined,
  offset: number,
  name: string
): GanttTask | undefined {
  if (!model) return undefined;
  const i = model.clicks.findIndex((c) => c.range.start <= offset && offset <= c.range.end);
  const click = model.clicks[i];
  if (!click) return undefined;
  const at = clickTargets(model.tasks, [click])[0]![click.ids.indexOf(name)];
  return at === undefined ? undefined : model.tasks[at];
}

/** Whether a task data field is a tag (v12 `getTaskTags`: `^\s*tag\s*$`, case-sensitive). */
export function isTag(field: string): boolean {
  const t = field.trim();
  return TAGS.some(([tag]) => tag === t);
}
