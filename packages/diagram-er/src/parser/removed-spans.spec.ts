import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { erTokens } from '../index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

const stream = (src: string) => {
  const s = lex(src).tokens;
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j],
    text: src.slice(s.start[j], s.end[j]),
    start: s.start[j] ?? 0,
  }));
};
const of = (src: string, kind: number) => erTokens(src).filter((t) => t.kind === kind);

// v12 removed comment lines and directives before lexing, and rewrote CR and entities; v13
// lexes the same text and maps every token back to the source.
describe('tokens across removed spans', () => {
  it('gives a string split by comment lines one token, spanning them', () => {
    const src = 'erDiagram\nA ||--|| B : "a\n%% c\n%% d\nb"';
    const words = of(src, T.Word);
    expect(words.map((t) => t.text)).toEqual(['"a\nb"']);
    expect(src.slice(words[0]?.range.start, words[0]?.range.end)).toBe('"a\n%% c\n%% d\nb"');
  });

  it('gives each comment and directive its own range, in source order', () => {
    const src = 'erDiagram\nA\n%% a\n%%{init: {}}%%\n  %% b\nB';
    const tokens = stream(src);
    const trivia = tokens.filter((t) => t.kind === Kind.Comment || t.kind === Kind.Directive);
    expect(trivia.map((t) => t.text)).toEqual(['%% a\n', '%%{init: {}}%%', '\n  %% b\n']);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('ends a token at its last character, not inside a removed span', () => {
    const src = 'erDiagram\nA\n%% a\nB';
    const newlines = stream(src).filter((t) => t.kind === Kind.Newline);
    expect(newlines.map((t) => t.text)).toEqual(['\n', '\n', '']);
  });

  it('reads CRLF as one line break and keeps the source range', () => {
    const src = 'erDiagram\r\n\r\nA';
    const [nl] = of(src, Kind.Newline);
    expect(nl?.text).toBe('\n\n');
    expect(src.slice(nl?.range.start, nl?.range.end)).toBe('\r\n\r\n');
  });

  it('lexes an entity as the placeholder v12 lexed, one token', () => {
    const src = 'erDiagram\nA#amp;B';
    const names = of(src, T.UnicodeText);
    expect(names.map((t) => t.text)).toEqual(['A&amp;B']);
    expect(src.slice(names[0]?.range.start, names[0]?.range.end)).toBe('A#amp;B');
  });

  it('ends with a zero-width jison EOF at the end of the source', () => {
    const src = 'erDiagram\nA';
    const last = erTokens(src).at(-1);
    expect(last?.kind).toBe(T.Eof);
    expect(last?.range).toEqual({ start: src.length, end: src.length });
  });
});
