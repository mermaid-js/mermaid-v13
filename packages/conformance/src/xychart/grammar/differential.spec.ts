import { describe, expect, it } from 'vitest';
import { detectXyChart } from '@mermaid-js/diagram-xychart';
import { loadOracle } from '../../oracle.ts';
import { xyChartGateCorpus } from '../corpus.ts';
import { handWrittenVerdict, preprocessDiffers, referenceVerdict, v12Syntax } from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/xychart.ebnf` and the hand-written parser agree on accept/reject and on the AST
 * shape (statement types, the axis end label and source ranges), and the grammar agrees with
 * mermaid\@12 on accept/reject, over the lexer gate's corpus. A source whose only error is having no
 * plot (v12 found it at render, not in its grammar) is compared on accept/reject only, and one
 * with an unclosed `%%{` is left out: v12's preprocessing cut it (a listed divergence).
 */
describe('xychart grammar differential', () => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await xyChartGateCorpus()) {
      if (!detectXyChart(item.source) || preprocessDiffers(item.source)) continue;
      compared++;
      const ref = referenceVerdict(item.source);
      const hand = handWrittenVerdict(item.source);
      const v12 = await oracle.parse(item.source);
      if (v12Syntax(v12) === !ref.accepted) {
        diffs.push(
          `${item.id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, mermaid@12 ${ref.accepted ? 'rejects' : 'accepts'}`
        );
      }
      if (ref.accepted !== hand.accepted) {
        diffs.push(
          `${item.id}: grammar ${ref.accepted ? 'accepts' : 'rejects'}, parser ${hand.accepted ? 'accepts' : 'rejects'}`
        );
      } else if (!hand.semanticError && JSON.stringify(ref.ast) !== JSON.stringify(hand.ast)) {
        diffs.push(
          `${item.id}: AST differs\n  grammar ${JSON.stringify(ref.ast)}\n  parser  ${JSON.stringify(hand.ast)}`
        );
      }
    }
    expect(compared).toBeGreaterThan(1400);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 300_000);
});
