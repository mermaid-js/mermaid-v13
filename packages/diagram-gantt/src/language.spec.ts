import { describe, expect, it } from 'vitest';
import { ganttLanguage, language } from './language.ts';

/**
 * The gantt language facet (#382) at its own seam: symbols of a plain parse, completions at a
 * probe parse and hover, as the language service calls them. The service-level behaviour
 * (definition, references, rename, folding, semantic tokens) is in the goldens
 * (`packages/language-service/goldens/gantt`).
 */

/** Each symbol as `<role> <kind> <name> "<text at its range>"`. */
function symbols(text: string): string[] {
  const result = ganttLanguage.parse(text, { keepTokens: true });
  return result.symbols.map(
    (s) => `${s.role} ${s.kind} ${s.name} "${text.slice(s.range.start, s.range.end)}"`
  );
}

describe('gantt language facet', () => {
  it('is the gantt facet under the fixed name `language`', () => {
    expect(ganttLanguage.id).toBe('gantt');
    expect(language).toBe(ganttLanguage);
    expect(ganttLanguage.namespaces).toEqual([['task']]);
  });

  it('gives every token kind a category', () => {
    const text =
      'gantt\n  dateFormat YYYY-MM-DD\n  title T\n  section A\n  a :a1, 2024-01-01, 1d\n' +
      '  click a1 href "u" call f(x)\n  accTitle: t\n  accDescr {\n    d\n  }\n';
    const result = ganttLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    const kinds = [...result.tokens!.kind.slice(0, result.tokens!.length)];
    expect(kinds.map((k) => ganttLanguage.categories[k])).not.toContain(undefined);
  });
});

describe('gantt task-id symbols', () => {
  it('defines an id written in the task data', () => {
    expect(symbols('gantt\n  Design :a1, 2024-01-01, 3d\n')).toEqual(['def task a1 "a1"']);
    expect(symbols('gantt\n  Design :crit, done,  a1 , 2024-01-01, 3d\n')).toEqual([
      'def task a1 "a1"',
    ]);
  });

  it('gives a task without a written id no symbol', () => {
    expect(symbols('gantt\n  a :2024-01-01, 3d\n  b :2d\n')).toEqual([]);
    // More than three fields: v12 reads neither an id nor dates.
    expect(symbols('gantt\n  a :x, after y, 1d, 2d\n  b :after x, 1d\n')).toEqual([
      'ref task x "x"',
    ]);
  });

  it('refers to ids in `after` (the start) and `until` (the end)', () => {
    expect(
      symbols(
        'gantt\n  a :a1, 2024-01-01, 1d\n  b :b1, 2024-01-01, 1d\n' +
          '  c :after a1  b1, 2d\n  d :d1, after a1, until b1\n'
      )
    ).toEqual([
      'def task a1 "a1"',
      'def task b1 "b1"',
      'ref task a1 "a1"',
      'ref task b1 "b1"',
      'def task d1 "d1"',
      'ref task a1 "a1"',
      'ref task b1 "b1"',
    ]);
  });

  it('reads `after` and `until` only where v12 does', () => {
    // `after` as the end and `until` as the start are dates to v12; `After` is not `after`.
    expect(
      symbols(
        'gantt\n  a :a1, 2024-01-01, 1d\n  b :after a1\n  c :until a1, 1d\n  d :After a1, 1d\n'
      )
    ).toEqual(['def task a1 "a1"']);
    // v12's `[\d\w- ]+`: the ids stop at the first other character.
    expect(symbols('gantt\n  a :a-1, 2024-01-01, 1d\n  b :after a-1.x, 1d\n')).toEqual([
      'def task a-1 "a-1"',
      'ref task a-1 "a-1"',
    ]);
  });

  it('refers to the ids of a `click`', () => {
    expect(
      symbols('gantt\n  a :a1, 2024-01-01, 1d\n  b :b1, 2024-01-01, 1d\n  click a1,b1 href "u"\n')
    ).toEqual(['def task a1 "a1"', 'def task b1 "b1"', 'ref task a1 "a1"', 'ref task b1 "b1"']);
  });

  it('makes the last of a repeated id the definition, as v12 looks ids up', () => {
    expect(
      symbols('gantt\n  a :v1, 2024-01-01, 1d\n  b :v1, 2024-01-02, 1d\n  c :after v1, 1d\n')
    ).toEqual(['ref task v1 "v1"', 'def task v1 "v1"', 'ref task v1 "v1"']);
  });

  it('gives no symbol to a name v12 gives a task without an id (`task<n>`)', () => {
    // `task1` is the first task's own id: renaming the mentions would leave it behind.
    expect(
      symbols('gantt\n  a :2024-01-01, 1d\n  b :b1, after task1, 1d\n  click task1 href "u"\n')
    ).toEqual(['def task b1 "b1"']);
    expect(
      symbols('gantt\n  a :2024-01-01, 1d\n  b :task1, 2024-01-01, 1d\n  c :after task1, 1d\n')
    ).toEqual([]);
  });

  it('gives no symbol to `__proto__`, an id v12 never stores', () => {
    expect(symbols('gantt\n  a :__proto__, 2024-01-01, 1d\n  b :after __proto__, 1d\n')).toEqual(
      []
    );
  });

  it('gives no symbol to an id whose task data a directive cuts in two', () => {
    expect(symbols('gantt\n  a :a1, 2024-%%{init: {}}%%01-01, 1d\n  b :after a1, 1d\n')).toEqual(
      []
    );
  });
});

