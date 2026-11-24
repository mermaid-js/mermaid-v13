import { describe, it } from 'vitest';
import { checkSentences, v12Differs } from '../../grammar-sentences.ts';
import { loadOracle } from '../../oracle.ts';
import { agentflowCases, agentflowCorpus, hasHeaderComment } from '../corpus.ts';
import {
  handWrittenVerdict,
  v12Syntax,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
} from './reference.ts';

/** A lone `%` in a label: v13 reads it as text (D463), mermaid\@12.2.0 failed to lex it. */
const LONE_PERCENT = /(?<!%)%(?!%)/;

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/agentflow.ebnf`, weighted by how often the corpus uses each rule, with token texts
 * drawn from the corpus. The hand-written parser must agree with the reference parser on
 * accept/reject and AST shape, and mermaid\@12 on accept/reject (but for D463 and D691).
 */
describe('agentflow grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    const corpus = [...(await agentflowCorpus()), ...agentflowCases()];
    const model = learnSentenceModel(corpus.map((c) => c.source));
    const v12 = v12Differs(await loadOracle(), v12Syntax);
    await checkSentences({
      name: 'agentflow',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
      syntaxOnly: true,
      v12: (text, accepted) =>
        accepted && (LONE_PERCENT.test(text) || hasHeaderComment(text))
          ? Promise.resolve(undefined)
          : v12(text, accepted),
      // Many sentences must be in the language, or the test only checks rejections. About half
      // are: corpus texts drawn for one token often lex as others once joined.
      minAccepted: 0.4,
    });
  }, 600_000);
});
