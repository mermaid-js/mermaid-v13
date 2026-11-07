import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { gitGraphTokens } from './index.ts';
import { lex } from './lexer.ts';
import { LANGIUM_NAMES, T } from './tokens.ts';

// cspell:words titled

const stream = (src: string) => {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const s = lex(src, pre.bodyStart, view);
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
const of = (src: string, kind: number) => gitGraphTokens(src).filter((t) => t.kind === kind);
const slice = (src: string, t: { start: number; end: number }) => src.slice(t.start, t.end);
/** The tokens as `NAME text` (Chevrotain names), line breaks left out. */
const names = (src: string) =>
  gitGraphTokens(src)
    .filter((t) => t.kind !== Kind.Newline)
    .map((t) => `${LANGIUM_NAMES[t.kind]} ${t.text}`);

// v12 removed comment lines and directives before lexing; v13 lexes the same text, so a token
// that runs over one stays one token (the parity gate would not see a split of these, pitfall 4).
describe('tokens across removed spans', () => {
  it('keeps an accDescr {…} body split by a comment line one token', () => {
    const src = 'gitGraph\naccDescr {\na\n%% c\nb\n}\ncommit';
    const values = of(src, T.AccDescr);
    expect(values.map((t) => t.text)).toEqual(['accDescr {\na\nb\n}']);
    expect(slice(src, values[0]?.range ?? { start: 0, end: 0 })).toBe('accDescr {\na\n%% c\nb\n}');
  });

  it('keeps a string split by a comment line one token', () => {
    const src = 'gitGraph\ncommit msg:"a\n%% c\nb"';
    expect(of(src, T.String).map((t) => t.text)).toEqual(['"a\nb"']);
  });

  it('keeps a name split by a directive one token', () => {
    const src = 'gitGraph\nbranch fea%%{init: {}}%%ture';
    expect(of(src, T.Reference).map((t) => [t.text, slice(src, t.range)])).toEqual([
      ['feature', 'fea%%{init: {}}%%ture'],
    ]);
  });

  it('writes each removed span as trivia, ranges in source order', () => {
    const src = 'gitGraph\n%% one\ncommit %% two\n%%{init: {}}%%\ncommit';
    const tokens = stream(src);
    const trivia = tokens.filter((t) => t.kind === Kind.Comment || t.kind === Kind.Directive);
    expect(trivia.map((t) => [t.kind, slice(src, t)])).toEqual([
      [Kind.Comment, '%% one\n'],
      // Left in the text v12 lexed: a hidden SINGLE_LINE_COMMENT.
      [Kind.Comment, '%% two'],
      [Kind.Directive, '%%{init: {}}%%'],
    ]);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    // gitGraphTokens leaves out what v12 removed and keeps what its lexer saw.
    expect(of(src, Kind.Comment).map((t) => t.text)).toEqual(['%% two']);
    expect(of(src, Kind.Directive)).toEqual([]);
  });

  it('gives a CRLF line break one token from its CR, and a lone CR one too', () => {
    const src = 'gitGraph\r\ncommit\rcommit\r\n';
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline);
    // The last is the line break v12 appended, zero-width at the end of the source.
    expect(breaks.map((t) => slice(src, t))).toEqual(['\r\n', '\r', '\r\n', '']);
    expect(of(src, Kind.Newline).map((t) => t.text)).toEqual(['\n', '\n', '\n', '']);
  });

  it('reads tag quotes, entities and a dropped semicolon as v12 did', () => {
    const src = 'gitGraph\ncommit msg:"style x:#f00;"\ncommit msg:"<b c="d">#quot;</b>"';
    expect(of(src, T.String).map((t) => [t.text, slice(src, t.range)])).toEqual([
      ['"style x:#f00"', '"style x:#f00;"'],
      ['"<b c=\'d\'>&quot;</b>"', '"<b c="d">#quot;</b>"'],
    ]);
  });
});

describe('rules', () => {
  it('lets a word keyword yield to a longer name, and only then', () => {
    expect(names('gitGraph\ncommits cherry-pick03 merged commit: commit.')).toEqual([
      'gitGraph gitGraph',
      'REFERENCE commits',
      'REFERENCE cherry-pick03',
      'REFERENCE merged',
      'commit commit',
      ': :',
      'commit commit',
      'LEXICAL_ERROR .',
    ]);
    // The colon keywords have no longer alternative.
    expect(names('gitGraph\ncommitid:"x" id:x')).toEqual([
      'gitGraph gitGraph',
      'REFERENCE commitid',
      ': :',
      'STRING "x"',
      'id: id:',
      'REFERENCE x',
    ]);
  });

  it('needs a blank, %% or the end after gitGraph', () => {
    expect(names('gitGraph%%x')).toEqual(['gitGraph gitGraph', 'SINGLE_LINE_COMMENT %%x']);
    expect(names('gitGraphx')).toEqual(['REFERENCE gitGraphx']);
    expect(names('gitGraph:TB')).toEqual(['gitGraph: gitGraph:', 'TB TB']);
  });

  it('never lets TITLE yield, and keeps the blanks before it (D269)', () => {
    expect(names('gitGraph\nbranch titled')).toEqual([
      'gitGraph gitGraph',
      'branch branch',
      'TITLE  title',
      'REFERENCE d',
    ]);
    expect(names('gitGraph\n  title  x  %% c')).toEqual([
      'gitGraph gitGraph',
      'TITLE   title  x  ',
      'SINGLE_LINE_COMMENT %% c',
    ]);
  });

  it('ranks INT above REFERENCE, backtracking a digit before a dot', () => {
    const ints = (src: string) => names(src).slice(2);
    expect(ints('gitGraph\nbranch 123')).toEqual(['INT 123']);
    expect(ints('gitGraph\nbranch 10abc')).toEqual(['INT 10', 'REFERENCE abc']);
    expect(ints('gitGraph\nbranch 1.0.1')).toEqual(['REFERENCE 1.0.1']);
    expect(ints('gitGraph\nbranch 10.5')).toEqual(['INT 1', 'INT 0', 'LEXICAL_ERROR .', 'INT 5']);
    expect(ints('gitGraph\nbranch 007')).toEqual(['INT 0', 'INT 0', 'INT 7']);
  });

  it('ends a name at its last letter, digit, `_` or `-`', () => {
    expect(names('gitGraph\nbranch feature/a-b_c.d branch a./')).toEqual([
      'gitGraph gitGraph',
      'branch branch',
      'REFERENCE feature/a-b_c.d',
      'branch branch',
      'REFERENCE a',
      'LEXICAL_ERROR ./',
    ]);
  });

  it('writes one Error over the characters Chevrotain skipped, then lexes on', () => {
    expect(names('gitGraph\nbranch über')).toEqual([
      'gitGraph gitGraph',
      'branch branch',
      'LEXICAL_ERROR ü',
      'REFERENCE ber',
    ]);
    expect(names('gitGraph\ncommit;;; commit')).toEqual([
      'gitGraph gitGraph',
      'commit commit',
      'LEXICAL_ERROR ;;;',
      'commit commit',
    ]);
  });

  it('lexes a YAML block in the body as hidden trivia', () => {
    const src = 'gitGraph\n---\nx: 1\n---\ncommit';
    expect(of(src, T.Yaml).map((t) => t.text)).toEqual(['---\nx: 1\n---\n']);
  });
});
