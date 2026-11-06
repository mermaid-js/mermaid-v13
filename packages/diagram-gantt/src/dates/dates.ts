// Ported from Pele (https://github.com/obsidianmd/pele), src/diagrams/gantt/dates.ts at 3a2f075;
// `parseDuration` from src/diagrams/gantt/db.ts.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/diagram-gantt.
// Changes from Pele: the one-entry cache of the compiled parse format is gone (no module state,
// R-ARCH-4), so `compile` runs per call; index reads carry `!` for noUncheckedIndexedAccess.
// `readStartDate` and `readEndDate` are new: the written-date branches of v12's `getStartDate`
// and `getEndDate` (ganttDb.js at fa796a943). The date code is otherwise unchanged.
// cspell:ignore kepano gggg zzz Mdhmswy
//
// The parts of dayjs 1.11 that Mermaid's gantt code relies on, with the plugins it loads (custom parse format,
// advanced format, ISO week) and the English locale: strict parsing against a format, formatting, and calendar
// arithmetic, all in local time. Quirks are kept, because a date is accepted only when formatting the parsed
// result gives back the input.

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const DAY = 86400000;
const WEEK = 7 * DAY;

export type Unit = 'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y';

export function isValid(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

function pad(value: number, length: number): string {
  const s = String(value);
  return s.length >= length ? s : '0'.repeat(length - s.length) + s;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]!);
}

function utcOffset(date: Date): number {
  const offset = -Math.round(date.getTimezoneOffset() / 15) * 15;
  return offset === 0 ? 0 : offset;
}

function zone(date: Date): string {
  const offset = utcOffset(date);
  const minutes = Math.abs(offset);
  return (offset >= 0 ? '+' : '-') + pad(Math.floor(minutes / 60), 2) + ':' + pad(minutes % 60, 2);
}

export function isoWeekday(date: Date): number {
  return date.getDay() || 7;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysInMonth(date: Date): number {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  last.setHours(23, 59, 59, 999);
  return last.getDate();
}

// Sets the month or the year, keeping the day of the month unless the new month is shorter.
function setCalendar(date: Date, apply: (d: Date) => void): Date {
  const next = new Date(date);
  next.setDate(1);
  apply(next);
  next.setDate(Math.min(date.getDate(), daysInMonth(next)));
  return next;
}

export function add(date: Date, amount: number, unit: Unit): Date {
  switch (unit) {
    case 'M':
      return setCalendar(date, (d) => d.setMonth(date.getMonth() + amount));
    case 'y':
      return setCalendar(date, (d) => d.setFullYear(date.getFullYear() + amount));
    case 'd':
      return addDays(date, Math.round(amount));
    case 'w':
      return addDays(date, Math.round(7 * amount));
    case 'h':
      return new Date(date.getTime() + amount * 3600000);
    case 'm':
      return new Date(date.getTime() + amount * 60000);
    case 's':
      return new Date(date.getTime() + amount * 1000);
    case 'ms':
      return new Date(date.getTime() + amount);
  }
}

function weekThursday(date: Date): Date {
  return addDays(date, 4 - isoWeekday(date));
}

function isoWeek(date: Date): number {
  const thursday = weekThursday(date);
  const jan1 = new Date(thursday.getFullYear(), 0, 1);
  const weekday = isoWeekday(jan1);
  const first = addDays(jan1, 4 - weekday + (weekday > 4 ? 7 : 0));
  const zoneDelta = (utcOffset(first) - utcOffset(thursday)) * 60000;
  const weeks = (thursday.getTime() - first.getTime() - zoneDelta) / WEEK;
  return (weeks < 0 ? Math.ceil(weeks) || 0 : Math.floor(weeks)) + 1;
}

const RE_ADVANCED = /\[([^\]]+)]|Q|wo|ww|w|WW|W|zzz|z|gggg|GGGG|Do|X|x|k{1,2}|S/g;
const RE_FORMAT =
  /\[([^\]]+)]|YYYY|YY|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g;
const DEFAULT_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ';

