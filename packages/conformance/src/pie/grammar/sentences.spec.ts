import { describe, it } from 'vitest';
import { checkSentences, v12Differs } from '../../grammar-sentences.ts';
import { loadOracle } from '../../oracle.ts';
import { pieGateCorpus } from '../corpus.ts';
import {
  handWrittenVerdict,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
  v12Syntax,
} from './reference.ts';

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/pie.ebnf`, weighted by how often the corpus uses each rule, with token texts drawn
 * from the corpus (unclosed directives left out). The hand-written parser must agree with the reference parser on
 * accept/reject and AST shape, and mermaid\@12 on accept/reject.
 */
describe('pie grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    // Unclosed directives are core's (see `differential.spec.ts`): no token text from them.
    const corpus = (await pieGateCorpus()).filter(
      (c) => !c.id.startsWith('pie-cases/unclosed directive ')
    );
    const model = learnSentenceModel(corpus.map((c) => c.source));
    await checkSentences({
      name: 'pie',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
      v12: v12Differs(await loadOracle(), v12Syntax),
    });
  }, 600_000);
});
