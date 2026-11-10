import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { railroadTokens } from '../index.ts';
import { T } from '../tokens.ts';

/**
 * The ABNF quirks spec #526 lists (D513), one token per v12 token: each stream is what 2.0.1's
 * `RailroadAbnf` lexer gives for the same text (probed), with `Error` where it reports an error.
 * The full gate is `packages/conformance/src/railroad/lexer-parity-abnf.spec.ts`.
 */
const lexed = (body: string) =>
  railroadTokens('railroadAbnf', `railroad-abnf-beta\n${body}`)
    .slice(1)
    .map((t) => [t.kind, t.text]);

describe('ABNF lexer quirks (D513)', () => {
  it('reads `;` as a rule end only at the end of its line', () => {
    expect(lexed('a = "x" ;\nb = "y" ;')).toEqual([
      [T.Id, 'a'],
      [T.Equals, '='],
      [T.String, '"x"'],
      [T.Semi, ';'],
      [T.Id, 'b'],
      [T.Equals, '='],
      [T.String, '"y"'],
      [T.Semi, ';'],
    ]);
    // Anything after it on the line, a blank too, makes it a comment.
    expect(lexed('a = "x" ; b = "y" ;').slice(3)).toEqual([[T.SemiComment, '; b = "y" ;']]);
    expect(lexed('a = "x" ;  \nb')).toEqual([
      [T.Id, 'a'],
      [T.Equals, '='],
      [T.String, '"x"'],
      [T.SemiComment, ';  '],
      [T.Id, 'b'],
    ]);
  });

  it('errors on `_` in a name, and on `title-` names', () => {
    expect(lexed('a_b = "x"')).toEqual([
      [T.Id, 'a'],
      [Kind.Error, '_'],
      [T.Id, 'b'],
      [T.Equals, '='],
      [T.String, '"x"'],
    ]);
    expect(lexed('title-x = "x"').slice(0, 2)).toEqual([
      [T.Title, 'title'],
      [Kind.Error, '-'],
    ]);
  });

  it('reads numeric values with any base letter case, ranges and dot lists', () => {
    expect(lexed('a = %X4A %x41-5A %d13.10 %b0101 %x41- %x')).toEqual([
      [T.Id, 'a'],
      [T.Equals, '='],
      [T.NumVal, '%X4A'],
      [T.NumVal, '%x41-5A'],
      [T.NumVal, '%d13.10'],
      [T.NumVal, '%b0101'],
      [T.NumVal, '%x41'],
      [Kind.Error, '-'],
      [Kind.Error, '%'],
      [T.Id, 'x'],
    ]);
  });

  it('reads a repeat prefix, and digits alone as an exact repeat', () => {
    expect(lexed('a = 3*5b *c 1*d *1e 2f')).toEqual([
      [T.Id, 'a'],
      [T.Equals, '='],
      [T.Repeat, '3*5'],
      [T.Id, 'b'],
      [T.Repeat, '*'],
      [T.Id, 'c'],
      [T.Repeat, '1*'],
      [T.Id, 'd'],
      [T.Repeat, '*1'],
      [T.Id, 'e'],
      [T.ExactRepeat, '2'],
      [T.Id, 'f'],
    ]);
  });

  it('rejects `=/`, `<prose>`, `%s"x"` and `\'x\'` where 2.0.1 does', () => {
    expect(lexed('a =/ "x"').slice(1, 3)).toEqual([
      [T.Equals, '='],
      [T.Slash, '/'],
    ]);
    expect(lexed('a = <p>')[2]).toEqual([Kind.Error, '<']);
    expect(lexed('a = %s"x"').slice(2, 4)).toEqual([
      [Kind.Error, '%'],
      [T.Id, 's'],
    ]);
    expect(lexed("a = 'x'")[2]).toEqual([Kind.Error, "'"]);
  });

  it('reads a string with no escapes, over lines', () => {
    expect(lexed('a = "x\\" "y\nz"').slice(2)).toEqual([
      [T.String, '"x\\"'],
      [T.String, '"y\nz"'],
    ]);
  });
});
