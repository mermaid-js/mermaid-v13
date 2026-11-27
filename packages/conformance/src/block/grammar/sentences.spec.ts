import { describe, it } from 'vitest';
import { checkSentences, v12Differs } from '../../grammar-sentences.ts';
import { loadOracle } from '../../oracle.ts';
import { blockSyntaxCorpus } from '../corpus.ts';
import {
  handWrittenVerdict,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
  v12Syntax,
  withoutMarkdownStrings,
} from './reference.ts';

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/block.ebnf`, weighted by how often the corpus uses each rule, with token texts drawn
 * from the corpus (unclosed directives left out). The hand-written parser must agree with the
 * reference parser on accept/reject and AST shape, and mermaid\@12 on accept/reject of the
 * syntax, asked with each markdown string written as a string (D736).
 */
describe('block grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    const corpus = await blockSyntaxCorpus();
    const model = learnSentenceModel(corpus.map((c) => c.source));
    const v12 = v12Differs(await loadOracle(), v12Syntax);
    await checkSentences({
      name: 'block',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
      v12: (text, accepted) => v12(withoutMarkdownStrings(text), accepted),
    });
  }, 600_000);
});
