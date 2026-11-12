import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { railroadTokens } from '../index.ts';
import { T } from '../tokens.ts';

/**
 * The EBNF quirks spec #526 lists (D513), one token per v12 token: each stream is what 2.0.1's
 * `RailroadEbnf` lexer gives for the same text (probed), with `Error` where it reports an error.
 * The full gate is `packages/conformance/src/railroad/lexer-parity-ebnf.spec.ts`.
 */
const lexed = (body: string) =>
  railroadTokens('railroadEbnf', `railroad-ebnf-beta\n${body}`)
    .slice(1)
    .map((t) => [t.kind, t.text]);

describe('EBNF lexer quirks (D513)', () => {
  it('reads `?` as a postfix unless a special sequence starts there', () => {
    expect(lexed('a = b? c ;').slice(2, 5)).toEqual([
      [T.Id, 'b'],
      [T.Question, '?'],
      [T.Id, 'c'],
    ]);
    expect(lexed('a = b ? c ? ;').slice(2, 4)).toEqual([
      [T.Id, 'b'],
      [T.Special, '? c ?'],
    ]);
  });

  it('lets a special sequence span lines, but not hold `;` or only blanks', () => {
    expect(lexed('a = ? x\n y ? ;')[2]).toEqual([T.Special, '? x\n y ?']);
    expect(lexed('a = ? x ; y ? ;').slice(2, 5)).toEqual([
      [T.Question, '?'],
      [T.Id, 'x'],
      [T.Semi, ';'],
    ]);
    expect(lexed('a = ?  ? ;').slice(2, 4)).toEqual([
      [T.Question, '?'],
      [T.Question, '?'],
    ]);
  });

  it('reads `(*` as a comment only when it is closed', () => {
    expect(lexed('(* c *) a')).toEqual([
      [T.IsoComment, '(* c *)'],
      [T.Id, 'a'],
    ]);
    expect(lexed('a = (* b')).toEqual([
      [T.Id, 'a'],
      [T.Equals, '='],
      [T.LParen, '('],
      [T.Star, '*'],
      [T.Id, 'b'],
    ]);
  });

  it('reads `-` as an exception unless a YAML block starts there', () => {
    expect(lexed('a = b - c ;').slice(2, 5)).toEqual([
      [T.Id, 'b'],
      [T.Minus, '-'],
      [T.Id, 'c'],
    ]);
    expect(lexed('---\nx: 1\n---\na')).toEqual([
      [T.Yaml, '---\nx: 1\n---\n'],
      [T.Id, 'a'],
    ]);
  });

  it('reads `[a-z]` as an option around the name `a-z`', () => {
    expect(lexed('a = [a-z] ;').slice(2, 5)).toEqual([
      [T.LBracket, '['],
      [T.Id, 'a-z'],
      [T.RBracket, ']'],
    ]);
  });

  it('rejects W3C `#x20` and `#` comments, and `:=`', () => {
    expect(lexed('a = #x20 ;')[2]).toEqual([Kind.Error, '#']);
    expect(lexed('a := "x" ;')[1]).toEqual([Kind.Error, ':']);
    expect(lexed('a ::= "x" ;')[1]).toEqual([T.Define, '::=']);
  });

  it('splits a name that starts with `title`', () => {
    expect(lexed('a = titles ;').slice(2, 4)).toEqual([
      [T.Title, 'title'],
      [T.Id, 's'],
    ]);
  });
});
