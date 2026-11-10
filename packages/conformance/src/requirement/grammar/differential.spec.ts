import { describe, expect, it } from 'vitest';
import { detectRequirement } from '@mermaid-js/diagram-requirement';
import { loadOracle } from '../../oracle.ts';
import { decidedOracle, requirementGateCorpus } from '../corpus.ts';
import { handWrittenVerdict, referenceVerdict, v12Disagrees } from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/requirement.ebnf` and the hand-written parser agree on accept/reject and on the AST
 * shape (statement types and source ranges), and the grammar agrees with mermaid\@12 (with
 * D431's and D432's lexer rules, as the lexer gate) on accept/reject, except where
 * `v12Disagrees` says, over the lexer gate's corpus. Core's preprocess reads two sources
 * differently from v12's (the lexer gate excludes them too), so the hand-written parser is not
 * compared there.
 */
const CORE =
  /^(?:e2e\/visual-check\/with-a-theme-default\.mmd|requirement-cases\/directive-unclosed)(?: \(|$)/;

describe('requirement grammar differential', () => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const decided = await decidedOracle();
    const plain = await loadOracle();
    const diffs: string[] = [];
    let compared = 0;
    let rejected = 0;
    const items = await requirementGateCorpus();
    const byId = new Map(items.map((i) => [i.id, i.source]));
    for (const item of items) {
      if (!detectRequirement(item.source)) continue;
      compared++;
      const ref = referenceVerdict(item.source);
      if (!ref.accepted) rejected++;
      const from = byId.get(item.id.replace(/ \([^()]*\)$/, ''));
      const v12 = await v12Disagrees(item.source, ref.accepted, decided, plain, from);
      if (v12) diffs.push(`${item.id}: ${v12}`);
      if (CORE.test(item.id)) continue;
      const hand = handWrittenVerdict(item.source);
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
    expect(compared).toBeGreaterThan(3000);
    // Both verdicts occur, so the test checks acceptance and rejection alike.
    expect(rejected).toBeGreaterThan(400);
    expect(compared - rejected).toBeGreaterThan(2000);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 300_000);
});
