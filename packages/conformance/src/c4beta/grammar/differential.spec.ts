import { describe, expect, it } from 'vitest';
import { c4betaCorpus } from '../corpus.ts';
import { handWrittenVerdict, referenceVerdict } from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/c4beta.ebnf` and the hand-written parser agree on accept/reject and on the AST shape
 * (statement types and source ranges, a body's elements nested) over the probes, the grammar's
 * documents and their variants. There is no v12 release to compare with (spec #730), so no
 * oracle leg. What the grammar cannot say (a duplicate id, an unknown relation end, a limit)
 * is left out of the hand-written verdict.
 */
describe('c4-beta grammar differential', () => {
  it('agrees with the hand-written parser over the corpus', () => {
    const diffs: string[] = [];
    let accepted = 0;
    const corpus = c4betaCorpus();
    for (const { id, source } of corpus) {
      const ref = referenceVerdict(source);
      const hand = handWrittenVerdict(source);
      if (ref.accepted) accepted++;
      if (ref.accepted !== hand.accepted) {
        diffs.push(
          `${id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, parser ${hand.accepted ? 'accepts' : 'rejects'}`
        );
      } else if (JSON.stringify(ref.ast) !== JSON.stringify(hand.ast)) {
        diffs.push(
          `${id}: AST differs\n  grammar ${JSON.stringify(ref.ast)}\n  parser  ${JSON.stringify(hand.ast)}`
        );
      }
    }
    expect(corpus.length).toBeGreaterThan(150);
    // Most of the corpus is in the language, or the test only checks rejections.
    expect(accepted).toBeGreaterThan(corpus.length / 2);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 300_000);
});
