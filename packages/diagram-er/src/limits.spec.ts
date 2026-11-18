import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { er } from './plugin.ts';

/** The error diagnostics of a parse through the plugin, as `CODE: message`. */
const errors = (text: string, limits: Partial<Limits>): string[] =>
  er
    .parse(text, {
      preprocessed: preprocess(text),
      limits: resolveLimits(undefined, limits),
    } as unknown as DiagramParseContext)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.code}: ${d.message}`);

/** The measured diagram of #747: nine entities in a chain of eight relationships. */
const CHAIN =
  'erDiagram\n' + Array.from({ length: 8 }, (_, i) => `  E${i} ||--o{ E${i + 1} : has`).join('\n');

const SET_BY = 'The limit is set by the page or app that renders the diagram.';

describe('ER parse limits (R-SEC-5, #747)', () => {
  it("says what happens in core's words: the diagram is not drawn, nothing is left out", () => {
    expect(errors(CHAIN, { maxNodes: 5 })).toEqual([
      `NODE_LIMIT: The diagram has more than 5 entities, the limit. ${SET_BY}`,
    ]);
    expect(errors(CHAIN, { maxEdges: 5 })).toEqual([
      `EDGE_LIMIT: The diagram has more than 5 relationships, the limit. ${SET_BY}`,
    ]);
  });

  it('reports once, at the first entity or relationship over the cap', () => {
    for (let cap = 0; cap <= 11; cap++) {
      expect(errors(CHAIN, { maxNodes: cap }), `maxNodes: ${cap}`).toHaveLength(cap < 9 ? 1 : 0);
      expect(errors(CHAIN, { maxEdges: cap }), `maxEdges: ${cap}`).toHaveLength(cap < 8 ? 1 : 0);
    }
  });
});
