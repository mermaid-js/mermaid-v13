import { describe, expect, it } from 'vitest';
import { gateLexer } from './lexer-gate.ts';

/**
 * IR lexer-parity gate (parser-method §1, D213, D220, spec #526 T1): the v13 IR lexer emits the
 * same tokens and hidden tokens, by Chevrotain token type name and image, as the
 * `railroad` lexer of `@mermaid-js/parser@2.0.1`, on the text v12 lexed. Normalisation and
 * routing: `lexer-gate.ts` and `corpus.ts`. The corpus is the e2e fixtures, the harvested v12
 * spec strings and `corpus/railroad-cases.json` (the spec's quirks and rejected inputs, line
 * separators), each also with CRLF line breaks and with comment lines added (`commented()`).
 *
 * Nothing is excluded: every source routed to IR is compared.
 *
 * Every source routed to IR reaches v12's IR lexer, and no unrouted source (a `commented()`
 * copy whose cut falls inside the header) does.
 */
const EXCLUDED: ReadonlySet<string> = new Set<string>();

describe('railroad IR lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const r = await gateLexer('railroad', EXCLUDED);
    process.stdout.write(
      `railroad IR lexer parity: ${r.compared} of ${r.routed} sources lexed by v12, ${r.errors} with a lexer error\n`
    );
    expect(r.diffs).toEqual([]);
    expect(r.excluded).toEqual([...EXCLUDED].sort());
    expect(r.accepted).toEqual([]);
    expect(r.unreached).toEqual([]);
    expect(r.strays).toEqual([]);
    // Every e2e fixture of the notation reaches its lexer (`pr-check/` and `nightly-check/`).
    expect(r.e2e).toBe(14);
    expect(r.errors).toBeGreaterThan(0);
  }, 300_000);
});
