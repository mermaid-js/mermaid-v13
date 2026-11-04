import { describe, expect, it } from 'vitest';
import { parseState } from '../index.ts';

const errors = (src: string) =>
  parseState(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('state parse', () => {
  it('builds states and transitions, with start and end scoped per composite', () => {
    const { model } = parseState(
      'stateDiagram-v2\n  [*] --> A\n  A --> B : go\n  state X {\n    [*] --> C\n    C --> [*]\n  }\n'
    );
    expect(model.states.map((s) => [s.id, s.kind, s.parent])).toEqual([
      ['root_start', 'start', undefined],
      ['A', 'plain', undefined],
      ['B', 'plain', undefined],
      ['X', 'composite', undefined],
      ['X_start', 'start', 'X'],
      ['C', 'plain', 'X'],
      ['X_end', 'end', 'X'],
    ]);
    expect(model.transitions.map((t) => [t.from, t.to, t.label])).toEqual([
      ['root_start', 'A', ''],
      ['A', 'B', 'go'],
      ['X_start', 'C', ''],
      ['C', 'X_end', ''],
    ]);
    expect(errors('stateDiagram-v2\n  A --> B\n')).toEqual([]);
  });
});
