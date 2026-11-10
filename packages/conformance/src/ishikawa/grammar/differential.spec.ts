import { describe, expect, it } from 'vitest';
import { detectIshikawa } from '@mermaid-js/diagram-ishikawa';
import { loadOracle } from '../../oracle.ts';
import { ishikawaGateCorpus } from '../corpus.ts';
import { handWrittenVerdict, referenceVerdict } from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/ishikawa.ebnf` and the hand-written parser agree on accept/reject and on the AST
 * shape (line types and source ranges), and the grammar agrees with mermaid\@12 on
 * accept/reject, over the lexer gate's corpus (the recovery cases included). v12's DB never
 * throws, so every v12 rejection is a syntax error.
 */
describe('ishikawa grammar differential', () => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let compared = 0;
    let rejected = 0;
    for (const item of await ishikawaGateCorpus()) {
      if (!detectIshikawa(item.source)) continue;
      compared++;
      const ref = referenceVerdict(item.source);
      const hand = handWrittenVerdict(item.source);
      const v12 = await oracle.parse(item.source);
      if (!ref.accepted) rejected++;
      if (v12.accepted !== ref.accepted) {
        diffs.push(
          `${item.id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, mermaid@12 ${ref.accepted ? 'rejects' : 'accepts'}`
        );
      }
      if (ref.accepted !== hand.accepted) {
        diffs.push(
          `${item.id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, parser ${hand.accepted ? 'accepts' : 'rejects'}`
        );
      } else if (JSON.stringify(ref.ast) !== JSON.stringify(hand.ast)) {
        diffs.push(
          `${item.id}: AST differs\n  grammar ${JSON.stringify(ref.ast)}\n  parser  ${JSON.stringify(hand.ast)}`
        );
      }
    }
    process.stdout.write(
      `ishikawa grammar differential: ${compared} sources, ${rejected} rejected\n`
    );
    expect(compared).toBeGreaterThan(1000);
    expect(rejected).toBeGreaterThan(100);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 300_000);
});
