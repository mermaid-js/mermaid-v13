import { describe, expect, it } from 'vitest';
import { detectTreeView } from '@mermaid-js/diagram-treeview';
import { loadOracle } from '../../oracle.ts';
import { treeViewGateCorpus } from '../corpus.ts';
import { handWrittenVerdict, referenceVerdict, v12Syntax } from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/treeview.ebnf` and the hand-written parser agree on accept/reject and on the AST shape
 * (statement types and source ranges, nodes in source order; accept/reject only after a
 * box-drawing rewrite), and the grammar agrees with mermaid\@12 on accept/reject, over the lexer
 * gate's corpus. The parity exclusions are left out: core rejects them (`UNCLOSED_DIRECTIVE`)
 * before the grammar applies.
 */
const EXCLUDED = ['treeView-cases/unclosed-directive'];

describe('treeView grammar differential', () => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let compared = 0;
    let shapes = 0;
    for (const item of await treeViewGateCorpus()) {
      if (EXCLUDED.some((p) => item.id.startsWith(p)) || !detectTreeView(item.source)) continue;
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
      } else if (JSON.stringify(ref.ast) !== JSON.stringify(hand.ast)) {
        diffs.push(
          `${item.id}: AST differs\n  grammar ${JSON.stringify(ref.ast)}\n  parser  ${JSON.stringify(hand.ast)}`
        );
      } else if (ref.ast) shapes++;
    }
    process.stdout.write(
      `treeView grammar differential: ${compared} compared, ${shapes} by shape\n`
    );
    expect(compared).toBeGreaterThan(1000);
    expect(shapes).toBeGreaterThan(500);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 300_000);
});
