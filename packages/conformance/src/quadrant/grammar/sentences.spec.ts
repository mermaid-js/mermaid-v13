import { describe, it } from 'vitest';
import { checkSentences, v12Differs } from '../../grammar-sentences.ts';
import { loadOracle } from '../../oracle.ts';
import { quadrantGateCorpus } from '../corpus.ts';
import {
  handWrittenVerdict,
  preprocessDiffers,
  v12Syntax,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
} from './reference.ts';

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/quadrant.ebnf`, weighted by how often the corpus uses each rule, with token texts
 * drawn from the corpus. The hand-written parser must agree with the reference parser on
 * accept/reject and AST shape, and mermaid\@12 on accept/reject.
 */
describe('quadrant grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    const corpus = await quadrantGateCorpus();
    const model = learnSentenceModel(corpus.map((c) => c.source));
    await checkSentences({
      name: 'quadrant',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
      // An unclosed `%%{` cuts the rest of v12's text only (`divergences/`).
      skip: preprocessDiffers,
      // A refused style rejects the text anyway (v12's DB, not its grammar).
      syntaxOnly: true,
      v12: v12Differs(await loadOracle(), v12Syntax),
    });
  }, 600_000);
});
