import { describe, it } from 'vitest';
import { checkSentences } from '../../grammar-sentences.ts';
import { c4betaCorpus } from '../corpus.ts';
import {
  handWrittenVerdict,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
} from './reference.ts';

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/c4beta.ebnf`, weighted by how often the corpus uses each rule, with token texts drawn
 * from the corpus. The hand-written parser must agree with the reference parser on accept/reject
 * and AST shape.
 */
describe('c4-beta grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    const model = learnSentenceModel(c4betaCorpus().map((c) => c.source));
    await checkSentences({
      name: 'c4-beta',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
    });
  }, 600_000);
});
