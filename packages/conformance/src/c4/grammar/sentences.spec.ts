import { describe, expect, it } from 'vitest';
import { buildGenerator } from '@mermaid-js/gen-grammar';
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

/** Sentences per run; seeds are 1…N, so a failure names a reproducible seed. */
const SENTENCES = 3000;

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
    const generator = buildGenerator(referenceParser(), model);
    const oracle = await loadOracle();
    const lexer = await loadJisonLexerOracle('c4');
    const diffs: string[] = [];
    let accepted = 0;
    for (let seed = 1; seed <= SENTENCES; seed++) {
      const { text } = generator.generate({ seed });
      const ref = referenceVerdict(text);
      const hand = handWrittenVerdict(text);
      if (ref.accepted) accepted++;
      const id = `seed ${seed} ${JSON.stringify(text)}`;
      if (ref.accepted !== hand.accepted) {
        diffs.push(
          `${id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, parser ${hand.accepted ? 'accepts' : 'rejects'}`
        );
        continue;
      }
      if (JSON.stringify(ref.ast) !== JSON.stringify(hand.ast)) {
        diffs.push(
          `${id}: AST differs\n  grammar ${JSON.stringify(ref.ast)}\n  parser  ${JSON.stringify(hand.ast)}`
        );
      }
      if ((await lexingExclusion(lexer, text)) !== undefined || usesDirection(text)) continue;
      const v12 = await oracle.parse(text);
      if (v12Syntax(v12) === !ref.accepted) {
        diffs.push(
          `${id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, mermaid@12 ${ref.accepted ? 'rejects' : 'accepts'}`
        );
      }
    }
    process.stdout.write(`c4 grammar sentences: ${accepted} of ${SENTENCES} accepted\n`);
    // Most sentences must be in the language, or the test only checks rejections.
    expect(accepted).toBeGreaterThan(SENTENCES / 2);
    expect(diffs.slice(0, 30)).toEqual([]);
  }, 600_000);
});
