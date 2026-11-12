import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { railroadTokens } from '../index.ts';
import { T } from '../tokens.ts';

/**
 * The IR quirks spec #526 lists (D513), one token per v12 token: each stream is what 2.0.1's
 * `Railroad` lexer gives for the same text (probed), with `Error` where it reports an error. The
 * full gate is `packages/conformance/src/railroad/lexer-parity-ir.spec.ts`.
 */
const lexed = (body: string) =>
  railroadTokens('railroad', `railroad-beta\n${body}`)
    .slice(1)
    .map((t) => [t.kind, t.text]);

describe('IR lexer quirks (D513)', () => {
  it('reads a keyword as a keyword, so it cannot name a rule', () => {
    expect(lexed('choice = terminal("x") ;').slice(0, 3)).toEqual([
      [T.KwChoice, 'choice'],
      [T.Equals, '='],
      [T.KwTerminal, 'terminal'],
    ]);
  });

  it('reads a keyword followed by a name character as a name', () => {
    expect(lexed('sequenceX choices terminal-x optional_ choice(')).toEqual([
      [T.Id, 'sequenceX'],
      [T.Id, 'choices'],
      [T.Id, 'terminal-x'],
      [T.Id, 'optional_'],
      [T.KwChoice, 'choice'],
      [T.LParen, '('],
    ]);
  });

  it('splits a name that starts with `title`', () => {
    expect(lexed('titleCase = terminal("x") ;').slice(0, 2)).toEqual([
      [T.Title, 'title'],
      [T.Id, 'Case'],
    ]);
    // `title` then a blank takes the rest of the line.
    expect(lexed('title = terminal("x") ;')).toEqual([[T.Title, 'title = terminal("x") ;']]);
    expect(lexed('title-x = terminal("x") ;').slice(0, 2)).toEqual([
      [T.Title, 'title'],
      [Kind.Error, '-'],
    ]);
  });

  it('lexes bare identifiers and trailing commas, which the grammar rejects', () => {
    expect(lexed('a = b ;')).toEqual([
      [T.Id, 'a'],
      [T.Equals, '='],
      [T.Id, 'b'],
      [T.Semi, ';'],
    ]);
    expect(lexed('a = sequence(terminal("x"),) ;').slice(-3)).toEqual([
      [T.Comma, ','],
      [T.RParen, ')'],
      [T.Semi, ';'],
    ]);
  });

  it('reads `\\` escapes in either quote, and no `\\` before a line end', () => {
    expect(lexed(`a = terminal('it\\'s') ;`)[4]).toEqual([T.String, `'it\\'s'`]);
    expect(lexed('a = terminal("x\\\ny") ;')[4]).toEqual([Kind.Error, '"']);
    // A string may span lines.
    expect(lexed('a = terminal("x\ny") ;')[4]).toEqual([T.String, '"x\ny"']);
  });

  it('reads `/* */` as a comment, and an unclosed one as an error', () => {
    expect(lexed('/* c\n d */ a')).toEqual([
      [T.BlockComment, '/* c\n d */'],
      [T.Id, 'a'],
    ]);
    expect(lexed('a /* never')).toEqual([
      [T.Id, 'a'],
      [Kind.Error, '/*'],
      [T.Id, 'never'],
    ]);
  });
});
