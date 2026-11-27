import { describe, expect, it } from 'vitest';
import { detectKanban } from '@mermaid-js/diagram-kanban';
import { loadOracle } from '../../oracle.ts';
import { kanbanGateCorpus } from '../corpus.ts';
import { handWrittenVerdict, referenceVerdict, v12Syntax } from './reference.ts';
import { hasAccStatement } from '../acc-divergence.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/kanban.ebnf` and the hand-written parser agree on accept/reject and on the AST
 * shape (statement types and source ranges), and the grammar agrees with mermaid\@12 on
 * accept/reject, over the lexer gate's corpus and the parser cases. A source the grammar accepts
 * with an acc statement in it is not compared with v12 (D742, `hasAccStatement`).
 */
describe('kanban grammar differential', () => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await kanbanGateCorpus()) {
      if (!detectKanban(item.source)) continue;
      compared++;
      const ref = referenceVerdict(item.source);
      const hand = handWrittenVerdict(item.source);
      const v12 = await oracle.parse(item.source);
      // D742: v12 read an acc statement as an item, or rejected `accDescr {`.
      const accOnly = ref.accepted && hasAccStatement(item.source);
      if (!accOnly && v12Syntax(v12) === !ref.accepted) {
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
    expect(compared).toBeGreaterThan(1000);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 300_000);
});
