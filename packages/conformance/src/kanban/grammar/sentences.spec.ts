import { describe, it } from 'vitest';
import { checkSentences, v12Differs } from '../../grammar-sentences.ts';
import { loadOracle } from '../../oracle.ts';
import { kanbanCases, kanbanCorpus } from '../corpus.ts';
import { hasAccStatement } from '../acc-divergence.ts';
import {
  handWrittenVerdict,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
  v12Syntax,
} from './reference.ts';

/** A leading front-matter block. */
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/kanban.ebnf`, weighted by how often the corpus uses each rule, with token texts
 * drawn from the corpus. The hand-written parser must agree with the reference parser on
 * accept/reject and AST shape, and mermaid\@12 on accept/reject, but for a sentence the grammar
 * accepts with an acc statement in it, which v12 read as an item (D742).
 */
describe('kanban grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    // Each body once: the baselines repeat one board per theme (#459), which would weight its
    // rules eleven times over.
    const corpus = [...(await kanbanCorpus()), ...kanbanCases()];
    const bodies = new Set(corpus.map((c) => c.source.replace(FRONT_MATTER, '')));
    const model = learnSentenceModel([...bodies]);
    const v12 = v12Differs(await loadOracle(), v12Syntax);
    await checkSentences({
      name: 'kanban',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
      v12: async (text, accepted) =>
        accepted && hasAccStatement(text) ? undefined : v12(text, accepted),
    });
  }, 600_000);
});
