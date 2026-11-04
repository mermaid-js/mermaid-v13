import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { flowchartTokens, parseFlowchart } from '../index.ts';
import { flowSourceView, lex } from './lexer.ts';
import { T } from './tokens.ts';

const errors = (src: string) =>
  parseFlowchart(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.message);

const stream = (src: string) => {
  const pre = preprocess(src);
  const view = flowSourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const s = lex(src, pre.bodyStart, view);
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j],
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};

// v12 removed comment lines and directives before lexing; v13 lexes the same text.
describe('tokens across removed comment lines', () => {
  it('matches a link however many comment lines come before it', () => {
    const src = 'flowchart LR\nA\n' + '%% c\n'.repeat(9) + '--> B';
    expect(errors(src)).toEqual([]);
    expect(parseFlowchart(src).model.edges.map((e) => [e.start, e.end])).toEqual([['A', 'B']]);
  });

  it('reads a direction statement split by a comment line', () => {
    const src = 'flowchart LR\nsubgraph S\ndirection\n%% c\nTB\nA\nend';
    const { model } = parseFlowchart(src);
    expect(errors(src)).toEqual([]);
    expect(model.vertices.map((v) => v.id)).toEqual(['A']);
    expect(model.subgraphs[0]?.dir).toBe('TB');
  });

  it('accepts callback arguments split by a comment line', () => {
    const src = 'flowchart LR\nA\nclick A call f(\n%% c\n1)';
    expect(errors(src)).toEqual([]);
  });

  it('gives a token split by a comment line one token, spanning it', () => {
    const src = 'flowchart LR\nA["a\n%% c\nb"]';
    const strs = flowchartTokens(src).filter((t) => t.kind === T.Str);
    expect(strs).toHaveLength(1);
    expect(strs[0]?.text).toBe('a\nb');
    const lexed = stream(src).filter((t) => t.kind === T.Str);
    expect(lexed).toHaveLength(1);
  });

  it('gives each comment its own range, in source order', () => {
    const src = 'flowchart LR\nA -->\n%% a\n%% b\n  B';
    const tokens = stream(src);
    const comments = tokens.filter((t) => t.kind === Kind.Comment);
    expect(comments.map((t) => src.slice(t.start, t.end))).toEqual(['%% a\n', '%% b\n']);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('ends a token at its last character, not inside a removed span', () => {
    const src = 'flowchart LR\nA -->\n%% a\nB';
    const link = stream(src).find((t) => t.kind === T.Link);
    expect(src.slice(link?.start, link?.end)).toBe(' -->\n');
  });
});
