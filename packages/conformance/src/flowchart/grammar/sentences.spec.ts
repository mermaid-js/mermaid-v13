import { describe, expect, it } from 'vitest';
import { checkSentences, v12Differs } from '../../grammar-sentences.ts';
import { loadOracle } from '../../oracle.ts';
import { d621Oracle } from '../d621.ts';
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

/**
 * Grammar differential over generated sentences (R-PARSE-9): random derivations of
 * `grammar/flowchart.ebnf`, weighted by how often the corpus uses each rule, with token texts
 * drawn from the corpus. The hand-written parser must agree with the reference parser on
 * accept/reject and AST shape, and mermaid@12 on accept/reject, with 12.3.0's LINK_ID rule in its
 * lexer (D621).
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
    await checkSentences({
      name: 'flowchart',
      parser: referenceParser(),
      model,
      reference: referenceVerdict,
      handWritten: handWrittenVerdict,
      syntaxOnly: true,
      v12: v12Differs(await d621Oracle(), v12Syntax),
    });
  }, 600_000);
});