describe('task ids (isValidId)', () => {
  it('takes a name every mention reads back', () => {
    expect(ganttLanguage.isValidId('a1')).toBeUndefined();
    expect(ganttLanguage.isValidId('des-1_b')).toBeUndefined();
    expect(ganttLanguage.isValidId('task1')).toBeUndefined();
    // v12 takes ids `after` cannot name; the service's read-back guards those mentions.
    expect(ganttLanguage.isValidId(':ps')).toBeUndefined();
    expect(ganttLanguage.isValidId('a.b')).toBeUndefined();
  });

  it('refuses what task data or a `click` would not read as that id', () => {
    expect(ganttLanguage.isValidId('')).toMatch(/empty/);
    expect(ganttLanguage.isValidId('a b')).toMatch(/blank/);
    expect(ganttLanguage.isValidId('a,b')).toMatch(/not a task id/);
    expect(ganttLanguage.isValidId('a#b')).toMatch(/not a task id/);
    expect(ganttLanguage.isValidId('a;b')).toMatch(/not a task id/);
    expect(ganttLanguage.isValidId('done')).toMatch(/not a task id/);
    // v12 keeps ids on a plain object, which never stores `__proto__` (nor does the schedule).
    expect(ganttLanguage.isValidId('__proto__')).toMatch(/never/);
  });
});

const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = ganttLanguage.parse(text, { keepTokens: true, probe: at });
  return ganttLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** The text each item at `¦` replaces, and what it inserts. */
function edits(marked: string): [string, string][] {
  const [text, at] = split(marked);
  const result = ganttLanguage.parse(text, { keepTokens: true, probe: at });
  return ganttLanguage
    .completions(result.probe!, { text, result })
    .map((c) => [text.slice(c.range.start, c.range.end), c.insertText]);
}

const STATEMENTS = [
  'section',
  'title',
  'dateFormat',
  'axisFormat',
  'tickInterval',
  'excludes',
  'includes',
  'todayMarker',
  'inclusiveEndDates',
  'topAxis',
  'weekday',
  'weekend',
  'click',
  'accTitle',
  'accDescr',
];
const TASKS = 'gantt\n  section A\n  Design :a1, 2024-01-01, 3d\n  Build :b1, after a1, 2d\n';

