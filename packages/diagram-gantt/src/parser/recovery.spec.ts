import { describe, expect, it } from 'vitest';
import { parseGantt } from './index.ts';

const T = 'gantt\ndateFormat YYYY-MM-DD\na :a1, 2024-01-01, 1d\n';

/** N errors in, N diagnostics out (pitfall 8, R-PARSE-4). */
const CASES: [name: string, src: string, codes: string[]][] = [
  ['tasks without data', 'gantt\na\nb :1d\nc', ['UNEXPECTED', 'UNEXPECTED']],
  [
    'what no statement starts with',
    'gantt\n2024-01-01 x :1d\naccDescription foo\n:1d\nb :1d',
    ['UNEXPECTED', 'UNEXPECTED', 'UNEXPECTED'],
  ],
  ['a missing and a second header', 'x :1d\ngantt\ngantt\nb :1d', ['UNEXPECTED', 'UNEXPECTED']],
  [
    'clicks',
    T + 'click a1\nb :1d\nclick a1 href ""\nclick a1 call f() call g()\nc :1d',
    ['UNEXPECTED', 'UNEXPECTED', 'UNEXPECTED'],
  ],
  ['an unclosed description', 'gantt\naccDescr {\nx', ['UNCLOSED_DESCRIPTION']],
  ['an unclosed link', T + 'click a1 href "x\nb :1d', ['UNCLOSED_STRING']],
  ['unclosed arguments', T + 'click a1 call f(x\nb :1d', ['UNCLOSED_CALLBACK_ARGS']],
  ['a call without parentheses', T + 'click a1 call f\nb :1d', ['UNCLOSED_CALLBACK']],
  ['an empty accTitle at the end', 'gantt\naccTitle: ', ['UNEXPECTED']],
  [
    'data that is only tags',
    'gantt\na :done\nb :crit, vert\nc',
    ['GANTT_TASK_NO_DATA', 'GANTT_TASK_NO_DATA', 'UNEXPECTED'],
  ],
  ['`%%{` with no directive', T + '  %%{ :1d\nb :1d\n  %%{ :2d', ['UNEXPECTED', 'UNEXPECTED']],
];

describe('gantt error recovery', () => {
  it.each(CASES)('%s', (_, src, codes) => {
    const errors = parseGantt(src).diagnostics.filter((d) => d.severity === 'error');
    expect(errors.map((d) => d.code)).toEqual(codes);
    for (const d of errors) {
      expect(d.range.end).toBeGreaterThan(d.range.start - 1);
      expect(d.range.end).toBeLessThanOrEqual(src.length);
    }
  });

  it('reads on after an error', () => {
    const { model } = parseGantt(
      T + 'oops\nb :b1, 2024-01-02, 1d\nclick a1\nc :c1, 2024-01-03, 1d'
    );
    expect(model.tasks.map((t) => t.id)).toEqual(['a1', 'b1', 'c1']);
  });

  it('reports `%%{` over the opener, not at zero width', () => {
    const src = T + '  %%{\nb :1d';
    const [d] = parseGantt(src).diagnostics;
    expect(src.slice(d?.range.start, d?.range.end)).toBe('%%{');
  });

  /** The text each error diagnostic of `src` covers. */
  const covered = (src: string) =>
    parseGantt(src)
      .diagnostics.filter((d) => d.severity === 'error')
      .map((d) => src.slice(d.range.start, d.range.end));

  it('reports a `click` without `href` or `call` over the click, not the next line', () => {
    expect(covered('gantt\nclick a1\n  B :1d')).toEqual(['click a1']);
    expect(covered('gantt\nclick a1,b2 \nB :1d')).toEqual(['click a1,b2']);
    // `click` at a line end takes the next line's first word as its ids: at its line end.
    const src = 'gantt\nclick \nB :1d';
    const [d] = parseGantt(src).diagnostics;
    expect([d?.range.start, d?.range.end]).toEqual([12, 12]);
  });

  it('reports a task with no data over its text, not the line break after it', () => {
    expect(covered('gantt\nB\nC :1d')).toEqual(['B']);
    expect(covered('gantt\n  Design it  \nC :1d')).toEqual(['Design it']);
    // v12 lexes the `;` after task data as the text of another task.
    expect(covered('gantt\nA :a1, 2024-01-01, 1d;\nC :1d')).toEqual([';']);
    expect(covered('gantt\nB')).toEqual(['B']);
  });

  it('reports a keyword with nothing after it where its value belongs', () => {
    // v12 lexes `section ` at a line end as a task text; the name is what is missing.
    const src = 'gantt\n  section \n  B :1d\n  click ';
    const errors = parseGantt(src).diagnostics.filter((d) => d.severity === 'error');
    expect(errors.map((d) => [d.range.start, d.range.end])).toEqual([
      [16, 16],
      [src.length, src.length],
    ]);
    expect(errors[0]?.message).toMatch(/^Expected a section name, got a line break; write it as/);
  });

  it('never names a token or grammar rule', () => {
    const { diagnostics } = parseGantt(
      'x\ngantt\n:1d\n2024-01-01\nclick a1\nclick a1 href ""\naccDescription y\n'
    );
    for (const d of diagnostics) expect(d.message).not.toMatch(/taskTxt|taskData|_|TaskText/);
  });
});
