import { describe, expect, it } from 'vitest';
import { Kind, LineIndex } from '@mermaid-js/core/parser-kit';
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import { flowchart, parseFlowchart } from '../index.ts';
import type { FlowNodeStmt, FlowParseOptions } from '../index.ts';

const parse = (src: string, options?: FlowParseOptions) => parseFlowchart(src, options);
const text = (src: string, r: Range) => src.slice(r.start, r.end);
const errors = (src: string) =>
  parse(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

/** AST ids grouped by node name (or `<Type>` for nodes without a name). */
function idsByName(root: AstNode): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const walk = (n: AstNode) => {
    const key = n.type === 'Node' ? (n as FlowNodeStmt).name : `<${n.type}>`;
    (out[key] ??= []).push(n.id);
    n.children?.forEach(walk);
  };
  walk(root);
  return out;
}

describe('flowchart parse', () => {
  it('does not warn STYLE_UNKNOWN_NODE for a style on a subgraph id, defined before or after', () => {
    const codes = (src: string) =>
      parse(src)
        .diagnostics.map((d) => d.code)
        .filter((c) => c === 'STYLE_UNKNOWN_NODE');
    expect(codes('flowchart TD\n  subgraph S\n    A\n  end\n  style S fill:red\n')).toEqual([]);
    expect(codes('flowchart TD\n  style S fill:red\n  subgraph S\n    A\n  end\n')).toEqual([]);
    expect(codes('flowchart TD\n  subgraph S\n    A\n  end\n  style T fill:red\n')).toEqual([
      'STYLE_UNKNOWN_NODE',
    ]);
  });

  it('puts click callbacks on the Click statement of the AST, not links (DESIGN §12.3)', () => {
    const r = parse(
      'flowchart LR\n  A --> B\n  click A callback "tip"\n  click B call go("x", 2)\n  click A "https://x.example"\n'
    );
    const clicks = (r.ast.children ?? []).filter((n) => n.type === 'Click');
    expect(clicks.map((n) => (n as { callback?: unknown }).callback)).toEqual([
      { targets: ['A'], name: 'callback' },
      { targets: ['B'], name: 'go', args: '"x", 2' },
      undefined,
    ]);
  });

  it('builds the model in insertion order', () => {
    const r = parse(
      [
        'flowchart LR',
        '  A[Start] -->|go| B(Next) & C{Choice}',
        '  classDef hot fill:#f00,color:#fff',
        '  class B hot',
        '  style C stroke:#333',
        '  subgraph S1 [Group]',
        '    direction TB',
        '    B',
        '  end',
        '  click A "https://example.com" "tip" _blank',
        '  linkStyle 0 stroke:blue',
        '  accTitle: Title',
      ].join('\n')
    );
    expect(r.diagnostics).toEqual([]);
    const m = r.model;
    expect(m.direction).toBe('LR');
    expect(m.vertices.map((v) => [v.id, v.text, v.type, v.ast])).toEqual([
      ['A', 'Start', 'square', 'n:A'],
      ['B', 'Next', 'round', 'n:B'],
      ['C', 'Choice', 'diamond', 'n:C'],
    ]);
    expect(m.edges.map((e) => [e.id, e.start, e.end, e.type, e.text, e.ast, e.style])).toEqual([
      ['L_A_B_0', 'A', 'B', 'arrow_point', 'go', 'e:A>B', ['stroke:blue', 'fill:none']],
      ['L_A_C_0', 'A', 'C', 'arrow_point', 'go', 'e:A>C', undefined],
    ]);
    expect(m.classes).toEqual([
      { id: 'hot', styles: ['fill:#f00', 'color:#fff'], textStyles: ['color:#fff'] },
    ]);
    expect(m.vertices[1]?.classes).toEqual(['hot']);
    expect(m.vertices[2]?.styles).toEqual(['stroke:#333']);
    expect(m.subgraphs).toEqual([
      {
        id: 'S1',
        ast: 's:S1',
        title: 'Group',
        labelType: 'text',
        nodes: ['B'],
        classes: [],
        dir: 'TB',
      },
    ]);
    expect(m.vertices[0]).toMatchObject({ link: 'https://example.com', linkTarget: '_blank' });
    expect(m.links.map((l) => [l.id, l.url, l.target])).toEqual([
      ['A', 'https://example.com', '_blank'],
    ]);
    expect(m.tooltips).toEqual([['A', 'tip']]);
    expect(m.accTitle).toBe('Title');
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });

  it('detects graph, flowchart and flowchart-elk after front matter, comments and directives', () => {
    expect(flowchart.detector('graph TD\nA')).toBe(true);
    expect(flowchart.detector('---\ntitle: t\n---\n%% c\n%%{init: {}}%%\n  flowchart LR')).toBe(
      true
    );
    expect(flowchart.detector('flowchart-elk TD\nA')).toBe(true);
    expect(flowchart.detector('sequenceDiagram\nA->>B: hi')).toBe(false);
  });

  it('keeps every range in the original source: front matter, CRLF, comments, directives', () => {
    const src =
      '---\ntitle: t\n---\r\n%%{init: {}}%%\r\nflowchart TD\r\n  %% note\r\n  A --> B[Bee]\r\n';
    const r = parse(src);
    expect(r.diagnostics).toEqual([]);
    const lines = new LineIndex(src);
    const b = r.symbols.find((s) => s.name === 'B');
    expect(b && lines.position(b.range.start)).toEqual({ line: 6, column: 8 });
    expect(r.model.vertices[1]?.text).toBe('Bee');
    const kinds = Array.from(parse(src, { keepTokens: true }).tokens?.kind ?? []);
    expect(kinds).toContain(Kind.Comment);
    expect(kinds).toContain(Kind.Directive);
    expect(parse(src).tokens).toBeUndefined();
  });

  it('records symbols as definitions and references', () => {
    const src =
      'flowchart TD\n  A --> B\n  B --> A\n  classDef c fill:red\n  class A,B c\n  subgraph G\n    A\n  end\n';
    const r = parse(src);
    expect(r.symbols.map((s) => [s.kind, s.role, s.name, text(src, s.range)])).toEqual([
      ['node', 'def', 'A', 'A'],
      ['node', 'def', 'B', 'B'],
      ['node', 'ref', 'B', 'B'],
      ['node', 'ref', 'A', 'A'],
      ['class', 'def', 'c', 'c'],
      ['node', 'ref', 'A', 'A'],
      ['node', 'ref', 'B', 'B'],
      ['class', 'ref', 'c', 'c'],
      ['node', 'ref', 'A', 'A'],
      ['subgraph', 'def', 'G', 'G'],
    ]);
  });

  it('records statement spans, with subgraph bodies nested for folding', () => {
    const src =
      'flowchart TD\n  A --> B\n  subgraph one\n    C\n    subgraph two\n      D\n    end\n  end\n  style A fill:red\n';
    const r = parse(src);
    const show = (s: (typeof r.statements)[number]): unknown => [
      s.kind,
      text(src, s.range),
      ...(s.children ? [s.children.map(show)] : []),
    ];
    expect(r.statements.map(show)).toEqual([
      ['header', 'flowchart TD'],
      ['chain', 'A --> B'],
      [
        'subgraph',
        'subgraph one\n    C\n    subgraph two\n      D\n    end\n  end',
        [
          ['chain', 'C'],
          ['subgraph', 'subgraph two\n      D\n    end', [['chain', 'D']]],
        ],
      ],
      ['style', 'style A fill:red'],
    ]);
  });

  it('spans an `accDescr { … }` block from `accDescr` to its `}` (statement and AST)', () => {
    const src = 'flowchart TD\n  accDescr {\n    two\n    lines\n  }\n  accDescr\n{one}\n  A\n';
    const r = parse(src);
    const acc = r.statements.filter((s) => s.kind === 'accDescr').map((s) => text(src, s.range));
    expect(acc).toEqual(['accDescr {\n    two\n    lines\n  }', 'accDescr\n{one}']);
    const nodes = r.ast.children.filter((n) => n.type === 'AccDescr');
    expect(nodes.map((n) => text(src, n.range))).toEqual(acc);
    // An unclosed block runs to the end of the text.
    const open = 'flowchart TD\n  accDescr {\n    two';
    const span = parse(open).statements.find((s) => s.kind === 'accDescr');
    expect(text(open, span!.range)).toBe('accDescr {\n    two');
  });

  describe('AST ids are stable under edits', () => {
    const base =
      'flowchart TD\n  A[one] --> B\n  style A fill:red\n  A --> B\n  subgraph g\n    B --> C\n  end\n';
    const before = idsByName(parse(base).ast);
    it.each([
      ['the element’s own label', base.replace('[one]', '[a much longer label]')],
      ['removing the label', base.replace('[one]', '')],
      ['a comment above', base.replace('flowchart TD\n', 'flowchart TD\n  %% hi\n')],
      ['a statement about other nodes above', base.replace('TD\n', 'TD\n  X --> Y\n')],
      ['CRLF line breaks', base.replace(/\n/g, '\r\n')],
    ])('%s', (_name, edited) => {
      const after = idsByName(parse(edited).ast);
      for (const key of ['A', 'B', 'C', '<Edge>', '<Style>', '<Subgraph>']) {
        expect(
          after[key]?.filter((id) => !/[XY]/.test(id)),
          key
        ).toEqual(before[key]);
      }
    });
    it('gives mentions and parallel edges their own ids', () => {
      expect(before.A).toEqual(['n:A', 'n:A@2']);
      expect(before['<Edge>']).toEqual(['e:A>B', 'e:A>B#2', 'e:B>C']);
      expect(before['<Subgraph>']).toEqual(['s:g']);
    });
  });

  it('warns that callbacks are ignored unless a plugin claims them (R-SVG-5)', () => {
    const src = 'flowchart TD\n  A\n  click A callback "tip"\n  click A call doIt(1, 2)\n';
    const r = parse(src);
    expect(r.model.callbacks.map((c) => [c.id, c.name, c.args])).toEqual([
      ['A', 'callback', undefined],
      ['A', 'doIt', '1, 2'],
    ]);
    expect(r.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['warning', 'CALLBACK_IGNORED'],
    ]);
    expect(r.model.warnings.map((d) => d.code)).toEqual(['CALLBACK_IGNORED']);
    expect(parse(src, { claims: ['callbacks'] }).diagnostics).toEqual([]);
  });

  it('reads Mermaid entities and HTML attribute quotes the way v12 did', () => {
    const r = parse('flowchart TD\n  A["#quot;hi#quot; #9829;"] --> B["<b class="x">b</b>"]\n');
    expect(r.diagnostics).toEqual([]);
    expect(r.model.vertices.map((v) => v.text)).toEqual([
      '&quot;hi&quot; &#9829;',
      "<b class='x'>b</b>",
    ]);
  });

  it('reads shape data with the core YAML reader and checks shape names with v12 messages', () => {
    const ok = parse('flowchart TD\n  A@{ shape: cyl, label: "Disk" }\n');
    expect(ok.model.vertices[0]).toMatchObject({ type: 'cyl', text: 'Disk' });
    const multi = parse('flowchart TD\n  A@{\n    shape: hex\n    label: Six\n  }\n');
    expect(multi.model.vertices[0]).toMatchObject({ type: 'hex', text: 'Six' });
    const bad = (shape: string) =>
      parse(`flowchart TD\n  A@{ shape: ${shape} }\n`).diagnostics.map((d) => d.message);
    expect(bad('blob')).toEqual(['No such shape: blob.']);
    expect(bad('Rect')).toEqual(['No such shape: Rect. Shape names should be lowercase.']);
    expect(errors('flowchart TD\n  A@{ shape: [rect }\n')).toEqual(['SHAPE_DATA']);
  });

  it('accepts a subgraph without an id, which v12 crashed on', () => {
    const r = parse('flowchart TD\n  subgraph\n    A\n  end\n');
    expect(r.diagnostics).toEqual([]);
    expect(r.model.subgraphs.map((s) => [s.id, s.nodes])).toEqual([['subGraph0', ['A']]]);
  });

  it('reports semantic errors as diagnostics', () => {
    expect(errors('flowchart TD\n  A --> B\n  linkStyle 3 stroke:red\n')).toEqual([
      'LINK_STYLE_INDEX',
    ]);
    expect(errors('flowchart TD\n  A --> B --> C\n')).toEqual([]);
    const limited = parse('flowchart TD\n  A --> B --> C\n', { maxEdges: 1 });
    expect(limited.diagnostics.map((d) => d.code)).toEqual(['EDGE_LIMIT']);
  });

  it('gives identical results for interleaved parses (no shared state)', () => {
    const src = 'flowchart TD\n  A --> B\n  click A cb\n';
    const a1 = parse(src);
    parse('graph LR\n  X[unclosed\n  P --> Q');
    expect(parse(src)).toEqual(a1);
  });
});
