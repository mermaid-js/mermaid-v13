/**
 * The grammar differential over generated sentences (R-PARSE-9) that every type's
 * `grammar/sentences.spec.ts` runs: random derivations of the type's grammar, weighted by how
 * often its corpus uses each rule, with token texts drawn from the corpus. The hand-written
 * parser must agree with the reference parser on accept/reject and AST shape, and mermaid\@12 on
 * accept/reject. Each spec keeps its corpus, its exclusions and its type name. Dev and CI only.
 */
import { expect } from 'vitest';
import { buildGenerator } from '@mermaid-js/gen-grammar';
import type { ReferenceParser, SentenceModel } from '@mermaid-js/gen-grammar';
import type { Oracle, OracleResult } from './oracle.ts';

/** One side's verdict on a sentence. */
export interface SentenceVerdict {
  accepted: boolean;
  /** The AST shape, when accepted; compared as JSON. */
  ast: unknown;
  /** The text was refused for a reason beyond its syntax (see `syntaxOnly`). */
  semanticError?: boolean;
}

export interface SentenceDifferential {
  /** The type's name, which starts the run's log line. */
  name: string;
  /** The reference parser built from the grammar; the sentences are its derivations. */
  parser: ReferenceParser;
  /** The rule weights and token texts learnt from the corpus. */
  model: SentenceModel;
  /** Accept/reject and AST shape by the grammar. */
  reference(text: string): SentenceVerdict;
  /** Accept/reject and AST shape by the hand-written parser. */
  handWritten(text: string): SentenceVerdict;
  /**
   * mermaid\@12's disagreement with the grammar's verdict on `text`, or undefined when it agrees
   * (see {@link v12Differs}). Without it, v12 is not compared.
   */
  v12?: (text: string, accepted: boolean) => Promise<string | undefined>;
  /** Leave a sentence out before any verdict. */
  skip?: (text: string) => boolean;
  /**
   * Skip a sentence the hand-written parser refused beyond its syntax (`semanticError`): such
   * a refusal rejects the text anyway and may cut its statement short, so only the syntax is
   * compared.
   */
  syntaxOnly?: boolean;
  /** Sentences per run (default 3000); seeds are 1…N, so a failure names a reproducible seed. */
  sentences?: number;
  /**
   * The share of the sentences the grammar must accept (default a half), or the test only
   * checks rejections.
   */
  minAccepted?: number;
}

const verb = (accepted: boolean) => (accepted ? 'accepts' : 'rejects');

/**
 * The usual v12 comparison: `oracle` parses the text and `syntax` reads its verdict on the
 * syntax (undefined where v12 stopped for a reason beyond it, which is not compared).
 */
export function v12Differs(
  oracle: Oracle,
  syntax: (result: OracleResult) => boolean | undefined
): (text: string, accepted: boolean) => Promise<string | undefined> {
  return async (text, accepted) =>
    syntax(await oracle.parse(text)) === !accepted
      ? `grammar ${verb(accepted)}, mermaid@12 ${verb(!accepted)}`
      : undefined;
}

/** What is wrong with one sentence the grammar gave `ref` for. */
async function sentenceDiffs(
  d: SentenceDifferential,
  text: string,
  ref: SentenceVerdict
): Promise<string[]> {
  const hand = d.handWritten(text);
  if (d.syntaxOnly === true && hand.semanticError === true) return [];
  if (ref.accepted !== hand.accepted) {
    return [`grammar ${verb(ref.accepted)}, parser ${verb(hand.accepted)}`];
  }
  const out: string[] = [];
  const refAst = JSON.stringify(ref.ast);
  const handAst = JSON.stringify(hand.ast);
  if (refAst !== handAst) out.push(`AST differs\n  grammar ${refAst}\n  parser  ${handAst}`);
  const v12 = await d.v12?.(text, ref.accepted);
  if (v12 !== undefined) out.push(v12);
  return out;
}

/** Run the differential over `d.sentences` generated sentences and assert it found nothing. */
export async function checkSentences(d: SentenceDifferential): Promise<void> {
  const total = d.sentences ?? 3000;
  const generator = buildGenerator(d.parser, d.model);
  const diffs: string[] = [];
  let accepted = 0;
  for (let seed = 1; seed <= total; seed++) {
    const { text } = generator.generate({ seed });
    if (d.skip?.(text) === true) continue;
    const ref = d.reference(text);
    if (ref.accepted) accepted++;
    const id = `seed ${seed} ${JSON.stringify(text)}`;
    for (const diff of await sentenceDiffs(d, text, ref)) diffs.push(`${id}: ${diff}`);
  }
  process.stdout.write(`${d.name} grammar sentences: ${accepted} of ${total} accepted\n`);
  expect(accepted).toBeGreaterThan(total * (d.minAccepted ?? 0.5));
  expect(diffs.slice(0, 30)).toEqual([]);
}
