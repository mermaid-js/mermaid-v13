import { describe, expect, it } from 'vitest';
import { buildGenerator } from '@mermaid-js/gen-grammar';
import { loadOracle } from '../../oracle.ts';
import { flowchartV12Snapshot } from '../v12.ts';
import { flowchartV13Snapshot, parseFlowchartForParity } from '../v13.ts';
import { flowchartCorpus } from './corpus.ts';
import {
  handWrittenVerdict,
  v12Syntax,
  learnSentenceModel,
  referenceParser,
  referenceVerdict,
} from './reference.ts';

/**
 * Sentences that once disagreed, checked on their own so that a corpus change (which moves
 * the generated sentences) cannot hide them again.
 */
const REGRESSIONS: [id: string, text: string][] = [
  // #94 (seed 1716 once): shape data blocks written back to back, `A@{…}@{…}`.
  [
    '#94 repro',
    [
      'flowchart TB;A',
      '         svc-->F@{ shape: pill, label: Trapezoidal Pentagon""',
      'a  --> B{"`The **cat** in the hat`"}@{ --> proc --> P5["Shared design system and tokens"] --> I',
      'A[Two] x-.-x a2("`The dog in **the** hog.(1)',
      '  NL`");A[Validate]@{ shape: rect} --> b',
    ].join('\n'),
  ],
  ['#94 minimal', 'flowchart TB\nF@{ shape: rect }@{ shape: rect }'],
  ['#94 merged data', 'flowchart TB\nF@{ shape: rect, }@{ label: x }'],
  ['#94 in a chain', 'flowchart TB\nF@{ shape: rect, }@{ label: x } --> b'],
  ['#94 before &', 'flowchart TB\nF@{ shape: rect, }@{ label: x } & G'],
  ['#94 three blocks', 'flowchart TB\nF@{ shape: rect, }@{ label: x, }@{ icon: y }'],
  ['#94 blank between', 'flowchart TB\nF@{ shape: rect, }  @{ label: x }'],
];

/** Sentences per run; seeds are 1…N, so a failure names a reproducible seed. */
const SENTENCES = 3000;

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/flowchart.ebnf`, weighted by how often the corpus uses each rule, with token texts
 * drawn from the corpus. The hand-written parser must agree with the reference parser on
 * accept/reject and AST shape, and mermaid@12 on accept/reject.
 */
describe('flowchart grammar differential (generated sentences)', () => {
  it.each(REGRESSIONS)('agrees on %s', async (_id, text) => {
    const ref = referenceVerdict(text);
    const hand = handWrittenVerdict(text);
    expect(hand.accepted).toBe(ref.accepted);
    if (!hand.semanticError) expect(hand.ast).toEqual(ref.ast);
    const v12 = await (await loadOracle()).parse(text);
    const syntax = v12Syntax(v12);
    if (syntax !== undefined) expect(syntax).toBe(ref.accepted);
    // Where v12 accepted, the model matches too.
    if (v12.accepted) {
      expect(flowchartV13Snapshot(parseFlowchartForParity(text))).toEqual(
        flowchartV12Snapshot(v12.db)
      );
    }
  });

  it('agrees on generated sentences', async () => {
    const corpus = await flowchartCorpus();
    const model = learnSentenceModel(corpus.map((c) => c.source));
    const generator = buildGenerator(referenceParser(), model);
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let accepted = 0;
    for (let seed = 1; seed <= SENTENCES; seed++) {
      const { text } = generator.generate({ seed });
      const ref = referenceVerdict(text);
      const hand = handWrittenVerdict(text);
      if (ref.accepted) accepted++;
      const id = `seed ${seed} ${JSON.stringify(text)}`;
      // A failed check beyond the syntax (bad YAML, a link index) rejects the text anyway and
      // may cut its statement short; only the syntax is compared.
      if (hand.semanticError) continue;
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
      const v12 = await oracle.parse(text);
      if (v12Syntax(v12) === !ref.accepted) {
        diffs.push(
          `${id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, mermaid@12 ${ref.accepted ? 'rejects' : 'accepts'}`
        );
      }
    }
    process.stdout.write(`grammar sentences: ${accepted} of ${SENTENCES} accepted\n`);
    // Most sentences must be in the language, or the test only checks rejections.
    expect(accepted).toBeGreaterThan(SENTENCES / 2);
    expect(diffs.slice(0, 30)).toEqual([]);
  }, 600_000);
});
