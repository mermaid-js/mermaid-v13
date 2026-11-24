import { describe, expect, it } from 'vitest';
import { loadOracle } from '../../oracle.ts';
import { agentflowGateCorpus, HEADER_COMMENT_CASE } from '../corpus.ts';
import { detectAgentflow } from '../v13.ts';
import { handWrittenVerdict, v12Syntax, referenceVerdict } from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/agentflow.ebnf` and the hand-written parser agree on accept/reject and on the AST
 * shape (statement, node and link types, nesting and source ranges), and the grammar agrees
 * with mermaid\@12 on accept/reject, over the lexer gate's corpus (the e2e fixtures, the v12
 * spec strings and the cases, each in its generated variants). The listed differences from
 * mermaid\@12 are D463's lone `%` in a label, which 12.2.0 failed to lex and both v13 sides read
 * as label text, and D691's comments before the header, which 12.2.0 read as a `direction` or a
 * link id and both v13 sides read as comments.
 */
const LONE_PERCENT =
  /^agentflow-cases\/percent-(?:diamond|pipe|round|text|text-end|text-start|trap|two)\b/;

describe('agentflow grammar differential', () => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await agentflowGateCorpus()) {
      if (!detectAgentflow(item.source)) continue;
      compared++;
      const ref = referenceVerdict(item.source);
      const hand = handWrittenVerdict(item.source);
      const v12 = await oracle.parse(item.source);
      const listed = LONE_PERCENT.test(item.id) || HEADER_COMMENT_CASE.test(item.id);
      if (v12Syntax(v12) === !ref.accepted && !(ref.accepted && listed)) {
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
    expect(compared).toBeGreaterThan(3000);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 300_000);
});
