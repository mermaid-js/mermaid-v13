import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { railroadTokens } from '../index.ts';
import { T } from '../tokens.ts';

/**
 * The PEG quirks spec #526 lists (D513), one token per v12 token: each stream is what 2.0.1's
 * `RailroadPeg` lexer gives for the same text (probed), with `Error` where it reports an error.
 * The full gate is `packages/conformance/src/railroad/lexer-parity-peg.spec.ts`.
 */
const lexed = (body: string) =>
  railroadTokens('railroadPeg', `railroad-peg-beta\n${body}`)
    .slice(1)
    .map((t) => [t.kind, t.text]);

describe('PEG lexer quirks (D513)', () => {
  it('reads predicates, suffixes and the any character', () => {
    expect(lexed('a <- !(b c) &d .* ;')).toEqual([
      [T.Id, 'a'],
      [T.Arrow, '<-'],
      [T.Bang, '!'],
      [T.LParen, '('],
      [T.Id, 'b'],
      [T.Id, 'c'],
      [T.RParen, ')'],
      [T.Amp, '&'],
      [T.Id, 'd'],
      [T.Dot, '.'],
      [T.Star, '*'],
      [T.Semi, ';'],
    ]);
  });

  it('lexes `!!x` and `B?*`, which the grammar rejects', () => {
    expect(lexed('a <- !!x B?*').slice(2)).toEqual([
      [T.Bang, '!'],
      [T.Bang, '!'],
      [T.Id, 'x'],
      [T.Id, 'B'],
      [T.Question, '?'],
      [T.Star, '*'],
    ]);
  });

  it('rejects character classes, `=` and a split `< -`', () => {
    expect(lexed('a <- [a-z] ;')[2]).toEqual([Kind.Error, '[']);
    expect(lexed('a = "x" ;')[1]).toEqual([Kind.Error, '=']);
    expect(lexed('a < - "x" ;')[1]).toEqual([Kind.Error, '<']);
  });

  it('reads `#` to the line end as a comment', () => {
    expect(lexed('# c\na <- b # d ;\n;')).toEqual([
      [T.HashComment, '# c'],
      [T.Id, 'a'],
      [T.Arrow, '<-'],
      [T.Id, 'b'],
      [T.HashComment, '# d ;'],
      [T.Semi, ';'],
    ]);
  });

  it('splits a name that starts with `title`', () => {
    expect(lexed('titleCase <- "x" ;').slice(0, 2)).toEqual([
      [T.Title, 'title'],
      [T.Id, 'Case'],
    ]);
  });
});
