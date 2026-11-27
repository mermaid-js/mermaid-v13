import { describe, expect, it } from 'vitest';
import { detectBlock } from '@mermaid-js/diagram-block';
import { loadOracle } from '../../oracle.ts';
import { blockSyntaxCorpus } from '../corpus.ts';
import {
  handWrittenVerdict,
  referenceVerdict,
  v12Syntax,
  withoutMarkdownStrings,
} from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/block.ebnf` and the hand-written parser agree on accept/reject and on the AST shape
 * (statement types and source ranges, nested as composites nest), and the grammar agrees with
 * mermaid\@12 on accept/reject of the syntax, over the lexer gate's corpus (v12's TypeError on
 * `style`, which D443 accepts, is not syntax). Unclosed directives are left out, as in the
 * parity suite. The one difference from mermaid\@12 is D736's markdown string in a label, which
 * 12.2.0's grammar rejected and both v13 sides take: mermaid\@12 is asked about the source with
 * each markdown string written as a string.
 */

describe('block grammar differential', () => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let compared = 0;
    let rejected = 0;
    for (const item of await blockSyntaxCorpus()) {
      if (!detectBlock(item.source)) continue;
      compared++;
      const ref = referenceVerdict(item.source);
      const hand = handWrittenVerdict(item.source);
      const v12 = await oracle.parse(withoutMarkdownStrings(item.source));
      if (!ref.accepted) rejected++;
      if (v12Syntax(v12) === !ref.accepted) {
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
    expect(compared).toBeGreaterThan(2000);
    expect(rejected).toBeGreaterThan(300);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 300_000);
});
