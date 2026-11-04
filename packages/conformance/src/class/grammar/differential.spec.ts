import { describe, expect, it } from 'vitest';
import { detectClass } from '@mermaid-js/diagram-class';
import { loadOracle } from '../../oracle.ts';
import { classCorpus } from './corpus.ts';
import { handWrittenVerdict, referenceVerdict, v12Syntax } from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/class.ebnf` and the hand-written parser agree on accept/reject and on the AST shape
 * (statement types, namespace nesting and source ranges), and the grammar agrees with
 * mermaid 12 on what is syntax.
 */
describe('class grammar differential', () => {
  it('agrees with the hand-written parser and mermaid 12 over the corpus', async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await classCorpus()) {
      if (!detectClass(item.source)) continue;
      compared++;
      const ref = referenceVerdict(item.source);
      const hand = handWrittenVerdict(item.source);
      const v12 = await oracle.parse(item.source);
      if (v12Syntax(v12) === !ref.accepted) {
        diffs.push(
          `${item.id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, mermaid 12 ${ref.accepted ? 'rejects' : 'accepts'}`
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
    expect(compared).toBeGreaterThan(650);
    expect(diffs).toEqual([]);
  }, 300_000);
});
