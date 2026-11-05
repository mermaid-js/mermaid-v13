import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import { flowchartTokens, FlowTokenKind as T, parseFlowchart } from '../index.ts';
import { flowSourceView } from './lexer.ts';

const errors = (src: string) =>
  parseFlowchart(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('v12 lexing details', () => {
  it('gives `click` a keyword token of its own, before the node id (#178)', () => {
    const src = 'flowchart LR\nA\nB\nclick  A call f()\nclick\tB "https://x.test"';
    const words = flowchartTokens(src)
      .filter((t) => t.kind === T.ClickKeyword || t.kind === T.Click)
      .map((t) => [
        t.kind === T.ClickKeyword ? 'keyword' : 'id',
        src.slice(t.range.start, t.range.end),
      ]);
    expect(words).toEqual([
      ['keyword', 'click'],
      ['id', 'A'],
      ['keyword', 'click'],
      ['id', 'B'],
    ]);
    // The parser reads the statement as before.
    expect(errors(src)).toEqual([]);
    expect(parseFlowchart(src).model.vertices.find((v) => v.id === 'B')?.link).toBe(
      'https://x.test'
    );
  });

  it('takes the whole CRLF after href, as v12 (which normalised CRLF) did', () => {
    const src = 'flowchart LR\r\nA\r\nclick A href\r\n"https://x.test"';
    expect(errors(src)).toEqual([]);
    expect(parseFlowchart(src).model.vertices.find((v) => v.id === 'A')?.link).toBe(
      'https://x.test'
    );
  });

  it('ignores a ; inside a same-line directive when dropping the style line’s last ;', () => {
    expect(errors('flowchart LR\nA\nstyle A fill:#f00; %%{init: {"a":"b;"}}%%')).toEqual([]);
  });

  it('keeps holes in source order when a comment ends inside a directive', () => {
    const src = 'flowchart LR\n%% c %%{init: {\n}}%%\nA';
    const pre = preprocess(src);
    const { holes } = flowSourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    const starts = holes.map((h) => h.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});
