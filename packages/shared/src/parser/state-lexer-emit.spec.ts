/**
 * `emit`'s fast path (a text offset is its source offset: nothing removed, folded or added)
 * against the path through the offset maps, kept as the reference in
 * `testing/parser-reference.ts`: every lexer of every line-break mode, over texts with and
 * without removed spans, CRs and the appended line break, writes the same tokens either way.
 */
import { sourceView } from '@mermaid-js/core/parser-kit';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { describe, expect, it } from 'vitest';
import { referencePaths } from '../testing/parser-reference.ts';
import { StateLexer } from './state-lexer.ts';
import type { StateLexerOptions } from './state-lexer.ts';

/** Emits the given ranges in order, as a lexer's rules would. */
class Emitter extends StateLexer {
  protected step(): void {
    this.p = this.n;
  }

  write(spans: readonly (readonly [number, number])[]): TokenStream {
    spans.forEach(([s, e], k) => this.emit(k + 1, s, e));
    return this.w.finish(this.src);
  }

  get length(): number {
    return this.n;
  }
}

const TEXTS = [
  '',
  'graph',
  'graph\nA-->B',
  'graph\nA-->B\n',
  'graph\r\nA-->B\r\n',
  'graph\rA\r',
  'graph\nA\n%% comment\nB',
  'graph\n%%{init: {}}%%\nA',
  'graph\nstyle A fill:#f00;\nB',
  'graph\nclassDef c color:#f00;\r\nB\r',
  'graph\nA["é 日本 😀"] B',
  'graph\n  %% c\r\n  A\n%% d',
];

const OPTIONS: StateLexerOptions[] = [];
for (const crlf of ['fold', 'keep', 'raw'] as const)
  for (const dropSpace of [false, true]) OPTIONS.push({ charsPerToken: 4, crlf, dropSpace });

/** Ranges that cover `[from, n)` in steps of 0 to 3 characters, some ending past `n`. */
function ranges(from: number, n: number, seed: number): [number, number][] {
  const out: [number, number][] = [];
  let s = from;
  let k = seed;
  while (s <= n) {
    k = (k * 1103515245 + 12345) & 0x7fffffff;
    const e = Math.min(s + (k % 4), n + 1);
    out.push([s, e]);
    s = e === s ? s + 1 : e;
  }
  return out;
}

describe('emit', () => {
  it('writes the reference ranges on every text, line-break mode and start', () => {
    for (const src of TEXTS) {
      for (let from = 0; from <= Math.min(src.length, 6); from++) {
        const view: SourceView = sourceView(src, from, []);
        for (const options of OPTIONS) {
          for (let seed = 1; seed <= 3; seed++) {
            const fast = new Emitter(src, from, view, options);
            const rs = ranges(from, fast.length, seed);
            const reference = referencePaths(() => new Emitter(src, from, view, options).write(rs));
            expect(fast.write(rs), JSON.stringify([src, from, options, seed])).toEqual(reference);
          }
        }
      }
    }
  });
});
