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
