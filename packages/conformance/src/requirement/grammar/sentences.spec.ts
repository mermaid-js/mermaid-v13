import { describe, it } from 'vitest';
import { checkSentences } from '../../grammar-sentences.ts';
import { loadOracle } from '../../oracle.ts';
import { decidedOracle, requirementCases, requirementCorpus } from '../corpus.ts';
import {
  handWrittenVerdict,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
  v12Disagrees,
} from './reference.ts';

/** A leading front-matter block. */
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/requirement.ebnf`, weighted by how often the corpus uses each rule, with token texts
 * drawn from the corpus. The hand-written parser must agree with the reference parser on
 * accept/reject and AST shape, and mermaid\@12 (with D431's and D432's lexer rules) on
 * accept/reject, except where `v12Disagrees` says.
 */
describe('requirement grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    const corpus = [...(await requirementCorpus()), ...requirementCases()];
    const bodies = new Set(corpus.map((c) => c.source.replace(FRONT_MATTER, '')));
    const model = learnSentenceModel([...bodies]);
    const decided = await decidedOracle();
    const plain = await loadOracle();
    await checkSentences({
      name: 'requirement',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
      v12: (text, accepted) => v12Disagrees(text, accepted, decided, plain),
    });
  }, 600_000);
});
