import { describe, expect, it } from 'vitest';
import { buildGenerator } from '@mermaid-js/gen-grammar';
import { loadOracle } from '../../oracle.ts';
import { notationOf, railroadGateCorpus } from '../corpus.ts';
import { NOTATIONS } from './railroad-grammar.ts';
import {
  handWrittenVerdict,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
  v12Syntax,
} from './reference.ts';

/** Sentences per notation and run; seeds are 1…N, so a failure names a reproducible seed. */
const SENTENCES = 1500;

/**
 * Grammar differential over generated sentences (R-PARSE-9), per notation: random derivations
 * of the notation's grammar file, weighted by how often the corpus uses each rule, with token
 * texts drawn from the corpus (unclosed directives left out). The hand-written parser must agree
 * with the reference parser on accept/reject and AST shape, and mermaid\@12 on accept/reject.
 */
describe.each(NOTATIONS)('railroad grammar differential, generated sentences (%s)', (notation) => {
  it('agrees on generated sentences', async () => {
    // Unclosed directives are core's (see `differential.spec.ts`): no token text from them.
    const corpus = (await railroadGateCorpus()).filter(
      (c) =>
        !/^railroad-cases\/(?:unclosed-directive|directive-in-line-unclosed)/.test(c.id) &&
        notationOf(c.source) === notation
    );
    const model = learnSentenceModel(
      notation,
      corpus.map((c) => c.source)
    );
    const generator = buildGenerator(referenceParser(notation), model);
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let accepted = 0;
    for (let seed = 1; seed <= SENTENCES; seed++) {
      const { text } = generator.generate({ seed });
      const ref = referenceVerdict(notation, text);
      const hand = handWrittenVerdict(notation, text);
      if (ref.accepted) accepted++;
      const id = `seed ${seed} ${JSON.stringify(text)}`;
      if (ref.accepted !== hand.accepted) {
        diffs.push(
          `${id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, parser ${hand.accepted ? 'accepts' : 'rejects'}`
        );
        continue;
      }
      if (JSON.stringify(ref.ast) !== JSON.stringify(hand.ast)) {
        diffs.push(
          `${id}: AST differs\n  grammar ${JSON.stringify(ref.ast)}\n  parser  ${JSON.stringify(hand.ast)}`
        );
      }
      const v12 = await oracle.parse(text);
      if (v12Syntax(v12) === !ref.accepted) {
        diffs.push(
          `${id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, mermaid@12 ${ref.accepted ? 'rejects' : 'accepts'}`
        );
      }
    }
    process.stdout.write(
      `railroad ${notation} grammar sentences: ${accepted} of ${SENTENCES} accepted\n`
    );
    // Most sentences must be in the language, or the test only checks rejections.
    expect(accepted).toBeGreaterThan(SENTENCES / 2);
    expect(diffs.slice(0, 30)).toEqual([]);
  }, 600_000);
});
