import { describe, expect, it } from 'vitest';
import { detectC4 } from '@mermaid-js/diagram-c4';
import { loadJisonLexerOracle } from '../../jison/oracle.ts';
import { loadOracle } from '../../oracle.ts';
import { c4GateCorpus } from '../corpus.ts';
import { lexingExclusion } from '../d452.ts';
import { handWrittenVerdict, referenceVerdict, v12Syntax } from './reference.ts';

/**
 * Grammar differential (R-PARSE-9, DESIGN §13): the reference parser generated from
 * `grammar/c4.ebnf` and the hand-written parser agree on accept/reject and on the AST shape
 * (statement types and source ranges, nested in boundaries), and the grammar agrees with
 * mermaid\@12 on accept/reject, over the lexer gate's corpus.
 *
 * The comparison with mermaid\@12 leaves out, with the reason:
 * - D452's lexing changes (`d452.ts`, the lexer gate's exclusions): the grammar lexes as v13;
 * - sources v12 stopped for a reason beyond its syntax (`v12Syntax`): an unknown relation end
 *   (D457; the hand-written parser reports it as a semantic error), `$__proto__`'s `TypeError`
 *   (D452), `setDirection is not a function`.
 * Every other source must agree three ways.
 */
describe('c4 grammar differential', () => {
  it('agrees with the hand-written parser and mermaid@12 over the corpus', async () => {
    const oracle = await loadOracle();
    const lexer = await loadJisonLexerOracle('c4');
    const diffs: string[] = [];
    let compared = 0;
    let lexing = 0;
    let accepted = 0;
    let nodes = 0;
    for (const item of await c4GateCorpus()) {
      if (!detectC4(item.source)) continue;
      compared++;
      const ref = referenceVerdict(item.source);
      const hand = handWrittenVerdict(item.source);
      if (ref.accepted) accepted++;
      nodes += JSON.stringify(ref.ast ?? []).split('"type"').length - 1;
      const excluded = (await lexingExclusion(lexer, item.source)) !== undefined;
      if (excluded) lexing++;
      const v12 = await oracle.parse(item.source);
      if (!excluded && v12Syntax(v12) === !ref.accepted) {
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
      `c4 grammar differential: ${compared} sources, ${accepted} accepted (${nodes} AST nodes), ` +
        `${lexing} not compared with mermaid@12 (D452 lexing)\n`
    );
    expect(compared).toBeGreaterThan(2000);
    // Most of the corpus is in the language, so the AST shapes are compared too.
    expect(accepted).toBeGreaterThan(compared / 2);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 600_000);
});
