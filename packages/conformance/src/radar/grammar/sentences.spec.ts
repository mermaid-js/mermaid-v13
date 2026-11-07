import { describe, expect, it } from 'vitest';
import { buildGenerator } from '@mermaid-js/gen-grammar';
import { loadOracle } from '../../oracle.ts';
import { radarGateCorpus } from '../corpus.ts';
import {
  handWrittenVerdict,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
  v12Syntax,
} from './reference.ts';

/** Sentences per run; seeds are 1…N, so a failure names a reproducible seed. */
const SENTENCES = 3000;

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/radar.ebnf`, weighted by how often the corpus uses each rule, with token texts drawn
 * from the corpus (the parity exclusions left out). The hand-written parser must agree with the reference parser on
 * accept/reject and AST shape, and mermaid\@12 on accept/reject.
 */
describe('radar grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    // The parity exclusions are core's (see `differential.spec.ts`): no token text from them.
    const corpus = (await radarGateCorpus()).filter(
      (c) =>
        !c.id.startsWith('radar-cases/unclosed-directive') &&
        !c.id.startsWith('dev-diagrams/knsv/knsv2-03-radar.mmd')
    );
    const model = learnSentenceModel(corpus.map((c) => c.source));
    const generator = buildGenerator(referenceParser(), model);
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let accepted = 0;
    for (let seed = 1; seed <= SENTENCES; seed++) {
      const { text } = generator.generate({ seed });
      const ref = referenceVerdict(text);
      const hand = handWrittenVerdict(text);
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
    process.stdout.write(`radar grammar sentences: ${accepted} of ${SENTENCES} accepted\n`);
    // Most sentences must be in the language, or the test only checks rejections.
    expect(accepted).toBeGreaterThan(SENTENCES / 2);
    expect(diffs.slice(0, 30)).toEqual([]);
  }, 600_000);
});