const ADVANCED = new Map<string, (date: Date) => string>([
  ['Q', (date) => String(Math.ceil((date.getMonth() + 1) / 3))],
  ['Do', (date) => '[' + ordinal(date.getDate()) + ']'],
  ['GGGG', (date) => String(weekThursday(date).getFullYear())],
  ['W', (date) => String(isoWeek(date))],
  ['WW', (date) => pad(isoWeek(date), 2)],
  ['k', (date) => String(date.getHours() || 24)],
  ['kk', (date) => pad(date.getHours() || 24, 2)],
  ['X', (date) => String(Math.floor(date.getTime() / 1000))],
  ['x', (date) => String(date.getTime())],
]);
const UNSUPPORTED = new Set(['gggg', 'wo', 'w', 'ww', 'z', 'zzz']);

const hours12 = (date: Date): number => date.getHours() % 12 || 12;
const BASIC = new Map<string, (date: Date) => string>([
  ['YY', (date) => String(date.getFullYear()).slice(-2)],
  ['YYYY', (date) => pad(date.getFullYear(), 4)],
  ['M', (date) => String(date.getMonth() + 1)],
  ['MM', (date) => pad(date.getMonth() + 1, 2)],
  ['MMM', (date) => MONTHS[date.getMonth()]!.slice(0, 3)],
  ['MMMM', (date) => MONTHS[date.getMonth()]!],
  ['D', (date) => String(date.getDate())],
  ['DD', (date) => pad(date.getDate(), 2)],
  ['d', (date) => String(date.getDay())],
  ['dd', (date) => WEEKDAYS[date.getDay()]!.slice(0, 2)],
  ['ddd', (date) => WEEKDAYS[date.getDay()]!.slice(0, 3)],
  ['dddd', (date) => WEEKDAYS[date.getDay()]!],
  ['H', (date) => String(date.getHours())],
  ['HH', (date) => pad(date.getHours(), 2)],
  ['h', (date) => String(hours12(date))],
  ['hh', (date) => pad(hours12(date), 2)],
  ['a', (date) => (date.getHours() < 12 ? 'am' : 'pm')],
  ['A', (date) => (date.getHours() < 12 ? 'AM' : 'PM')],
  ['m', (date) => String(date.getMinutes())],
  ['mm', (date) => pad(date.getMinutes(), 2)],
  ['s', (date) => String(date.getSeconds())],
  ['ss', (date) => pad(date.getSeconds(), 2)],
  ['SSS', (date) => pad(date.getMilliseconds(), 3)],
  ['Z', zone],
  ['ZZ', (date) => zone(date).replace(':', '')],
]);

// Returns undefined for the week-of-year and time zone name tokens, which need dayjs plugins Mermaid
// does not load and so fail there.
export function format(date: Date, template: string): string | undefined {
  if (!isValid(date)) return 'Invalid Date';
  const str = template || DEFAULT_FORMAT;
  if (str === 'YYYY-MM-DD') return isoDate(date);
  if (str.match(RE_ADVANCED)?.some((token) => UNSUPPORTED.has(token))) return undefined;
  const advanced = str.replace(RE_ADVANCED, (match) => ADVANCED.get(match)?.(date) ?? match);
  // A bracketed literal is never empty (`[^\]]+`), so `??` picks it whenever it matched.
  return advanced.replace(
    RE_FORMAT,
    (match, literal: string | undefined) => literal ?? BASIC.get(match)?.(date) ?? match
  );
}

export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return (
    (year >= 1000 && year <= 9999 ? year : pad(year, 4)) +
    (month < 10 ? '-0' : '-') +
    month +
    (day < 10 ? '-0' : '-') +
    day
  );
}

interface Fields {
  year?: number;
  month?: number;
  day?: number;
  dayGiven?: boolean;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
  week?: number;
  offset?: number;
  afternoon?: boolean;
}

type Reader = (fields: Fields, input: string) => boolean;
type Step = string | { re: RegExp; read: Reader };

const RE_TOKENS =
  /(\[[^[]*\])|([-_:/.,()\s]+)|(A|a|Q|YYYY|YY?|ww?|MM?M?M?|Do|DD?|hh?|HH?|mm?|ss?|S{1,3}|z|ZZ?)/g;
const RE_LITERAL = /\[[^\]]+]/g;
const MATCH_1 = /\d/;
const MATCH_2 = /\d\d/;
const MATCH_3 = /\d{3}/;
const MATCH_4 = /\d{4}/;
const MATCH_1_TO_2 = /\d\d?/;
const MATCH_SIGNED = /[+-]?\d+/;
const MATCH_OFFSET = /[+-]\d\d:?(\d\d)?|Z/;
const MATCH_WORD = /\d*[^-_:/,()\s\d]+/;

