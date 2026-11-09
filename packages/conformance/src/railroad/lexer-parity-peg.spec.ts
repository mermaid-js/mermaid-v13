import { describe, expect, it } from 'vitest';
import { gateLexer } from './lexer-gate.ts';

/**
 * PEG lexer-parity gate (parser-method §1, D213, D220, spec #526 T1): the v13 PEG lexer emits the
 * same tokens and hidden tokens, by Chevrotain token type name and image, as the
 * `railroadPeg` lexer of `@mermaid-js/parser@2.0.1`, on the text v12 lexed. Normalisation and
 * routing: `lexer-gate.ts` and `corpus.ts`. The corpus is the e2e fixtures, the harvested v12
 * spec strings and `corpus/railroad-cases.json` (the spec's quirks and rejected inputs, line
 * separators), each also with CRLF line breaks and with comment lines added (`commented()`).
 *
 * Excluded ({@link EXCLUDED}): `railroad-cases/directive-in-line-unclosed (commented)`, a
 * `%%{` after a rule that is never closed, followed by comment lines. Core's preprocess ends it
 * at its line end and reports `UNCLOSED_DIRECTIVE` (an error: v13 rejects the source,
 * asserted); v12's directive and comment-line regexes together left one `%% c` in its text. The
 * difference is in core's directive reading, shared by every type (pie's and wardley's gates list
 * it too), not in a PEG lexer rule. The other variants of the case are gated.
 *
 * Every source routed to PEG reaches v12's PEG lexer, and no unrouted source (a `commented()`
 * copy whose cut falls inside the header) does.
 */
const EXCLUDED: ReadonlySet<string> = new Set([
  'railroad-cases/directive-in-line-unclosed (commented)',
]);

describe('railroad PEG lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const r = await gateLexer('railroadPeg', EXCLUDED);
    process.stdout.write(
      `railroad PEG lexer parity: ${r.compared} of ${r.routed} sources lexed by v12, ${r.errors} with a lexer error\n`
    );
    expect(r.diffs).toEqual([]);
    expect(r.excluded).toEqual([...EXCLUDED].sort());
    expect(r.accepted).toEqual([]);
    expect(r.unreached).toEqual([]);
    expect(r.strays).toEqual([]);
    // Every e2e fixture of the notation reaches its lexer (`pr-check/` and `nightly-check/`).
    expect(r.e2e).toBe(5);
    expect(r.errors).toBeGreaterThan(0);
  }, 300_000);
});
