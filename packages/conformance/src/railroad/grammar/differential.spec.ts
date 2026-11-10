import { describe, expect, it } from 'vitest';
import { loadOracle } from '../../oracle.ts';
import { notationOf, railroadGateCorpus } from '../corpus.ts';
import { NOTATIONS } from './railroad-grammar.ts';
import { handWrittenVerdict, referenceVerdict, v12Syntax } from './reference.ts';

/** Core's directive reading differs from v12's on these (see `../parity.spec.ts`). */
const CORE_DIRECTIVE = /^railroad-cases\/(?:unclosed-directive|directive-in-line-unclosed)/;

/**
 * Grammar differential (R-PARSE-9, DESIGN §13), per notation: the reference parser generated
 * from the notation's grammar file and its hand-written parser agree on accept/reject and on the
 * AST shape (statement types and source ranges), and the grammar agrees with mermaid\@12 on
 * accept/reject, over the lexer gates' corpus routed to the notation. Unclosed directives are
 * left out, as in the parity suite: core rejects them (`UNCLOSED_DIRECTIVE`) before the grammar
 * applies.
 */
describe.each(NOTATIONS)('railroad grammar differential (%s)', (notation) => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await railroadGateCorpus()) {
      if (CORE_DIRECTIVE.test(item.id) || notationOf(item.source) !== notation) continue;
      compared++;
      const ref = referenceVerdict(notation, item.source);
      const hand = handWrittenVerdict(notation, item.source);
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
    expect(compared).toBeGreaterThan(150);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 300_000);
});