function field(name: 'seconds' | 'minutes' | 'hours' | 'day' | 'week' | 'month' | 'year'): Reader {
  return (fields, input) => {
    fields[name] = +input;
    return true;
  };
}

const readOffset: Reader = (fields, input) => {
  if (input === 'Z') {
    fields.offset = 0;
    return true;
  }
  const parts = input.match(/([+-]|\d\d)/g)!;
  const minutes = +parts[1]! * 60 + (+(parts[2] ?? 0) || 0);
  if (minutes === 0) fields.offset = 0;
  else fields.offset = parts[0] === '+' ? -minutes : minutes;
  return true;
};

function monthName(names: string[]): Reader {
  return (fields, input) => {
    const index = names.indexOf(input) + 1;
    if (index < 1) return false;
    fields.month = index % 12 || index;
    return true;
  };
}

const READERS = new Map<string, { re: RegExp; read: Reader }>([
  ['A', { re: MATCH_WORD, read: (f, input) => ((f.afternoon = input === 'PM'), true) }],
  ['a', { re: MATCH_WORD, read: (f, input) => ((f.afternoon = input === 'pm'), true) }],
  ['Q', { re: MATCH_1, read: (f, input) => ((f.month = (+input - 1) * 3 + 1), true) }],
  ['S', { re: MATCH_1, read: (f, input) => ((f.milliseconds = +input * 100), true) }],
  ['SS', { re: MATCH_2, read: (f, input) => ((f.milliseconds = +input * 10), true) }],
  ['SSS', { re: MATCH_3, read: (f, input) => ((f.milliseconds = +input), true) }],
  ['s', { re: MATCH_1_TO_2, read: field('seconds') }],
  ['ss', { re: MATCH_1_TO_2, read: field('seconds') }],
  ['m', { re: MATCH_1_TO_2, read: field('minutes') }],
  ['mm', { re: MATCH_1_TO_2, read: field('minutes') }],
  ['H', { re: MATCH_1_TO_2, read: field('hours') }],
  ['h', { re: MATCH_1_TO_2, read: field('hours') }],
  ['HH', { re: MATCH_1_TO_2, read: field('hours') }],
  ['hh', { re: MATCH_1_TO_2, read: field('hours') }],
  ['D', { re: MATCH_1_TO_2, read: field('day') }],
  ['DD', { re: MATCH_2, read: field('day') }],
  [
    'Do',
    {
      re: MATCH_WORD,
      read: (f, input) => {
        const digits = /\d+/.exec(input);
        if (!digits) return false;
        // dayjs keeps the digits as a string here, so even "0" counts as a day having been given.
        f.day = +digits[0];
        f.dayGiven = true;
        for (let i = 1; i <= 31; i++) if (ordinal(i) === input) f.day = i;
        return true;
      },
    },
  ],
  ['w', { re: MATCH_1_TO_2, read: field('week') }],
  ['ww', { re: MATCH_2, read: field('week') }],
  ['M', { re: MATCH_1_TO_2, read: field('month') }],
  ['MM', { re: MATCH_2, read: field('month') }],
  ['MMM', { re: MATCH_WORD, read: monthName(MONTHS.map((m) => m.slice(0, 3))) }],
  ['MMMM', { re: MATCH_WORD, read: monthName(MONTHS) }],
  ['Y', { re: MATCH_SIGNED, read: field('year') }],
  [
    'YY',
    { re: MATCH_2, read: (f, input) => ((f.year = +input + (+input > 68 ? 1900 : 2000)), true) },
  ],
  ['YYYY', { re: MATCH_4, read: field('year') }],
  ['Z', { re: MATCH_OFFSET, read: readOffset }],
  ['ZZ', { re: MATCH_OFFSET, read: readOffset }],
]);

function compile(template: string): Step[] | null {
  // dayjs expands localized tokens through a locale table the English locale does not have, and fails.
  if (/[Ll]/.test(template.replace(RE_LITERAL, ''))) return null;
  const tokens = template.match(RE_TOKENS);
  if (!tokens) return null;
  return tokens.map((token) => READERS.get(token) ?? token.replace(/^\[|\]$/g, ''));
}

