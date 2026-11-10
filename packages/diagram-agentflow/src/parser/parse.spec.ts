import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { semanticModel } from '../semantic.ts';
import type { AgentflowFlow, AgentflowStatementNode } from './ast.ts';
import { parseAgentflow } from './parser.ts';
import type { AgentflowParseOptions } from './parser.ts';
import type { AgentflowParseWarning } from './model.ts';

const af = (...lines: string[]) => ['agentflow-beta', ...lines].join('\n');
const parse = (src: string, options?: AgentflowParseOptions) => parseAgentflow(src, options);
const errors = (src: string) =>
  parse(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);
/** `[code, 1-based line, the text the range covers]` of every warning. */
const warnings = (src: string) => {
  const lines = new LineIndex(src);
  return parse(src)
    .diagnostics.filter((d) => d.severity === 'warning')
    .map((d) => [
      d.code,
      lines.position(d.range.start).line + 1,
      src.slice(d.range.start, d.range.end),
    ]);
};

describe('agentflow model', () => {
  it('reads kinds from the vertex record and draws the six shapes', () => {
    const { model } = parse(
      af(
        ' a@{ shape: task }',
        ' b@{ shape: tool }',
        ' c@{ shape: input }',
        ' d@{ shape: decision }',
        ' e@{ shape: refdoc }',
        ' f@{ shape: action }',
        ' g[x] --> h[[y]] --> i{z} --> j{{w}} --> k[/v/]',
        ' connector gh'
      )
    );
    const by = Object.fromEntries(model.vertices.map((v) => [v.id, [v.kind, v.shape]]));
    expect(by).toEqual({
      a: ['task', 'rounded'],
      b: ['tool', 'fr-rect'],
      c: ['input', 'lean-r'],
      d: ['decision', 'diam'],
      e: ['refdoc', 'lin-doc'],
      f: ['action', 'hex'],
      g: ['task', 'rounded'],
      h: ['tool', 'fr-rect'],
      i: ['decision', 'diam'],
      j: ['action', 'hex'],
      // D462: the parallelogram of kind input, after v12's fix.
      k: ['input', 'lean-r'],
      gh: ['connector', 'rounded'],
    });
    expect(model.connectors).toEqual(['gh']);
  });

  it('gives each edge its semantic', () => {
    const { model } = parse(af(' a --> b', ' a --x c', ' a -.- d', ' a -- yes --> e', ' a ---> f'));
    expect(model.edges.map((e) => [e.end, e.type, e.stroke, e.semantic, e.length])).toEqual([
      ['b', 'arrow_point', 'normal', 'sequence', 1],
      ['c', 'arrow_cross', 'normal', 'failure', 1],
      ['d', 'arrow_open', 'dotted', 'reference', 1],
      ['e', 'arrow_point', 'normal', 'sequence', 1],
      ['f', 'arrow_point', 'normal', 'sequence', 2],
    ]);
  });

  it('builds the flow tree, collapsed flows and globals', () => {
    const { model } = parse(
      af(
        'flow outer[Outer]',
        ' flow inner@{ view: collapsed, owner: me }',
        '  a --> b',
        ' end',
        ' c --> g',
        'end',
        'global',
        ' g',
        'end'
      )
    );
    expect(model.flows.map((f) => [f.id, f.title, f.parent, f.collapsed, f.nodes])).toEqual([
      ['inner', '', 'outer', true, ['b', 'a']],
      ['outer', 'Outer', undefined, false, ['inner', 'c']],
    ]);
    expect(model.flows[0]?.metadata).toEqual({ view: 'collapsed', owner: 'me' });
    const v = Object.fromEntries(model.vertices.map((x) => [x.id, [x.parent, x.collapsedInto]]));
    expect(v).toEqual({
      a: ['inner', 'inner'],
      b: ['inner', 'inner'],
      c: ['outer', undefined],
      g: [undefined, undefined],
    });
    expect(model.globals).toEqual(['g']);
  });

  it('reads the front-matter title, accessibility texts and the direction', () => {
    const { model } = parse(
      '---\ntitle: Pipeline\n---\n' + af(' accTitle: T', ' accDescr: D', ' a')
    );
    expect([model.title, model.accTitle, model.accDescr, model.direction]).toEqual([
      'Pipeline',
      'T',
      'D',
      'TB',
    ]);
    expect(parse('agentflow-beta >\n a').model.direction).toBe('LR');
  });

  it('inherits the diagram direction into flows with flowchart.inheritDir (D466)', () => {
    const src = 'agentflow-beta LR\n direction BT\n flow f\n a\n end';
    expect(parse(src).model.flows[0]?.dir).toBeUndefined();
    // A top-level `direction` does not change the diagram's, so it is not inherited either.
    expect(parse(src, { inheritDir: true }).model.flows[0]?.dir).toBe('LR');
  });

  it('reads a commented-out `direction` as a direction, as v12 did', () => {
    const src = af('flow f', ' %% direction LR', ' a', 'end');
    expect(parse(src).model.flows[0]?.dir).toBe('LR');
    // Past maxTextSize v12 parsed the text without comments: the line is a comment there.
    expect(parse(src, { maxTextSize: 10 }).model.flows[0]?.dir).toBeUndefined();
  });

  it('keeps the edge whose end is the reserved `connectors` id', () => {
    const { model } = parse(af(' connectors --> b'));
    expect(model.vertices.map((v) => v.id)).toEqual(['b']);
    expect(model.edges.map((e) => [e.start, e.end])).toEqual([['connectors', 'b']]);
  });
});

