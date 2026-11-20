import { describe, it } from 'vitest';
import { checkSentences, v12Differs } from '../../grammar-sentences.ts';
import { loadOracle } from '../../oracle.ts';
import { stateCorpus } from './corpus.ts';
import {
  handWrittenVerdict,
  v12Syntax,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
} from './reference.ts';

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/state.ebnf`, weighted by how often the corpus uses each rule, with token texts
 * drawn from the corpus. The hand-written parser must agree with the reference parser on
 * accept/reject and AST shape, and mermaid v12 on accept/reject.
 */
describe('state grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    const corpus = await stateCorpus();
    const model = learnSentenceModel(corpus.map((c) => c.source));
    await checkSentences({
      name: 'state',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
      syntaxOnly: true,
      v12: v12Differs(await loadOracle(), v12Syntax),
    });
  }, 600_000);
});
