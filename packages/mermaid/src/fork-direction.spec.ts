import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

/**
 * A fork or join bar lies across the flow it is in (v12, D604): 70 × 10 where the flow runs down,
 * 10 × 70 where it runs sideways, including where a subgraph's `direction` turns it, and in a
 * subgraph nested in one that turns it.
 */
async function bars(text: string): Promise<Record<string, string>> {
  const { svg } = await createMermaid().render('forks', text);
  const out: Record<string, string> = {};
  for (const m of svg.matchAll(/<g class="node[^"]*" data-id="([^"]+)"[^>]*><rect ([^>]*)\/>/g)) {
    const w = /width="([^"]+)"/.exec(m[2]!)![1]!;
    const h = /height="([^"]+)"/.exec(m[2]!)![1]!;
    out[m[1]!] = `${w}x${h}`;
  }
  return out;
}

describe('flowchart: fork bars follow the flow they are in', () => {
  it('turns with a subgraph direction, and with an outer one', async () => {
    const text = [
      'flowchart TB',
      '  subgraph S',
      '    direction LR',
      '    a --> f --> b',
      '    subgraph T',
      '      g --> h',
      '    end',
      '  end',
      '  subgraph U',
      '    direction BT',
      '    j --> k',
      '  end',
      '  c --> r',
      '  f@{ shape: fork }',
      '  g@{ shape: fork }',
      '  k@{ shape: fork }',
      '  r@{ shape: fork }',
    ].join('\n');
    const b = await bars(text);
    expect({ f: b.f, g: b.g, k: b.k, r: b.r }).toEqual({
      f: '10x70',
      g: '10x70',
      k: '70x10',
      r: '70x10',
    });
  });

  it('runs sideways at the top of an LR flowchart and down in its TB subgraph', async () => {
    const b = await bars(
      'flowchart LR\n  a --> f\n  subgraph S\n    direction TB\n    g --> c\n  end\n  f@{ shape: fork }\n  g@{ shape: fork }\n'
    );
    expect({ f: b.f, g: b.g }).toEqual({ f: '10x70', g: '70x10' });
  });
});
