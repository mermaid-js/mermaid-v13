import { describe, expect, it } from 'vitest';
import { detectFlowchart } from '@mermaid-js/diagram-flowchart';
import { D621_ACCEPTS, d621Oracle } from '../d621.ts';
import { flowchartCorpus } from './corpus.ts';
import { handWrittenVerdict, v12Syntax, referenceVerdict } from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/flowchart.ebnf` and the hand-written parser agree on accept/reject and on the AST
 * shape (statement, node and link types, nesting and source ranges). mermaid\@12 has 12.3.0's
 * LINK_ID rule in its lexer, and the sources `D621_ACCEPTS` lists are ones 12.2.0's parser
 * rejects and the grammar accepts (D621, until the oracle bump, D316).
 */
describe('flowchart grammar differential', () => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const oracle = await d621Oracle();
    const diffs: string[] = [];
    const d621: string[] = [];
    let compared = 0;
    for (const item of await flowchartCorpus()) {
      if (!detectFlowchart(item.source)) continue;
      compared++;
      const ref = referenceVerdict(item.source);
      const hand = handWrittenVerdict(item.source);
      const v12 = await oracle.parse(item.source);
      if (D621_ACCEPTS.has(item.id) && v12Syntax(v12) === false && ref.accepted) {
        d621.push(item.id);
      } else if (v12Syntax(v12) === !ref.accepted) {
        diffs.push(
          `${item.id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, mermaid@12 ${ref.accepted ? 'rejects' : 'accepts'}`
        );
      }
      if (ref.accepted !== hand.accepted) {
        diffs.push(
          `${item.id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, parser ${hand.accepted ? 'accepts' : 'rejects'}`
        );
      } else if (!hand.semanticError && JSON.stringify(ref.ast) !== JSON.stringify(hand.ast)) {
        diffs.push(
          `${item.id}: AST differs\n  grammar ${JSON.stringify(ref.ast)}\n  parser  ${JSON.stringify(hand.ast)}`
        );
      }
    }
    expect(compared).toBeGreaterThan(700);
    expect(diffs).toEqual([]);
    // Each listed source still differs, so the list cannot go stale.
    expect(d621).toEqual([...D621_ACCEPTS]);
  }, 300_000);
});
