import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { JISON_NAMES, lexQuadrant, QuadrantTokenKind as T, quadrantTokens } from './index.ts';

/** `name:text@start-end` per token, trivia included (the gate in conformance compares names). */
function dump(src: string): string[] {
  const l = lexQuadrant(src);
  const out: string[] = [];
  for (let i = 0; i < l.tokens.length - 1; i++) {
    const kind = l.tokens.kind[i] ?? -1;
    const name =
      JISON_NAMES[kind] ??
      (kind === Kind.Comment ? 'comment' : kind === Kind.Directive ? 'directive' : String(kind));
    out.push(`${name}@${l.tokens.start[i]}-${l.tokens.end[i]}`);
  }
  return out;
}

describe('quadrant lexer', () => {
  it('maps every token back to its source range', () => {
    const src = 'quadrantChart\n  A: [0.1, 0.2]';
    expect(dump(src)).toEqual([
      'QUADRANT@0-13',
      'NEWLINE@13-14',
      'SPACE@14-15',
      'SPACE@15-16',
      'ALPHA@16-17',
      'point_start@17-20',
      'point_x@20-23',
      // The `, ` between the coordinates and the closing `]`: no jison token.
      `${T.PointComma}@23-25`,
      'point_y@25-28',
      `${T.PointEnd}@28-29`,
      // v12's appended line break: zero-width at the end of the source.
      'NEWLINE@29-29',
      'EOF@29-29',
    ]);
  });

  it('reads CRLF as one line break and keeps its source range', () => {
    // The last CRLF and v12's appended line break are one `[\n\r]+` run.
    const tokens = quadrantTokens('quadrantChart\r\nquadrant-1 a\r\n');
    const nl = tokens.filter((t) => t.kind === Kind.Newline);
    expect(nl.map((t) => [t.text, t.range.start, t.range.end])).toEqual([
      ['\n', 13, 15],
      ['\n', 27, 29],
    ]);
  });

  it('writes comment lines and directives as trivia, in source order', () => {
    const src = '%%{init: {}}%%\nquadrantChart\n%% c\nquadrant-1 a %% tail\n';
    expect(dump(src).filter((t) => /^(comment|directive)/.test(t))).toEqual([
      'directive@0-14',
      'comment@29-34',
      // jison's own rule 1: the blank before `%%` goes with the comment.
      'comment@46-54',
    ]);
  });

  it('keeps one STR token across a removed comment line (pitfall 4)', () => {
    const src = 'quadrantChart\nquadrant-1 "a\n%% c\nb"';
    const str = quadrantTokens(src).filter((t) => t.kind === T.Str);
    expect(str.map((t) => [t.text, t.range.start, t.range.end])).toEqual([['a\nb', 26, 34]]);
  });

  it('gives an entity outside quotes the source range of its #, name and ;', () => {
    const tokens = quadrantTokens('quadrantChart\nquadrant-1 a#quot;b');
    expect(tokens.slice(3, 8).map((t) => [JISON_NAMES[t.kind], t.text, t.range.start])).toEqual([
      ['ALPHA', 'a', 25],
      ['UNICODE_TEXT', '&', 26],
      ['ALPHA', 'quot', 27],
      ['UNICODE_TEXT', ';', 31],
      ['ALPHA', 'b', 32],
    ]);
  });

  it('writes an error token where jison throws, then lexes on from the initial state', () => {
    const names = quadrantTokens('quadrantChart\nquadrant-1 a(b\nP: [2, 0]\nq').map(
      (t) => JISON_NAMES[t.kind]
    );
    expect(names).toEqual([
      'QUADRANT',
      'NEWLINE',
      'QUADRANT_1',
      'ALPHA',
      'LEXICAL_ERROR',
      'ALPHA',
      'NEWLINE',
      'ALPHA',
      'point_start',
      'LEXICAL_ERROR',
      'COMMA',
      'SPACE',
      'NUM',
      'LEXICAL_ERROR',
      'NEWLINE',
      'ALPHA',
      'NEWLINE',
      'EOF',
    ]);
  });

  it('writes a zero-width error before a line break', () => {
    const err = quadrantTokens('quadrantChart\nP:::\nq').find((t) => t.kind === Kind.Error);
    expect(err?.range).toEqual({ start: 18, end: 18 });
  });

  it('starts a new --> at the space after a lone dash', () => {
    const t = quadrantTokens('quadrantChart\nx-axis Low - --> High');
    expect(t.slice(5, 8).map((x) => [JISON_NAMES[x.kind], x.text])).toEqual([
      ['MINUS', '-'],
      ['AXIS-TEXT-DELIMITER', ' --> '],
      ['ALPHA', 'High'],
    ]);
  });

  it('gives the rest of a placeholder split by an error a zero-width range', () => {
    expect(dump('quadrantChart\nP:::#12;x').slice(2)).toEqual([
      'ALPHA@14-15',
      `${T.ClassMarker}@15-18`,
      'LEXICAL_ERROR@18-19',
      'UNICODE_TEXT@19-19',
      'NUM@19-21',
      'UNICODE_TEXT@21-22',
      'ALPHA@22-23',
      'NEWLINE@23-23',
      'EOF@23-23',
    ]);
  });

  it('ends the last line break before a trailing comment', () => {
    expect(dump('quadrantChart\nquadrant-1 a\n%% c').slice(-4)).toEqual([
      'ALPHA@25-26',
      'NEWLINE@26-27',
      'comment@27-31',
      'EOF@31-31',
    ]);
  });

  // Pitfall 5: a rule that starts with a blank run and fails must not rescan the run from
  // every blank. Each case is about 1 MB; a quadratic scan would not finish in the timeout.
  it.each([
    ['blanks before a non-keyword', 'quadrantChart\nquadrant-1 a' + ' '.repeat(1 << 20) + 'b'],
    ['blanks before a colon', 'quadrantChart\nquadrant-1 a' + ' '.repeat(1 << 20) + ': b'],
    ['colon, blanks, no bracket', 'quadrantChart\nP:' + ' \n'.repeat(1 << 19) + 'x'],
    ['dashes without >', 'quadrantChart\nx-axis a ' + '-'.repeat(1 << 20)],
    ['an unclosed string', 'quadrantChart\nquadrant-1 "' + 'a '.repeat(1 << 19)],
  ])(
    'lexes %s in linear time',
    (_, src) => {
      expect(lexQuadrant(src).tokens.length).toBeGreaterThan(2);
    },
    10_000
  );
});
