import { describe, it } from 'vitest';
import { checkSentences, v12Differs } from '../../grammar-sentences.ts';
import { loadOracle } from '../../oracle.ts';
import { wardleyGateCorpus } from '../corpus.ts';
import {
  EXCLUDED,
  handWrittenVerdict,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
  v12Syntax,
} from './reference.ts';

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/wardley.ebnf`, weighted by how often the corpus uses each rule, with token texts drawn
 * from the corpus (the parity exclusions left out). The hand-written parser must agree with the reference parser on
 * accept/reject and AST shape, and mermaid\@12 on accept/reject.
 */
describe('wardley grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    // The parity exclusions are core's (see `differential.spec.ts`): no token text from them.
    const corpus = (await wardleyGateCorpus()).filter(
      (c) => !EXCLUDED.some((p) => c.id.startsWith(p))
    );
    const model = learnSentenceModel(corpus.map((c) => c.source));
    await checkSentences({
      name: 'wardley',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
      v12: v12Differs(await loadOracle(), v12Syntax),
    });
  }, 600_000);
});
