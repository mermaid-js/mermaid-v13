import { describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { parseFlowchart } from '../index.ts';

const errors = (src: string) =>
  parseFlowchart(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);
const astIds = (node: AstNode): string[] => [
  node.id,
  ...((node as { children?: AstNode[] }).children ?? []).flatMap(astIds),
];

describe('subgraph headers (R-PARSE-4)', () => {
  it('reports one error for a broken header and keeps the body in the subgraph', () => {
    expect(errors('flowchart TD\nsubgraph A[unclosed\nB\nend')).toEqual(['UNCLOSED']);
    expect(errors('flowchart TD\nsubgraph A B]\nB\nend')).toHaveLength(1);
    const { model } = parseFlowchart('flowchart TD\nsubgraph A[unclosed\nB\nend\nC');
    expect(model.subgraphs.map((s) => [s.id, s.nodes])).toEqual([['A', ['B']]]);
  });
});

describe('AST ids (R-PARSE-8)', () => {
  it('gives a reopened subgraph its own id, and keeps the first on the model', () => {
    const { ast, model } = parseFlowchart('flowchart TD\nsubgraph A\nX\nend\nsubgraph A\nY\nend');
    const ids = astIds(ast);
    expect(ids).toContain('s:A');
    expect(ids).toContain('s:A@2');
    expect(new Set(ids).size).toBe(ids.length);
    expect(model.subgraphs.find((s) => s.id === 'A')?.ast).toBe('s:A');
  });
});

describe('fan-out and chains', () => {
  it('gives fan-out edges the ranges of their own ends', () => {
    const src =
      'flowchart LR\nA & B --> ' + Array.from({ length: 12 }, (_, i) => `c${i}`).join(' & ');
    const { ast } = parseFlowchart(src);
    const edges: { from: string; to: string; range: { start: number; end: number } }[] = [];
    const walk = (n: AstNode) => {
      if (n.type === 'Edge') edges.push(n as never);
      for (const c of (n as { children?: AstNode[] }).children ?? []) walk(c);
    };
    walk(ast);
    expect(edges).toHaveLength(24);
    for (const e of edges) {
      expect(src.slice(e.range.start, e.range.start + e.from.length)).toBe(e.from);
      expect(src.slice(e.range.end - e.to.length, e.range.end)).toBe(e.to);
    }
  });

  it('collects chain members into a subgraph in v12 order', () => {
    const { model } = parseFlowchart('flowchart LR\nsubgraph S\nA --> B --> C & D\nend');
    expect(model.subgraphs[0]?.nodes).toEqual(['C', 'D', 'B', 'A']);
  });
});

describe('limits', () => {
  it('reports how many edges were asked for', () => {
    const r = parseFlowchart('flowchart LR\nA & B & C --> D & E', { maxEdges: 3 });
    const d = r.diagnostics.find((x) => x.code === 'EDGE_LIMIT');
    expect(d?.message).toMatch(/asks for 6 edges, but the limit is 3/);
  });
});

describe('edge @{} data', () => {
  it('keeps typed values and drops others with a warning', () => {
    const r = parseFlowchart(
      'flowchart LR\nA e1@--> B\ne1@{ animate: "no", animation: "slow clickable x", curve: [1, 2] }\nC e2@--> D\ne2@{ animate: true, animation: slow, curve: basis }'
    );
    const e1 = r.model.edges.find((e) => e.id === 'e1');
    const e2 = r.model.edges.find((e) => e.id === 'e2');
    expect([e1?.animate, e1?.animation, e1?.interpolate]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect([e2?.animate, e2?.animation, e2?.interpolate]).toEqual([true, 'slow', 'basis']);
    expect(r.diagnostics.filter((d) => d.code === 'EDGE_DATA_DROPPED')).toHaveLength(3);
  });
});

describe('node properties', () => {
  it('keeps a __proto__ key as a key', () => {
    const { model } = parseFlowchart('flowchart LR\nA[|__proto__:x|lbl]');
    const props = model.vertices.find((v) => v.id === 'A')?.props ?? {};
    expect(Object.keys(props)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(props)).toBeNull();
  });
});

describe('listed members (v12 droppedSubGraphMembers, swimlane D536)', () => {
  const listed = (body: string) =>
    Object.fromEntries(
      parseFlowchart(`flowchart TD\n${body.split(';').join('\n')}`)
        .model.subgraphs.filter((s) => s.listed)
        .map((s) => [s.id, s.listed])
    );

  it('keeps every member a subgraph listed when an earlier subgraph kept one of them', () => {
    expect(listed('subgraph A;a;end;subgraph B;a;b;end')).toEqual({ B: ['a', 'b'] });
    // A subgraph listed in two others is a member too.
    expect(listed('subgraph S;x;end;subgraph A;S;end;subgraph B;S;end')).toEqual({ B: ['S'] });
    // Under a subgraph nested in another, and on a redeclaration (both declarations' lists).
    expect(listed('subgraph A;a;end;subgraph B;subgraph C;a;end;end')).toEqual({ C: ['a'] });
    expect(listed('subgraph A;a;end;subgraph B;b;end;subgraph B;a;end')).toEqual({ B: ['a'] });
  });

  it('is absent when the subgraph kept everything it listed', () => {
    expect(listed('subgraph A;a;end;subgraph B;b;end')).toEqual({});
  });
});
