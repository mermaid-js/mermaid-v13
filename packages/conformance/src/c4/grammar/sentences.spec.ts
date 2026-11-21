import { describe, it } from 'vitest';
import { checkSentences, v12Differs } from '../../grammar-sentences.ts';
import { loadJisonLexerOracle } from '../../jison/oracle.ts';
import { loadOracle } from '../../oracle.ts';
import { c4Cases, c4Corpus } from '../corpus.ts';
import { lexingExclusion, usesDirection } from '../d452.ts';
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
 * `grammar/c4.ebnf`, weighted by how often the corpus uses each rule, with token texts drawn
 * from the corpus. The hand-written parser must agree with the reference parser on accept/reject
 * and AST shape, and mermaid\@12 on accept/reject, apart from what `differential.spec.ts` leaves
 * out (D452's lexing changes; a `direction` statement, #730; v12 stopping for a reason beyond its
 * syntax).
 */
describe('c4 grammar differential (generated sentences)', () => {
  it('agrees on generated sentences', async () => {
    const corpus = [...(await c4Corpus()), ...c4Cases()];
    const bodies = new Set(corpus.map((c) => c.source.replace(FRONT_MATTER, '')));
    const model = learnSentenceModel([...bodies]);
    const lexer = await loadJisonLexerOracle('c4');
    const v12 = v12Differs(await loadOracle(), v12Syntax);
    await checkSentences({
      name: 'c4',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
      v12: async (text, accepted) =>
        (await lexingExclusion(lexer, text)) !== undefined || usesDirection(text)
          ? undefined
          : v12(text, accepted),
    });
  }, 600_000);
});
