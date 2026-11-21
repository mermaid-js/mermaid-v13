/**
 * `textProbeMode`: which token holds the probed offset, and the mode that token gives. Tokens
 * are built by hand, so each test names the token it expects (`start < o <= end`).
 */
import { describe, expect, it } from 'vitest';
import { FIRST_DIAGRAM_KIND, Kind, TokenWriter } from '@mermaid-js/core/parser-kit';
import { textProbeMode, textStatements } from './rule-text.ts';

const TITLE = FIRST_DIAGRAM_KIND;
const ACC_TITLE = FIRST_DIAGRAM_KIND + 1;
const ACC_DESCR = FIRST_DIAGRAM_KIND + 2;
const WORD = FIRST_DIAGRAM_KIND + 3;
const STRING = FIRST_DIAGRAM_KIND + 4;
const OTHER = FIRST_DIAGRAM_KIND + 5;

/** `src` lexed into `spans` (kind, start, end), then EOF. */
function lexed(src: string, spans: readonly (readonly [number, number, number])[]) {
  const w = new TokenWriter();
  for (const [kind, start, end] of spans) w.push(kind, start, end);
  return w.finish(src);
}

/** A probe whose `other` hook records each token it is asked about. */
function recordingProbe() {
  const asked: [number, number, number][] = [];
  const probe = textProbeMode({
    texts: textStatements(TITLE, ACC_TITLE, ACC_DESCR),
    accDescr: ACC_DESCR,
    string: STRING,
    other: (_src, kind, start, end) => {
      asked.push([kind, start, end]);
      if (kind === WORD) return 'word';
      return kind === Kind.Comment ? 'comment' : undefined;
    },
  });
  return { asked, probe };
}

//                 0         1         2         3
//                 0123456789012345678901234567890123
const SRC = 'title Hi\nfoo "bar"\naccTitle: Yo\nbaz';
const TOKENS = lexed(SRC, [
  [TITLE, 0, 8],
  [WORD, 9, 12],
  [STRING, 13, 18],
  [ACC_TITLE, 19, 31],
  [WORD, 32, 35],
]);

describe('textProbeMode', () => {
  it('asks about the one token that holds the offset, and only it', () => {
    const cases: [number, string, [number, number, number] | undefined][] = [
      [7, 'title', [TITLE, 0, 8]],
      [8, 'title', [TITLE, 0, 8]],
      [10, 'word', [WORD, 9, 12]],
      [12, 'word', [WORD, 9, 12]],
      [15, 'string', undefined],
      [29, 'accTitle', [ACC_TITLE, 19, 31]],
      [33, 'word', [WORD, 32, 35]],
      [35, 'word', [WORD, 32, 35]],
    ];
    for (const [o, mode, token] of cases) {
      const { asked, probe } = recordingProbe();
      expect(probe(SRC, TOKENS, o), `offset ${o}`).toBe(mode);
      expect(asked, `offset ${o}`).toEqual(token ? [token] : []);
    }
  });

  it('is INITIAL at a token start, in a gap and before the first token', () => {
    for (const o of [0, 9, 13, 19, 32]) {
      const { asked, probe } = recordingProbe();
      // At a token's start the previous token ends at `o - 1` or before, except at 0.
      expect(probe(SRC, TOKENS, o), `offset ${o}`).toBe('INITIAL');
      expect(asked, `offset ${o}`).toEqual([]);
    }
  });

  it('reads the keyword of a text statement as code', () => {
    const { probe } = recordingProbe();
    expect(probe(SRC, TOKENS, 4)).toBe('INITIAL');
    expect(probe(SRC, TOKENS, 6)).toBe('title');
  });

  it('finds the token among many', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `w${String(i).padStart(3, '0')}`);
    const src = words.join(' ');
    const tokens = lexed(
      src,
      words.map((_, i) => [WORD, i * 5, i * 5 + 4] as const)
    );
    for (const i of [0, 1, 499, 500, 998, 999]) {
      const { asked, probe } = recordingProbe();
      expect(probe(src, tokens, i * 5 + 2)).toBe('word');
      expect(asked).toEqual([[WORD, i * 5, i * 5 + 4]]);
    }
    const { asked, probe } = recordingProbe();
    expect(probe(src, tokens, 5 * 500)).toBe('INITIAL');
    expect(asked).toEqual([]);
  });

  // A lexer writes a comment or directive it removed from inside a token after that token, so
  // the two overlap. The outer token is asked first; the comment only when it gives no mode.
  it('asks the token around a comment before the comment', () => {
    const src = 'accDescr {\n a\n %% c\n b\n}\nx %% d\ny';
    const tokens = lexed(src, [
      [ACC_DESCR, 0, 24],
      [Kind.Comment, 15, 19],
      [OTHER, 25, 26],
      [Kind.Comment, 27, 31],
      [WORD, 32, 33],
    ]);
    const cases: [number, string, [number, number, number][]][] = [
      [17, 'accDescr', [[ACC_DESCR, 0, 24]]],
      [23, 'accDescr', [[ACC_DESCR, 0, 24]]],
      [26, 'INITIAL', [[OTHER, 25, 26]]],
      [29, 'comment', [[Kind.Comment, 27, 31]]],
      [33, 'word', [[WORD, 32, 33]]],
    ];
    for (const [o, mode, asked] of cases) {
      const r = recordingProbe();
      expect(r.probe(src, tokens, o), `offset ${o}`).toBe(mode);
      expect(r.asked, `offset ${o}`).toEqual(asked);
    }
  });

  it('asks the comment inside a token that gives no mode', () => {
    const src = 'x %% c\n y';
    const tokens = lexed(src, [
      [OTHER, 0, 9],
      [Kind.Comment, 2, 6],
    ]);
    const { asked, probe } = recordingProbe();
    expect(probe(src, tokens, 4)).toBe('comment');
    expect(asked).toEqual([
      [OTHER, 0, 9],
      [Kind.Comment, 2, 6],
    ]);
  });
});
