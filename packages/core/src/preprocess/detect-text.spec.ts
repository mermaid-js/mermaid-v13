import { describe, expect, it } from 'vitest';
import { detectText, diagramStart, firstPartyDetects, preprocess } from './index.ts';
import type { PreprocessResult } from './index.ts';

/**
 * `firstPartyDetects` as it was, one call a row, searching the body for `%%` each time: the
 * reference for the per-detection version.
 */
function firstPartyDetectsPerRow(
  test: (text: string) => boolean,
  body: string,
  v12Text: () => string
): boolean {
  return test(body) || (body.includes('%%') && test(v12Text()));
}

/** Generated sources: headers, comments and directives in odd places, front matter, blanks. */
const PIECES = [
  'flowchart',
  'graph',
  'FlowChart',
  'pie',
  'error',
  '---',
  '---\ntitle: t\n---\n',
  ' ',
  '\t',
  '\n',
  '\r\n',
  '\r',
  '\u00a0',
  '\ufeff',
  '\u2028',
  '%%',
  '%% c\n',
  '%%{init: {}}%%',
  '%%{init: {"theme": "dark"}}%%\n',
  '%%{',
  '}%%',
  'A --> B',
  '#amp;',
  '}',
  '#',
  'é',
];

function* sources(count: number): Generator<string> {
  let seed = 11;
  const next = (n: number) => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed >>> 8) % n;
  };
  for (let t = 0; t < count; t++) {
    let src = '';
    for (let j = next(8); j >= 0; j--) src += PIECES[next(PIECES.length)];
    yield src;
  }
}

/** `row`, logging each text it is given to `log`. */
const logged =
  (row: (text: string) => boolean, log: string[]) =>
  (text: string): boolean => {
    log.push(text);
    return row(text);
  };

/** Rows' tests, one that only the comment-cut text can match. */
const ROWS: readonly ((text: string) => boolean)[] = [
  (t) => /^\s*pie/.test(t),
  (t) => /^\s*flowchart/i.test(t),
  (t) => t.trimStart().startsWith('A'),
  (t) => /^\s*graph\s*$/m.test(t),
  (t) => t.length === 0,
];

/** `detectText`'s comment cut as it was: every line split out, cut and joined again. */
function cutPerLine(text: string, keepLastLineComment: boolean): string {
  if (!text.includes('%%')) return text;
  const lines = text.split('\n');
  const last = keepLastLineComment ? lines.length - 1 : -1;
  return lines
    .map((line, i) => {
      const c = line.indexOf('%%');
      return c < 0 || i === last ? line : line.slice(0, c).trimEnd();
    })
    .join('\n');
}

describe('detectText', () => {
  it('cuts comments as the per-line split did, with and without the last line kept', () => {
    let compared = 0;
    for (const src of sources(6000)) {
      let pre: PreprocessResult;
      try {
        pre = preprocess(src);
      } catch {
        continue;
      }
      // Hiding `%%` (same length, so the directive ranges hold) gives the text with directives
      // removed and nothing cut: what the cut starts from.
      const hidden = src.replaceAll('%%', '\u0000\u0000');
      for (const start of [0, diagramStart(src, pre)]) {
        const uncut = detectText(hidden, start, pre).replaceAll('\u0000\u0000', '%%');
        for (const keepLastLineComment of [false, true]) {
          const got = detectText(src, start, pre, { keepLastLineComment });
          if (got !== cutPerLine(uncut, keepLastLineComment))
            expect.fail(JSON.stringify([src, start, keepLastLineComment]));
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(15_000);
  });

  it.each([
    ['a comment at offset zero', '%% c', false, ''],
    ['a comment at offset zero, last line kept', '%% c', true, '%% c'],
    ['trailing blanks before a comment', 'graph TD \t%% c\nA', false, 'graph TD\nA'],
    ['CRLF lines', 'graph TD\r\n%% c\r\nA\r\n', false, 'graph TD\r\n\nA\r\n'],
    ['consecutive comments', 'a %% 1\n%% 2\n%%3\nb', false, 'a\n\n\nb'],
    ['an unterminated final comment', 'a\nb %% c', false, 'a\nb'],
    ['an unterminated final comment kept', 'a %% 1\nb %% c', true, 'a\nb %% c'],
    ['a final LF', 'a %% c\n', true, 'a\n'],
    ['U+2028 is not a line break', 'a b %% c\nd', false, 'a b\nd'],
    ['a comment after a blank line prefix', 'a\n   %% c\nb', false, 'a\n\nb'],
  ])('%s', (_, src, keepLastLineComment, expected) => {
    const pre = preprocess(src);
    expect(detectText(src, 0, pre, { keepLastLineComment })).toBe(expected);
    expect(cutPerLine(src, keepLastLineComment)).toBe(expected);
  });
});

describe('firstPartyDetects', () => {
  it('gives every row the texts and the answers the per-row version gave', () => {
    let compared = 0;
    for (const src of sources(4000)) {
      let pre: PreprocessResult;
      try {
        pre = preprocess(src);
      } catch {
        continue;
      }
      const start = diagramStart(src, pre);
      const body = src.slice(start);
      let old: string | undefined;
      const v12 = () => (old ??= detectText(src, start, pre, { keepLastLineComment: true }));
      const detects = firstPartyDetects(src, start, pre);
      for (const row of ROWS) {
        const was: string[] = [];
        const now: string[] = [];
        const before = firstPartyDetectsPerRow(logged(row, was), body, v12);
        const after = detects(logged(row, now));
        if (after !== before || now.join('\0') !== was.join('\0')) expect.fail(JSON.stringify(src));
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(15_000);
  });
});