describe('agentflow AST and symbols (D468)', () => {
  const ids = (nodes: readonly AgentflowStatementNode[]): string[] =>
    nodes.flatMap((n) => [
      n.id,
      ...('children' in n ? ids(n.children as AgentflowStatementNode[]) : []),
    ]);

  it('names vertices, edges, flows, globals and connectors', () => {
    const { ast } = parse(
      af(
        ' a --> b',
        ' a --> b',
        'flow f',
        ' c',
        'end',
        'flow f',
        ' d',
        'end',
        'flow',
        ' e',
        'end',
        'global',
        ' g',
        'end',
        ' gh --> a',
        ' connector gh'
      )
    );
    expect(ids(ast.children)).toEqual([
      'header:1',
      'chain:1',
      'n:a',
      'n:b',
      'e:a>b',
      'chain:2',
      'n:a@2',
      'n:b@2',
      'e:a>b#2',
      's:f',
      'chain:3',
      'n:c',
      's:f@2',
      'chain:4',
      'n:d',
      's:subGraph2',
      'chain:5',
      'n:e',
      'global:1',
      'chain:6',
      'n:g',
      'chain:7',
      'n:gh',
      'n:a@3',
      'e:gh>a',
      'n:gh@2',
    ]);
  });

  it('keeps the first opening as the model id and the connector statement for a connector', () => {
    const { model } = parse(
      af('flow f', ' a', 'end', 'flow f', ' b', 'end', ' gh --> a', ' connector gh')
    );
    expect(model.flows[0]?.ast).toBe('s:f');
    expect(model.vertices.find((v) => v.id === 'gh')?.ast).toBe('n:gh@2');
  });

  it('gives a flow its opener range', () => {
    const src = af('flow f[Title]@{ owner: me } %% c', ' a', 'end');
    const flow = parse(src).ast.children[1] as AgentflowFlow;
    expect(src.slice(flow.openerRange.start, flow.openerRange.end)).toBe(
      'flow f[Title]@{ owner: me }'
    );
    expect(src.slice(flow.range.start, flow.range.end)).toBe(
      'flow f[Title]@{ owner: me } %% c\n a\nend'
    );
  });

  it('puts vertices, connectors and flows in one namespace, and classes in another', () => {
    const { symbols } = parse(
      af('flow f', ' a:::hot', 'end', 'connector gh', 'classDef hot fill:red')
    );
    expect(symbols.map((s) => [s.name, s.kind, s.role])).toEqual([
      ['a', 'node', 'def'],
      ['hot', 'class', 'ref'],
      ['f', 'subgraph', 'def'],
      ['gh', 'node', 'def'],
      ['hot', 'class', 'def'],
    ]);
  });
});

