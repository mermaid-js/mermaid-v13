import { describe, it } from 'vitest';
import { checkSentences, v12Differs } from '../../grammar-sentences.ts';
import { loadOracle } from '../../oracle.ts';
import { xyChartGateCorpus } from '../corpus.ts';
import {
  handWrittenVerdict,
  v12Syntax,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
} from './reference.ts';

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/xychart.ebnf`, weighted by how often the corpus uses each rule, with token texts
 * drawn from the corpus. The hand-written parser must agree with the reference parser on
 * accept/reject and AST shape, and mermaid\@12 on accept/reject.
 */
describe('xychart grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    const corpus = await xyChartGateCorpus();
    const model = learnSentenceModel(corpus.map((c) => c.source));
    await checkSentences({
      name: 'xychart',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
      syntaxOnly: true,
      v12: v12Differs(await loadOracle(), v12Syntax),
    });
  }, 600_000);
});
