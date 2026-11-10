import { describe, expect, it } from 'vitest';
import { buildGenerator } from '@mermaid-js/gen-grammar';
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

/** Sentences per run; seeds are 1…N, so a failure names a reproducible seed. */
const SENTENCES = 3000;

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
    const generator = buildGenerator(referenceParser(), model);
    const decided = await decidedOracle();
    const plain = await loadOracle();
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
      const v12 = await v12Disagrees(text, ref.accepted, decided, plain);
      if (v12) diffs.push(`${id}: ${v12}`);
    }
    process.stdout.write(`requirement grammar sentences: ${accepted} of ${SENTENCES} accepted\n`);
    // Most sentences must be in the language, or the test only checks rejections.
    expect(accepted).toBeGreaterThan(SENTENCES / 2);
    expect(diffs.slice(0, 30)).toEqual([]);
  }, 600_000);
});