// `a`/`A` move a 12-hour clock reading to 24 hours.
function applyMeridiem(f: Fields): void {
  if (f.afternoon === undefined || f.hours === undefined) return;
  if (f.afternoon) {
    if (f.hours < 12) f.hours += 12;
  } else if (f.hours === 12) {
    f.hours = 0;
  }
}

// `value || fallback`, as dayjs writes it: a zero year or day counts as missing.
const or = (value: number, fallback: number): number => value || fallback;

// The date the read fields name, with `now` supplying the ones the format leaves out.
function resolve(f: Fields, now: Date): Date | undefined {
  applyMeridiem(f);
  let day = 1;
  if (f.dayGiven || f.day) day = f.day!;
  else if (!f.year && !f.month) day = now.getDate();
  const year = or(f.year ?? 0, now.getFullYear());
  let month = 0;
  if (!(f.year && !f.month)) month = f.month! > 0 ? f.month! - 1 : now.getMonth();
  // The readers store `+digits`, never NaN, so a missing time field is the only falsy one left.
  const hours = f.hours ?? 0;
  const minutes = f.minutes ?? 0;
  const seconds = f.seconds ?? 0;
  const ms = f.milliseconds ?? 0;
  if (f.offset !== undefined)
    return new Date(Date.UTC(year, month, day, hours, minutes, seconds, ms + f.offset * 60000));
  // Applying a week number needs a dayjs plugin Mermaid does not load.
  if (f.week) return undefined;
  return new Date(year, month, day, hours, minutes, seconds, ms);
}

function loose(input: string, template: string, now: Date): Date | undefined {
  if (template === 'x' || template === 'X')
    return new Date((template === 'X' ? 1000 : 1) * Number(input));
  const steps = compile(template);
  if (!steps) return undefined;
  const f: Fields = {};
  let rest = input;
  let start = 0;
  for (const step of steps) {
    if (typeof step === 'string') {
      start += step.length;
      continue;
    }
    const match = step.re.exec(rest.slice(start));
    if (!match || !step.read(f, match[0])) return undefined;
    // dayjs drops the first occurrence of the matched text, wherever it is, and does not move `start`.
    rest = rest.replace(match[0], '');
  }
  return resolve(f, now);
}

// Parses the way `dayjs(input, format, true)` does. `now` supplies the fields the format leaves out.
export function parseStrict(input: string, template: string, now: Date): Date | undefined {
  const date = loose(input, template, now);
  return date && isValid(date) && format(date, template) === input ? date : undefined;
}

const RE_DURATION = /^(\d+(?:\.\d+)?)([Mdhmswy]|ms)$/;
const RE_DIGITS = /^\d+$/;
const YEAR_LIMIT = 10000;

/** A duration such as `1.5d`, as v12's `parseDuration` reads it; `[NaN, 'ms']` when it is not one. */
export function parseDuration(str: string): [number, Unit] {
  const statement = RE_DURATION.exec(str.trim());
  return statement ? [Number.parseFloat(statement[1]!), statement[2] as Unit] : [NaN, 'ms'];
}

/**
 * A task start written as a date (not `after …`), read as v12's `getStartDate` reads it: with
 * `dateFormat x` or `X`, digits are milliseconds; then a strict parse against the trimmed format;
 * then the `Date` constructor, which v12 rejects past the year 10000 either way. `undefined` is
 * v12's `Invalid date:` error.
 */
export function readStartDate(input: string, template: string, now: Date): Date | undefined {
  const str = input.trim();
  const fmt = template.trim();
  if ((fmt === 'x' || fmt === 'X') && RE_DIGITS.test(str)) return new Date(Number(str));
  const strict = parseStrict(str, fmt, now);
  if (strict) return strict;
  const fallback = new Date(str);
  const year = fallback.getFullYear();
  return isValid(fallback) && year >= -YEAR_LIMIT && year <= YEAR_LIMIT ? fallback : undefined;
}

/**
 * A task end written as a date, read as v12's `getEndDate` reads it: a strict parse against the
 * trimmed format only. `undefined` means the text is not a date, and v12 tries a duration next.
 */
export function readEndDate(input: string, template: string, now: Date): Date | undefined {
  return parseStrict(input.trim(), template.trim(), now);
}
