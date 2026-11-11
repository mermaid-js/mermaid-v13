import { describe, expect, it, vi } from 'vitest';
import { ParseState } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { parseFlowchart, type FlowParseOptions } from './parser.ts';

const cases = [
  'flowchart TD\n A[Hello] --> B((World))',
  'graph LR\n A & A & B --> C & D --> A\n A --> B\n A --> B',
  'graph TD\n subgraph X[Title]\n subgraph X[Again]\n A:::hot --> B\n end\n end\n classDef hot fill:red\n class A,B hot\n style A stroke:blue\n linkStyle 0 stroke:red',
  'graph TD\n A e1@--> B\n e1@{ animate: true }\n A@{ shape: circle, label: hi }',
  'graph TD\n A --> B\n click A call app.go("a", 2) "Tip"\n click B "https://example.com" "Link" _blank',
  'graph TD\n accTitle: Hello\n accDescr { long description }\n A --> B',
  '---\ntitle: Title\nconfig:\n  theme: dark\n---\r\n%%{init: {"flowchart":{"inheritDir":true}}}%%\r\ngraph TD\r\n%% comment\r\nA["&amp; hello"] --> B',
  'graph sideways\n A[unclosed\n B --> C\n end\n subgraph Z\n D',
  'graph TD\n A@{ shape: [bad }\n B --> C\n linkStyle 100 stroke:red',
  'graph TD\n subgraph A\n subgraph B\n X --> Y\n end\n end',
];

describe('the flowchart model sink', () => {
  it.each(cases)('preserves complete parse output for %s', (source) => {
    const eager = parseFlowchart(source, { maxNodes: 3, maxEdges: 2, maxDepth: 1 });
    const lazy = parseFlowchart(source, {
      deferMetadata: true,
      maxNodes: 3,
      maxEdges: 2,
      maxDepth: 1,
    });
    // Diagnostics and model must already agree before any metadata read.
    expect(lazy.model).toEqual(eager.model);
    expect(lazy.diagnostics).toEqual(eager.diagnostics);
    expect(lazy).toEqual(eager);
  });

  it('collects editor metadata once, on first access to any editor field', () => {
    const source = cases[0]!;
    const eager = parseFlowchart(source);
    const symbols = vi.spyOn(ParseState.prototype, 'symbol');
    try {
      const lazy = parseFlowchart(source, { deferMetadata: true });
      expect(symbols).not.toHaveBeenCalled();
      const diagnostics = lazy.diagnostics;
      const model = lazy.model;
      expect(lazy.symbols).toEqual(eager.symbols);
      const calls = symbols.mock.calls.length;
      expect(calls).toBeGreaterThan(0);
      expect(lazy.ast).toBe(lazy.ast);
      expect(lazy.statements).toBe(lazy.statements);
      expect(lazy.symbols).toBe(lazy.symbols);
      expect(symbols).toHaveBeenCalledTimes(calls);
      expect(lazy.diagnostics).toBe(diagnostics);
      expect(lazy.model).toBe(model);
    } finally {
      symbols.mockRestore();
    }
  });

  it('keeps direct public parsing, tokens and probes eager', () => {
    for (const options of [
      {},
      { deferMetadata: true, keepTokens: true },
      { deferMetadata: true, probe: 14 },
    ]) {
      const result = parseFlowchart(cases[0]!, options);
      expect(Object.getOwnPropertyDescriptor(result, 'ast')?.get).toBeUndefined();
      expect(result).toEqual(parseFlowchart(cases[0]!, { ...options, deferMetadata: false }));
    }
  });

  it('supports enumeration, serialization, cloning, freezing and sealing before access', () => {
    const source = cases[2]!;
    const eager = parseFlowchart(source);
    for (const transform of [
      Object.freeze,
      Object.seal,
      (value: ReturnType<typeof parseFlowchart>) => value,
    ]) {
      const result = transform(parseFlowchart(source, { deferMetadata: true }));
      expect(Object.keys(result)).toEqual(Object.keys(eager));
      expect(JSON.stringify(result)).toBe(JSON.stringify(eager));
      expect({ ...result }).toEqual(eager);
    }
    const sealed = Object.seal(parseFlowchart(source, { deferMetadata: true }));
    sealed.symbols = [];
    expect(sealed.symbols).toEqual([]);
    const frozen = parseFlowchart(source, { deferMetadata: true });
    Object.freeze(frozen);
    expect(() => {
      frozen.ast = eager.ast;
    }).toThrow(TypeError);
    expect(frozen.ast).toEqual(eager.ast);
  });

  it('captures options and preprocessing before callers can change them', () => {
    const source = cases[6]!;
    const preprocessed = preprocess(source);
    const options: FlowParseOptions = {
      deferMetadata: true,
      preprocessed,
      claims: ['callbacks'],
      maxNodes: 2,
      inheritDir: true,
    };
    const eager = parseFlowchart(source, { ...options, deferMetadata: false });
    const lazy = parseFlowchart(source, options);
    options.maxNodes = 0;
    options.inheritDir = false;
    options.claims = [];
    preprocessed.bodyStart = source.length;
    preprocessed.directives[0]!.range.start = 0;
    preprocessed.directives.length = 0;
    expect(lazy).toEqual(eager);
  });
});