describe('gantt completions (D95)', () => {
  it('offers the header in an empty text', () => {
    expect(complete('¦')).toEqual(['gantt']);
    expect(complete('gan¦')).toEqual(['gantt']);
  });

  it('offers the statements at a line start and on the header line', () => {
    expect(complete('gantt\n  ¦')).toEqual(STATEMENTS);
    expect(complete('gantt ¦')).toEqual(STATEMENTS);
    expect(complete(`${TASKS}  ¦\n  Ship :1d`)).toEqual(STATEMENTS);
    expect(complete('gantt\n  da¦')).toEqual(['dateFormat']);
    expect(complete('gantt\n  WEEK¦')).toEqual(['weekday', 'weekend']);
    expect(complete('gantt\n  in¦')).toEqual(['includes', 'inclusiveEndDates']);
  });

  it('replaces the word being typed and adds the separator it lacks', () => {
    expect(edits('gantt\n  da¦te')).toEqual([['date', 'dateFormat ']]);
    expect(edits('gantt\n  acc¦Title: x')).toEqual([
      ['accTitle', 'accTitle'],
      ['accTitle', 'accDescr'],
    ]);
    expect(edits('gantt\n  top¦')).toEqual([['top', 'topAxis']]);
    expect(edits('gantt\n  weekd¦')).toEqual([['weekd', 'weekday ']]);
  });

  it('offers nothing in a task text, a title or a section name', () => {
    expect(complete('gantt\n  Desi¦')).toEqual([]);
    expect(complete('gantt\n  Design t¦')).toEqual([]);
    expect(complete('gantt\n  title Pl¦')).toEqual([]);
    expect(complete('gantt\n  section ¦')).toEqual([]);
  });

  it('offers the days of `weekday` and `weekend`', () => {
    expect(complete('gantt\n  weekday ¦')).toEqual(WEEKDAY_NAMES);
    expect(complete('gantt\n  weekday t¦')).toEqual(['tuesday', 'thursday']);
    expect(edits('gantt\n  weekday mon¦day')).toEqual([['monday', 'monday']]);
    expect(complete('gantt\n  weekend ¦')).toEqual(['friday', 'saturday']);
  });

  it('offers the day words of `excludes` and `includes`', () => {
    expect(complete('gantt\n  excludes ¦')).toEqual(['weekends', ...WEEKDAY_NAMES]);
    expect(complete('gantt\n  excludes 2024-01-01, we¦')).toEqual(['weekends', 'wednesday']);
    // v12 reads `includes` as dates only.
    expect(complete('gantt\n  includes sat¦')).toEqual([]);
  });

  it('offers the tags while only tags come before, and `after`/`until`', () => {
    expect(complete('gantt\n  a :¦')).toEqual([...TAG_NAMES, 'after', 'until']);
    expect(complete('gantt\n  a :d¦')).toEqual(['done']);
    expect(complete('gantt\n  a :done, ¦')).toEqual([
      'active',
      'crit',
      'milestone',
      'vert',
      'after',
      'until',
    ]);
    expect(complete('gantt\n  a :a1, ¦')).toEqual(['after', 'until']);
    expect(complete('gantt\n  a :a1, 2024-01-01, ¦')).toEqual(['until']);
    expect(edits('gantt\n  a :cr¦, 1d')).toEqual([['cr', 'crit']]);
    expect(edits('gantt\n  a :af¦')).toEqual([['af', 'after ']]);
  });

  it('offers the task ids after `after` and `until`', () => {
    expect(complete(`${TASKS}  Ship :after ¦`)).toEqual(['a1', 'b1']);
    expect(complete(`${TASKS}  Ship :after a1 ¦`)).toEqual(['a1', 'b1']);
    expect(complete(`${TASKS}  Ship :after b¦`)).toEqual(['b1']);
    expect(complete(`${TASKS}  Ship :s1, 2024-01-01, until ¦`)).toEqual(['a1', 'b1']);
    // Not the task's own id.
    expect(complete(`${TASKS}  Ship :s1, after ¦, 1d`)).toEqual(['a1', 'b1']);
    expect(edits(`${TASKS}  Ship :after a¦1, 1d`)).toEqual([['a1', 'a1']]);
  });

  it('offers only the ids v12 reads at that spot', () => {
    const odd = `${TASKS}  c :my id, 2024-01-01, 1d\n  d :a.b, 2024-01-01, 1d\n  e :x'y, 2024-01-01, 1d\n`;
    // `after`/`until` read `[\d\w-]+`; a click reads ids up to a blank or `,`.
    expect(complete(`${odd}  Ship :after ¦`)).toEqual(['a1', 'b1']);
    expect(complete(`${odd}  click ¦`)).toEqual(['a1', 'b1', 'a.b', "x'y"]);
  });

  it('offers the duration units after a number', () => {
    expect(complete('gantt\n  a :3¦')).toEqual(['3d', '3w', '3h', '3m', '3s', '3ms', '3M', '3y']);
    expect(complete('gantt\n  a :a1, 2024-01-01, 1.5m¦')).toEqual(['1.5m', '1.5ms']);
    // The typed text filters; the whole word is replaced.
    expect(edits('gantt\n  a :2¦d')[0]).toEqual(['2d', '2d']);
    expect(edits('gantt\n  a :2¦d')).toHaveLength(8);
  });

  it('offers the task ids in a `click`, then `href` and `call`', () => {
    expect(complete(`${TASKS}  click ¦`)).toEqual(['a1', 'b1']);
    expect(complete(`${TASKS}  click a1,¦`)).toEqual(['a1', 'b1']);
    expect(complete(`${TASKS}  click a1 ¦`)).toEqual(['href', 'call']);
    expect(edits(`${TASKS}  click a1 h¦`)).toEqual([['h', 'href "']]);
    expect(complete(`${TASKS}  click a1 call f() ¦`)).toEqual(['href', ...STATEMENTS]);
  });

  it('offers nothing in a value or outside code', () => {
    expect(complete('gantt\n  accTitle: a¦')).toEqual([]);
    expect(complete('gantt\n  click a1 href "ht¦"')).toEqual([]);
    expect(complete('gantt\n  click a1 call f(¦)')).toEqual([]);
    expect(complete('gantt\n  %% a ¦comment\n')).toEqual([]);
    expect(complete('---\ntitle: ¦x\n---\ngantt\n')).toEqual([]);
  });

  it('still offers the statements after an error', () => {
    expect(complete('gantt\n  a b\n  ¦')).toEqual(STATEMENTS);
  });
});

