// #362, D609: a `state` line with several words gives one warning for the line. v12's lexer
// reads each word as its own `state X`, and v13 draws the same; only the warnings change.
import { describe, expect, it } from 'vitest';
import { parseState } from '../index.ts';

const lines = (...body: string[]) => ['stateDiagram-v2', ...body].join('\n') + '\n';

/** Each warning as `code: source text it covers`. */
function warnings(src: string): string[] {
  return parseState(src)
    .diagnostics.filter((d) => d.severity === 'warning')
    .map((d) => `${d.code}: ${src.slice(d.range.start, d.range.end)}`);
}

const messages = (src: string) =>
  parseState(src)
    .diagnostics.filter((d) => d.code === 'STATE_NOT_DRAWN')
    .map((d) => d.message);

const drawn = (src: string) => parseState(src).model.states.map((s) => s.id);

describe('a `state` line with several words (#362)', () => {
  const sample = lines(
    ' [*] --> State1',
    ' State1 --> State2',
    ' state State1: Description 1',
    ' state State2: Description 2',
    ' State2 --> [*]'
  );

  it('gives one warning per line for the issue sample, naming State1 and State2', () => {
    expect(warnings(sample)).toEqual([
      'STATE_NOT_DRAWN: state State1: Description 1',
      'STATE_NOT_DRAWN: state State2: Description 2',
    ]);
    expect(messages(sample)).toEqual([
      '`state State1: Description 1` is not read: `state` takes no description, so the text after `:` is not drawn (v12 ignores it too). Write `State1 : Description 1`, without `state`.',
      '`state State2: Description 2` is not read: `state` takes no description, so the text after `:` is not drawn (v12 ignores it too). Write `State2 : Description 2`, without `state`.',
    ]);
  });

  it('draws what v12 draws: the states, without the text', () => {
    expect(drawn(sample)).toEqual(['root_start', 'State1', 'State2', 'root_end']);
    expect(parseState(sample).model.states.map((s) => s.descriptions)).toEqual([[], [], [], []]);
  });

  it('names the state without the colon as a symbol, so a rename keeps the colon', () => {
    const r = parseState(sample);
    const at = sample.indexOf('state State1:') + 'state '.length;
    const symbol = r.symbols.find((s) => s.range.start === at);
    expect(symbol && [symbol.name, sample.slice(symbol.range.start, symbol.range.end)]).toEqual([
      'State1',
      'State1',
    ]);
  });

  it('reads `state X : text`, with a blank before the colon, the same way', () => {
    expect(messages(lines('  A --> B', '  state A : go'))).toEqual([
      '`state A : go` is not read: `state` takes no description, so the text after `:` is not drawn (v12 ignores it too). Write `A : go`, without `state`.',
    ]);
  });

  it('gives one warning for `state A B`, naming A', () => {
    const src = lines('  state A B');
    expect(warnings(src)).toEqual(['STATE_NOT_DRAWN: state A B']);
    expect(messages(src)).toEqual([
      '`state A B` declares nothing: v12 reads each word after `state` as a `state X` line of its own, and those draw nothing. Write one state per line, and mention it in a transition or give it a description, e.g. `A : text`.',
    ]);
    expect(drawn(src)).toEqual([]);
  });

  it('still gives one warning when a word of the line is drawn elsewhere', () => {
    const src = lines('  A --> C', '  state A B');
    expect(warnings(src)).toEqual(['STATE_NOT_DRAWN: state A B']);
    expect(drawn(src)).toEqual(['A', 'C']);
    expect(warnings(lines('  A --> B', '  state A B'))).toEqual(['STATE_NOT_DRAWN: state A B']);
  });

  it('gives one warning for `state X: text` inside a composite', () => {
    const src = lines('  state Outer {', '    [*] --> X', '    state X: inside', '  }');
    expect(warnings(src)).toEqual(['STATE_NOT_DRAWN: state X: inside']);
    expect(messages(src)[0]).toContain('Write `X : inside`, without `state`.');
    expect(drawn(src)).toEqual(['Outer', 'Outer_start', 'X']);
  });

  it('keeps one warning per line for consecutive `state` lines', () => {
    expect(warnings(lines('  state A', '  state B C'))).toEqual([
      'STATE_NOT_DRAWN: state A',
      'STATE_NOT_DRAWN: state B C',
    ]);
  });
});

describe('`state` lines that are not affected', () => {
  it('keeps the message for `state A` alone', () => {
    const src = lines('  state A');
    expect(warnings(src)).toEqual(['STATE_NOT_DRAWN: state A']);
    expect(messages(src)).toEqual([
      '`state A` on its own declares nothing, so `A` is not drawn: mention it in a transition or give it a description, e.g. `A : text`.',
    ]);
    expect(warnings(lines('  A --> B', '  state A'))).toEqual([]);
  });

  it('gives no warning for `state "long" as X`, `state X {`, `state X <<fork>>` or `X : text`', () => {
    expect(warnings(lines('  state "a long name" as X', '  X --> Y'))).toEqual([]);
    expect(warnings(lines('  state X {', '    A --> B', '  }'))).toEqual([]);
    expect(warnings(lines('  state F <<fork>>', '  [*] --> F', '  F --> A'))).toEqual([]);
    const described = lines('  X : some text', '  X --> Y');
    expect(warnings(described)).toEqual([]);
    expect(parseState(described).model.states.find((s) => s.id === 'X')?.descriptions).toEqual([
      'some text',
    ]);
  });
});
