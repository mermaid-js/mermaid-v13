import { describe, it } from 'vitest';
import { checkSentences, v12Differs } from '../../grammar-sentences.ts';
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
    await checkSentences({
      name: `railroad ${notation}`,
      parser: referenceParser(notation),
      model,
      reference: (text) => referenceVerdict(notation, text),
      handWritten: (text) => handWrittenVerdict(notation, text),
      sentences: 1500,
      v12: v12Differs(await loadOracle(), v12Syntax),
    });
  }, 600_000);
});