const TAG_NAMES = ['active', 'done', 'crit', 'milestone', 'vert'];
const WEEKDAY_NAMES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/** Hover at `¦` as `<hovered text> => <contents>`, given what the service would pass. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = ganttLanguage.parse(text, { keepTokens: true });
  const tokens = result.tokens!;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  let touching: typeof token;
  for (let i = 0; i < tokens.length; i++) {
    const start = tokens.start[i]!;
    const end = tokens.end[i]!;
    if (!/\S/.test(text.slice(start, end))) continue;
    if (start <= at && at < end) token = { kind: tokens.kind[i]!, range: { start, end } };
    else if (end === at) touching = { kind: tokens.kind[i]!, range: { start, end } };
  }
  token ??= touching;
  const symbol = result.symbols.find((s) => s.range.start <= at && at <= s.range.end);
  const h = ganttLanguage.hover({ offset: at, token, symbol }, { text, result });
  return h && `${text.slice(h.range.start, h.range.end)} => ${h.contents}`;
}

describe('gantt hover (D93)', () => {
  it('shows the keyword doc from the grammar, the keyword alone', () => {
    expect(hover('gan¦tt\n')).toMatch(/^gantt => \*\*`gantt`\*\*\n\n/);
    expect(hover('gantt\n  date¦Format YYYY-MM-DD\n')).toMatch(/^dateFormat => .*task dates/s);
    expect(hover('gantt\n  dateFormat YYYY-¦MM-DD\n')).toBeUndefined();
    expect(hover('gantt\n  sec¦tion A\n')).toMatch(/^section => /);
    expect(hover('gantt\n  weekday mon¦day\n')).toMatch(/^weekday monday => .*week ticks/s);
  });

  it('shows the task a task id names', () => {
    expect(hover(`${TASKS}  Ship :after a¦1, 1d\n`)).toBe(
      'a1 => **task** `a1`\n\nTask: `Design` · Section: `A`'
    );
    expect(hover('gantt\n  a :after zz¦, 1d\n')).toBe(
      'zz => **task** `zz`\n\nNo task has this id.'
    );
  });

  it('explains the tags, `after` and `until` in task data', () => {
    expect(hover('gantt\n  a :cr¦it, a1, 2024-01-01, 1d\n')).toMatch(/^crit => .*critical/s);
    expect(hover(`${TASKS}  Ship :af¦ter a1, 1d\n`)).toMatch(/^after => .*starts when/s);
    expect(hover('gantt\n  a :a1, 2024-01-01, 1¦d\n')).toBeUndefined();
  });

  it('explains them only where v12 reads them', () => {
    // Tags lead the data; `after` is read in the start field, `until` in the end field.
    expect(hover('gantt\n  a :x, do¦ne, 1d\n')).toBeUndefined();
    expect(hover('gantt\n  a :af¦ter y\n')).toBeUndefined();
    expect(hover('gantt\n  a :x, 2024-01-01, af¦ter y\n')).toBeUndefined();
    expect(hover('gantt\n  a :x, un¦til y, 1d\n')).toBeUndefined();
    expect(hover('gantt\n  a :done, x, af¦ter y, 1d\n')).toMatch(/^after => /);
    expect(hover('gantt\n  a :un¦til y\n')).toMatch(/^until => /);
  });
});
