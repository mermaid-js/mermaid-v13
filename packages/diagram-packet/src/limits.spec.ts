import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { packet } from './plugin.ts';

const parse = (text: string, limits?: Partial<Limits>) =>
  packet.parse(text, {
    preprocessed: preprocess(text),
    config: {},
    ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
  } as unknown as DiagramParseContext);
/** The limit errors of a parse through the plugin, as `CODE offset`. */
const limitErrors = (text: string, limits?: Partial<Limits>): string[] =>
  parse(text, limits)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.range.start}`);
const message = (text: string, limits: Partial<Limits>): string | undefined =>
  parse(text, limits).diagnostics[0]?.message;

describe('packet parse limits (R-SEC-5, #721)', () => {
  const diagram = 'packet-beta\n0-7: "a"\n8-15: "b"\n16-23: "c"\n24-31: "d"\n';

  it('counts the fields against maxNodes, and reports the cap once, at the first over it', () => {
    expect(limitErrors(diagram, { maxNodes: 4 })).toEqual([]);
    expect(limitErrors(diagram, { maxNodes: 2 })).toEqual([
      `NODE_LIMIT ${diagram.indexOf('16-23')}`,
    ]);
    expect(message(diagram, { maxNodes: 2 })).toBe(
      'The diagram has more than 2 fields, the limit. The limit is set by the page or app that renders the diagram.'
    );
  });

  it("defaults to core's maxNodes", () => {
    const many =
      'packet-beta\n' + Array.from({ length: 10_001 }, (_, i) => `+1: "f${i}"`).join('\n');
    expect(limitErrors(many)).toEqual([`NODE_LIMIT ${many.indexOf('+1: "f10000"')}`]);
  });

  it('keeps the fixed 10,000-row cap a warning, apart from maxNodes (D342)', () => {
    const tall = 'packet-beta\n0-320031: "tall"\n320032-320063: "past"\n';
    for (const limits of [undefined, { maxNodes: 1_000_000 }, { maxNodes: 2 }]) {
      const { diagnostics } = parse(tall, limits);
      expect(diagnostics.map((d) => `${d.severity} ${d.code}`)).toEqual([
        'warning PACKET_TRUNCATED',
      ]);
    }
  });
});
