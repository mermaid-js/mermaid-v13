/**
 * Probe mode on the flowchart parser (R-LANG-7, D95): what the parser would accept at an
 * offset, through the language facet the service calls.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import { describe, expect, it } from 'vitest';
import { flowchartLanguage } from '../language.ts';
import { parseFlowchart } from './parser.ts';
import { T } from './tokens.ts';

const NAMES = new Map<number, string>([
  [Kind.EOF, 'EOF'],
  [Kind.Newline, 'Newline'],
  [Kind.Error, 'Error'],
  ...Object.entries(T).map(([k, v]) => [v, k] as [number, string]),
]);

/** The probe at the `|` marker (`¦` stands for a literal `|`). */
function probeAt(marked: string) {
  const offset = marked.indexOf('|');
  const src = (marked.slice(0, offset) + marked.slice(offset + 1)).replaceAll('¦', '|');
  const r = flowchartLanguage.parse(src, { keepTokens: true, probe: offset });
  const p = r.probe;
  if (!p) throw new Error('no probe result');
  return {
    expected: p.expected.map((k) => NAMES.get(k) ?? String(k)).sort(),
    mode: p.mode,
    prefix: src.slice(p.prefix.start, p.prefix.end),
  };
}

const STATEMENTS = [
  'AccDescr',
  'AccTitle',
  'Class',
  'ClassDef',
  'Click',
  'LinkStyle',
  'NodeString',
  'Style',
  'Subgraph',
];

describe('flowchart probe', () => {
  it('in an empty document: the header keyword', () => {
    const p = probeAt('|');
    expect(p.expected).toContain('Graph');
    expect(p.expected).not.toContain('NodeString');
    expect(p.mode).toBe('INITIAL');
    expect(probeAt('flo|').prefix).toBe('flo');
  });

  it('in the direction: a direction, the prefix without the blank before it', () => {
    const p = probeAt('flowchart T|');
    expect(p.expected).toEqual(expect.arrayContaining(['Dir', 'NoDir']));
    expect(p.expected).not.toContain('NodeString');
    expect(probeAt('flowchart LR|')).toMatchObject({ prefix: 'LR' });
  });

  it('after the header: any statement, but no `end` outside a subgraph', () => {
    const p = probeAt('flowchart TD\n|');
    expect(p.expected).toEqual(expect.arrayContaining(STATEMENTS));
    expect(p.expected).not.toContain('End');
    expect(p.mode).toBe('INITIAL');
    expect(probeAt('flowchart TD\nA --> B\n|').expected).toEqual(
      expect.arrayContaining(STATEMENTS)
    );
  });

  it('after a node: links, shapes, `:::`, `&` and the line end', () => {
    const p = probeAt('flowchart TD\nA|');
    expect(p.prefix).toBe('A');
    const after = probeAt('flowchart TD\nA |');
    expect(after.expected).toEqual(
      expect.arrayContaining(['Amp', 'Link', 'StartLink', 'Newline', 'Semi'])
    );
    expect(after.expected).not.toContain('Style');
  });

  it('after `:::`: a class name', () => {
    expect(probeAt('flowchart TD\nA:::|')).toMatchObject({ expected: ['NodeString'], prefix: '' });
    expect(probeAt('flowchart TD\nA:::ho|')).toMatchObject({ prefix: 'ho' });
    expect(probeAt('flowchart TD\nA:::|\nB').expected).toEqual(['NodeString']);
  });

  it('inside `@{ }`: shape data, in the shape data mode', () => {
    const p = probeAt('flowchart TD\nA@{ shape: |}');
    expect(p.expected).toEqual(expect.arrayContaining(['ShapeData', 'ShapeDataEnd']));
    expect(p.mode).toBe('shapeData');
    // Shape data is one token: the prefix is all of it so far.
    expect(probeAt('flowchart TD\nA@{ shape: re| }').prefix).toBe('shape: re');
  });

  it('mid-arrow: edge text or the rest of the arrow', () => {
    const p = probeAt('flowchart TD\nA --|');
    // `-->` would lex differently from here on, so only edge text is tested; the mode tells
    // the rest of the arrow apart.
    expect(p.expected).toEqual(['EdgeText', 'Str']);
    expect(p.mode).toBe('edgeText');
    expect(probeAt('flowchart TD\nA --> |').expected).toContain('NodeString');
  });

  it('inside a label: label text, in the text mode, with the prefix', () => {
    const p = probeAt('flowchart TD\nA[hel|lo]');
    expect(p).toMatchObject({ mode: 'text', prefix: 'hel' });
    expect(p.expected).toContain('Text');
    expect(probeAt('flowchart TD\nA -->¦te|xt¦ B').mode).toBe('text');
  });

  it('inside a subgraph: any statement or `end`', () => {
    const p = probeAt('flowchart TD\nsubgraph S\n  A\n  |\nend');
    expect(p.expected).toEqual(expect.arrayContaining([...STATEMENTS, 'End']));
    expect(probeAt('flowchart TD\nsubgraph S\n  A\nen|').prefix).toBe('en');
  });

  it('after an error: recovery carries on and the probe sees its own statement', () => {
    const p = probeAt('flowchart TD\nA --> ;\nB:::|');
    expect(p.expected).toEqual(['NodeString']);
    const unclosed = probeAt('flowchart TD\nA[oops\nB:::|');
    expect(unclosed.expected).toEqual(['NodeString']);
    expect(unclosed.mode).toBe('INITIAL');
  });

  it('only with a probe', () => {
    expect(parseFlowchart('flowchart TD\nA').probe).toBeUndefined();
    expect(parseFlowchart('flowchart TD\nA', { probe: 0 }).probe?.offset).toBe(0);
  });
});