describe('agentflow diagnostics (D461)', () => {
  it('reports removed and unsupported shapes at their bracket or block, as warnings', () => {
    expect(warnings(af(' a((x))', ' b@{ shape: triangle }', ' c[(y)] --> d'))).toEqual([
      ['SHAPE_REMOVED', 2, '((x))'],
      ['SHAPE_UNSUPPORTED', 3, '@{ shape: triangle }'],
      ['SHAPE_REMOVED', 4, '[(y)]'],
    ]);
    expect(errors(af(' a((x))'))).toEqual([]);
  });

  it('leaves out what a collapsed flow hides', () => {
    expect(warnings(af('flow f@{ view: collapsed }', ' a((x))', 'end'))).toEqual([]);
  });

  it('cuts a containment cycle at the inner flow opener', () => {
    const src = af('flow A', ' a1 --> B', 'end', 'flow B', ' b1 --> A', 'end');
    expect(warnings(src)).toEqual([['CONTAINMENT_VIOLATION', 5, 'flow B']]);
    const { model } = parse(src);
    expect(model.flows.map((f) => [f.id, f.parent])).toEqual([
      ['A', 'B'],
      ['B', undefined],
    ]);
    expect(semanticModel(model).diagnostics).toEqual([
      {
        id: 'CONTAINMENT_VIOLATION',
        severity: 'warning',
        message:
          'Container "A" cannot contain "B" because "B" already contains it. The nesting that would close the loop is dropped.',
        nodeId: 'B',
      },
    ]);
  });

  it('reports a cycle at the nested opening that closes it, naming both openings (D461, US3)', () => {
    // The second `flow B` holds the second `flow A`: that `flow A` closes the loop, not the
    // first `flow A`, which `B` was nested in.
    const src = af('flow A', ' flow B', ' end', 'end', 'flow B', ' flow A', ' end', 'end');
    expect(warnings(src)).toEqual([['CONTAINMENT_VIOLATION', 7, 'flow A']]);
    const [d] = parse(src).diagnostics as AgentflowParseWarning[];
    expect(d?.astIds).toEqual(['s:A@2', 's:B@2']);
    expect(d?.message).toBe(
      'Container "B" cannot contain "A" because "A" already contains it. The nesting that would close the loop is dropped.'
    );
    // Listed by name only, the contained flow is reported at its first opening.
    const named = af('flow A', ' a1 --> B', 'end', 'flow B', ' b1 --> A', 'end');
    expect((parse(named).diagnostics as AgentflowParseWarning[]).map((w) => w.astIds)).toEqual([
      ['s:B', 's:A'],
    ]);
  });

  it('names the vertex whose shape is drawn as the default, at the mention that set it', () => {
    const src = af(' a', ' b((x))', ' a@{ shape: triangle }');
    expect(
      (parse(src).diagnostics as AgentflowParseWarning[]).map((d) => [d.code, d.astIds])
    ).toEqual([
      ['SHAPE_REMOVED', ['n:b']],
      ['SHAPE_UNSUPPORTED', ['n:a@2']],
    ]);
  });

  it('gives an out-of-range linkStyle v12 bounds message', () => {
    const { diagnostics } = parse(af(' a --> b', ' linkStyle 4 stroke:red'));
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        'LINK_STYLE_INDEX',
        'The index 4 for linkStyle is out of bounds. Valid indices for linkStyle are between 0 and 0. (Help: Ensure that the index is within the range of existing edges.)',
      ],
    ]);
  });

  it('stops at the edge limit', () => {
    expect(errors(af(' a & b & c --> d & e', ' f --> g'))).toEqual([]);
    expect(
      parseAgentflow(af(' a & b & c --> d & e'), { maxEdges: 5 }).diagnostics[0]?.message
    ).toMatch(/^Edge limit exceeded/);
  });

  it('rejects a comment right after the header keyword', () => {
    expect(errors(af(' a').replace('beta', 'beta %% c'))).toEqual(['HEADER_COMMENT']);
    expect(errors('agentflow-beta LR %% c\n a')).toEqual([]);
  });

  it('names the trailing comma a plain shape name keeps (D464)', () => {
    const { diagnostics } = parse(af(' a@{', '  shape: tool,', '  x: 1', ' }'));
    expect(diagnostics.map((d) => d.message)).toEqual([
      'No such shape: tool,. The comma is part of the name: remove it (`shape: tool`), or quote the name (`shape: "tool",`).',
    ]);
    // Quoted, the comma ends the value, and v12's retry without line-ending commas reads it.
    const quoted = parse(af(' a@{', '  shape: "tool",', '  x: 1,', ' }'));
    expect(quoted.diagnostics).toEqual([]);
    expect(quoted.model.vertices[0]?.metadata).toEqual({ shape: 'subroutine', x: 1 });
  });
});

