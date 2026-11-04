import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { JISON_NAMES, stateTokens, StateTokenKind as T } from '../index.ts';

const shown = (src: string) =>
  stateTokens(src).map((t) => [
    JISON_NAMES[t.kind] ?? t.kind,
    t.text,
    src.slice(t.range.start, t.range.end),
  ]);

describe('state lexer tokens', () => {
  it('maps each token to its source range across CRLF and removed comment lines', () => {
    const src = 'stateDiagram-v2\r\n  %% gone\r\n  A --> B : go\r\n';
    expect(shown(src)).toEqual([
      ['SD', 'stateDiagram-v2\n  ', 'stateDiagram-v2\r\n  %% gone\r\n  '],
      ['ID', 'A', 'A'],
      ['-->', '-->', '-->'],
      ['ID', 'B', 'B'],
      ['DESCR', ': go', ': go'],
      ['NL', '\n', '\r\n'],
      ['NL', '', ''],
    ]);
  });

  it('starts after front matter and leaves directives out', () => {
    const src = '---\ntitle: x\n---\n%%{init: {}}%%\nstateDiagram\n  A\n';
    const tokens = stateTokens(src);
    expect(tokens[0]?.kind).toBe(T.Sd);
    expect(src.slice(tokens[0]?.range.start, tokens[0]?.range.end)).toBe('stateDiagram\n  ');
  });

  it('keeps tokens for text jison consumes without one', () => {
    const src = 'stateDiagram-v2\n  state f <<fork>>\n  state "d" as X\n';
    expect(stateTokens(src).map((t) => [t.kind, t.text])).toEqual([
      [T.Sd, 'stateDiagram-v2\n  '],
      [T.State, 'state '],
      [T.Fork, 'f'],
      [T.Marker, '<<fork>>'],
      [Kind.Newline, '\n'],
      [T.State, 'state '],
      [T.Quote, '"'],
      [T.StateDescr, 'd'],
      [T.Quote, '"'],
      // Blanks are skipped before `as`; the last line break only leaves the `state` condition.
      [T.As, 'as '],
      [T.Id, 'X'],
      [Kind.Newline, ''],
      [T.EndOfInput, ''],
    ]);
  });

  it('writes an error token where v12 threw, and goes on', () => {
    const kinds = stateTokens('stateDiagram-v2\n  state a b {\n  C\n  }\n').map((t) => t.kind);
    expect(kinds).toContain(T.MultiWordState);
    expect(kinds).toContain(T.StructStart);
    expect(kinds).toContain(T.StructStop);
  });

  it('lexes in linear time on long lines (R-PARSE-7)', () => {
    const line = 'a '.repeat(50_000);
    const inputs = [
      `stateDiagram-v2\n  state ${line}\n`,
      `stateDiagram-v2\n  ${line}\n`,
      `stateDiagram-v2\n  note left of A\n${'x\n'.repeat(50_000)}`,
      `stateDiagram-v2\n  ${'direction '.repeat(20_000)}\n`,
      `stateDiagram-v2\n  ${'"'.repeat(50_000)}\n`,
    ];
    for (const src of inputs) {
      const t0 = Date.now();
      stateTokens(src);
      expect(Date.now() - t0).toBeLessThan(500);
    }
  });
});
