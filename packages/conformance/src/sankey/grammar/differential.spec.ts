import { describe, expect, it } from 'vitest';
import { detectSankey } from '@mermaid-js/diagram-sankey';
import { loadOracle } from '../../oracle.ts';
import { sankeyGateCorpus } from '../corpus.ts';
import { handWrittenVerdict, referenceVerdict, v12Syntax } from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/sankey.ebnf` and the hand-written parser agree on accept/reject and on the AST
 * shape (row types and source ranges), and the grammar agrees with mermaid\@12 on
 * accept/reject, over the lexer gate's corpus.
 */
describe('sankey grammar differential', () => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let compared = 0;
    let accepted = 0;
    for (const item of await sankeyGateCorpus()) {
      if (!detectSankey(item.source)) continue;
      compared++;
      const ref = referenceVerdict(item.source);
      const hand = handWrittenVerdict(item.source);
      if (ref.accepted) accepted++;
      const v12 = await oracle.parse(item.source);
      if (v12Syntax(v12) === !ref.accepted) {
        diffs.push(
          `${item.id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, mermaid@12 ${ref.accepted ? 'rejects' : 'accepts'}`
        );
      }
      if (ref.accepted !== hand.accepted) {
        diffs.push(
          `${item.id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, parser ${hand.accepted ? 'accepts' : 'rejects'}`
        );
      } else if (JSON.stringify(ref.ast) !== JSON.stringify(hand.ast)) {
        diffs.push(
          `${item.id}: AST differs\n  grammar ${JSON.stringify(ref.ast)}\n  parser  ${JSON.stringify(hand.ast)}`
        );
      }
    }
    expect(compared).toBeGreaterThan(900);
    // Both verdicts occur, so the test checks acceptance and rejection alike.
    expect(accepted).toBeGreaterThan(300);
    expect(compared - accepted).toBeGreaterThan(300);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 300_000);
});