describe('agentflow silent drops (D464)', () => {
  it('warns once per kind, with the other places in related', () => {
    const src = af(
      'f@{ view: collapsed }',
      'g@{ owner: x }',
      'flow f',
      ' a@{ view: collapsed }',
      'end',
      'flow g',
      ' b',
      'end',
      ' connectors --> a',
      ' gh --> b',
      ' connector gh'
    );
    const { diagnostics } = parse(src);
    const lines = new LineIndex(src);
    const line = (at: number) => lines.position(at).line + 1;
    expect(
      diagnostics.map((d) => [
        d.code,
        line(d.range.start),
        (d.related ?? []).map((r) => line(r.range.start)),
      ])
    ).toEqual([
      ['AGENTFLOW_METADATA_DROPPED', 2, [3]],
      ['AGENTFLOW_VIEW_IGNORED', 5, []],
      ['AGENTFLOW_RESERVED_ID', 10, []],
      ['AGENTFLOW_CONNECTOR_REPLACED', 12, []],
    ]);
    expect(diagnostics.every((d) => d.severity === 'warning')).toBe(true);
    // Each lists every element it is about, repeats included, for the render warning.
    expect((diagnostics as AgentflowParseWarning[]).map((d) => [d.code, d.astIds])).toEqual([
      ['AGENTFLOW_METADATA_DROPPED', ['n:f', 'n:g']],
      ['AGENTFLOW_VIEW_IGNORED', ['n:a']],
      ['AGENTFLOW_RESERVED_ID', ['n:connectors']],
      ['AGENTFLOW_CONNECTOR_REPLACED', ['n:gh@2']],
    ]);
    // The model is v12's: the metadata is gone, `view` does nothing, the connector replaced `gh`.
    const { model } = parse(src);
    expect(model.flows.map((f) => [f.id, f.collapsed, f.metadata])).toEqual([
      ['f', false, undefined],
      ['g', false, undefined],
    ]);
    expect(model.vertices.find((v) => v.id === 'gh')).toMatchObject({
      connector: true,
      text: 'gh',
    });
  });

  it('reads a label that is not text as v12 did, and warns (pitfall 10)', () => {
    const src = af(
      ' a@{ label: 5 }',
      ' b@{ label: [1, 2] }',
      ' c@{',
      '  label:',
      '    x: 1',
      ' }',
      ' d@{ label: x, labelType: bogus }',
      ' e@{ label: x, labelType: string }'
    );
    const { model } = parse(src);
    expect(model.vertices.map((v) => [v.text, v.labelType])).toEqual([
      ['5', 'markdown'],
      ['1,2', 'markdown'],
      ['[object Object]', 'markdown'],
      ['x', 'markdown'],
      ['x', 'string'],
    ]);
    expect(warnings(src).map(([code, line]) => [code, line])).toEqual([
      ['NODE_DATA_COERCED', 2],
      ['NODE_DATA_COERCED', 3],
      ['NODE_DATA_COERCED', 4],
      ['NODE_DATA_COERCED', 8],
    ]);
  });

  it('says nothing when `connectors` is a flow or a connector', () => {
    expect(warnings(af('connector connectors', ' connectors --> b'))).toEqual([]);
  });
});

describe('semanticModel (D465)', () => {
  it('is v12 getSemanticModel(), and leaves the model as it is', () => {
    const { model } = parse(
      af(
        'connector gh[GitHub]@{ protocol: mcp, icon: x }',
        'flow f[F]@{ owner: me, view: collapsed }',
        ' a@{ shape: tool, retries: 3 }',
        ' a e1@--> b',
        'end',
        'e1@{ instruction: go }'
      )
    );
    const before = JSON.stringify(model);
    expect(semanticModel(model)).toEqual({
      vertices: [
        { id: 'a', label: 'a', shape: 'subroutine', vertexKind: 'tool', metadata: { retries: 3 } },
        { id: 'b', label: 'b', vertexKind: 'task' },
      ],
      edges: [
        {
          start: 'a',
          end: 'b',
          id: 'e1',
          type: 'arrow_point',
          stroke: 'normal',
          edgeSemantic: 'sequence',
          length: 1,
          metadata: { instruction: 'go' },
        },
      ],
      subGraphs: [
        { id: 'f', nodes: ['a', 'b'], type: 'flow', title: 'F', metadata: { owner: 'me' } },
      ],
      connectors: [{ id: 'gh', title: 'GitHub', metadata: { protocol: 'mcp' } }],
      diagnostics: [],
      direction: 'TB',
    });
    expect(JSON.stringify(model)).toBe(before);
  });
});
