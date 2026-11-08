import { describe, expect, it } from 'vitest';
import { detectVenn } from '@mermaid-js/diagram-venn';
import { loadOracle } from '../../oracle.ts';
import { UNCLOSED, vennGateCorpus } from '../corpus.ts';
import { handWrittenVerdict, referenceVerdict, v12Syntax } from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/venn.ebnf` and the hand-written parser agree on accept/reject and on the AST shape
 * (statement types and source ranges), and the grammar agrees with mermaid\@12 on accept/reject
 * of the syntax, over the lexer gate's corpus (v12's DB checks on `union` are not syntax; they
 * are the parity suite's). Unclosed directives are left out, as in the parity suite.
 */
describe('venn grammar differential', () => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let compared = 0;
    let rejected = 0;
    for (const item of await vennGateCorpus()) {
      if (item.id.startsWith(UNCLOSED) || !detectVenn(item.source)) continue;
      compared++;
      const ref = referenceVerdict(item.source);
      const hand = handWrittenVerdict(item.source);
      const v12 = await oracle.parse(item.source);
      if (!ref.accepted) rejected++;
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
    expect(compared).toBeGreaterThan(1500);
    expect(rejected).toBeGreaterThan(400);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 300_000);
});
