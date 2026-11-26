import { describe, expect, it } from 'vitest';
import { cook, Kind } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  eventModelingTokens,
  eventModelingView,
  LANGIUM_NAMES,
} from '@mermaid-js/diagram-eventmodeling/testing';
import { v12TokenText } from '../v12-entities.ts';
import { loadLangiumLexerOracle } from '../langium-lexer.ts';
import type { LangiumLex, LangiumToken } from '../langium-lexer.ts';
import { eventModelingGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D213, D220, spec #527 T1): the v13 event modeling lexer
 * emits the same tokens, by Chevrotain token type name and image, as `@mermaid-js/parser@2.0.1`'s
 * event modeling lexer on the text v12 lexed, and the same hidden tokens. That includes v12's
 * quirks: EM_WS taking line breaks, so `title` on its own line is an EM_ID; the title and
 * accessibility rules starting with blanks; greedy inline data; keywords that are never names.
 *
 * Normalisation, both sides (as wardley's gate):
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF and CR as
 *   LF (v13's {@link eventModelingTokens} text);
 * - v12 appended a `\n` before lexing; the oracle takes that `\n` off the image of the token
 *   that matched it, and v13 clips its tokens at the end of the source;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   place: the error is written `LEXICAL_ERROR` with the length of the text before it, as v12's
 *   parser read it. Chevrotain skips characters and goes on; neither side is compared after.
 *
 * Every source is also lexed with CRLF line breaks and with comment lines added
 * (`commented()`), which v12 removed before lexing; `corpus/eventmodeling-cases.json` adds the
 * spec's quirks and the U+2028/U+2029 and other `\s` cases.
 *
 * Every source the gate does not compare is named, and the sets are asserted exactly, so the
 * gate fails when one of them starts to match (or to reach v12) or a new one appears:
 * - {@link EXCLUDED}: a `%%{` that starts a line and is never closed. Core's preprocess ends it
 *   at its line end and reports `UNCLOSED_DIRECTIVE` (an error: v13 rejects the source,
 *   asserted); v12's directive regex removed more. The difference is in core's directive
 *   reading, shared by every type (pie's, radar's, treemap's and wardley's gates list it too),
 *   not in an event modeling lexer rule. Also `e2e/nightly-check/comment-before-frontmatter.mmd`
 *   in every variant, a `%%` line above the front matter: core reads that front matter (D704)
 *   and the lexer starts after it; v12 did not find it, so its lexer saw the block as hidden
 *   `EM_YAML`. That difference is in core's front-matter scanner, shared by every type.
 * - {@link NOT_REACHED}: the sources v12 never lexed as event modeling: `EventModeling`
 *   (detection is case-sensitive) in every variant, and the `commented()` copies of short
 *   sources, whose cut falls inside the header.
 */
const UNCLOSED = 'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)';
const BEFORE_FENCE = 'core reads front matter after a leading `%%` line (D704)';
const variants = (id: string) => [id, `${id} (CRLF)`, `${id} (commented)`];
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  ...[
    ...variants('eventmodeling-cases/unclosed-directive'),
    ...variants('eventmodeling-cases/directive-in-line-unclosed'),
  ].map((id) => [id, UNCLOSED] as const),
  ...variants('e2e/nightly-check/comment-before-frontmatter.mmd').map(
    (id) => [id, BEFORE_FENCE] as const
  ),
]);
const CUT_HEADER = 'the commented() cut falls inside the header';
const NOT_REACHED: ReadonlyMap<string, string> = new Map([
  ...variants('eventmodeling-cases/header-upper').map(
    (id) => [id, 'detection is case-sensitive'] as const
  ),
  ...[
    'eventmodeling-cases/acc-descr-no-colon',
    'eventmodeling-cases/acc-descr-own-line',
    'eventmodeling-cases/acc-title-empty',
    'eventmodeling-cases/acc-title-no-colon',
    'eventmodeling-cases/frame-id-one',
    'eventmodeling-cases/frame-missing-id',
    'eventmodeling-cases/front-matter',
    'eventmodeling-cases/header-alone',
    'eventmodeling-cases/header-blank-end',
    'eventmodeling-cases/keyword-mixed',
    'eventmodeling-cases/ls-after-header',
    'eventmodeling-cases/keyword-upper',
    'eventmodeling-cases/one-line-tabs',
    'eventmodeling-cases/title-alone',
    'eventmodeling-cases/title-colon',
    'eventmodeling-cases/title-percent-only',
    'eventmodeling-cases/titled',
    'eventmodeling-cases/ws-bom',
    'eventmodeling-cases/ws-nbsp',
    'v12-specs/parser.ts#1',
  ].map((id) => [`${id} (commented)`, CUT_HEADER] as const),
]);
const ERROR = 'LEXICAL_ERROR';
const HEADER = 'eventmodeling';
const HIDDEN = new Set([
  'EM_YAML',
  'EM_DIRECTIVE',
  'EM_SINGLE_LINE_COMMENT',
  'EM_ML_COMMENT',
  'EM_SL_COMMENT',
]);

interface Streams {
  tokens: LangiumToken[];
  hidden: LangiumToken[];
}

function v12Streams(lexed: LangiumLex): Streams {
  const decode = ([n, i]: LangiumToken): LangiumToken => [n, v12TokenText(i)];
  const tokens = lexed.tokens.map(decode);
  if (lexed.errorAt !== undefined) {
    const before = v12TokenText(lexed.input.slice(0, lexed.errorAt));
    tokens.push([ERROR, `@${before.length}`]);
  }
  return { tokens, hidden: lexed.hidden.map(decode) };
}

function v13Streams(source: string): Streams {
  const out: Streams = { tokens: [], hidden: [] };
  for (const t of eventModelingTokens(source)) {
    const name = LANGIUM_NAMES[t.kind] ?? `kind ${t.kind}`;
    if (t.kind === Kind.Error) {
      out.tokens.push([ERROR, `@${lexedBefore(source, t.range.start).length}`]);
      break;
    }
    (HIDDEN.has(name) ? out.hidden : out.tokens).push([name, t.text]);
  }
  return out;
}

/** The text v12's lexer read before source offset `at` (v12 lexed `withComments`, untrimmed). */
function lexedBefore(source: string, at: number): string {
  const { bodyStart, view } = eventModelingView(source);
  return cook(source, bodyStart, at, view);
}

const show = (t: LangiumToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

function firstDiff(a: LangiumToken[], b: LangiumToken[]): string | undefined {
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  let at = 0;
  while (JSON.stringify(a[at]) === JSON.stringify(b[at])) at++;
  const from = Math.max(0, at - 2);
  return `@${at}\n    v12 ${show(a.slice(from, at + 3))}\n    v13 ${show(b.slice(from, at + 3))}`;
}

describe('event modeling lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadLangiumLexerOracle('eventmodeling');
    const items = await eventModelingGateCorpus();
    const diffs: string[] = [];
    const excluded: string[] = [];
    const unreached: string[] = [];
    const headerKept: string[] = [];
    const accepted: string[] = [];
    let compared = 0;
    let e2e = 0;
    let errors = 0;
    for (const item of items) {
      const lexed = await oracle.lex(item.source);
      if (!lexed) {
        unreached.push(item.id);
        // For the reason given: the header no longer appears whole.
        if (NOT_REACHED.get(item.id) === CUT_HEADER && item.source.includes(HEADER)) {
          headerKept.push(item.id);
        }
        continue;
      }
      compared++;
      if (item.id.startsWith('e2e/') && !item.id.endsWith(')')) e2e++;
      if (lexed.errorAt !== undefined) errors++;
      const v12 = v12Streams(lexed);
      const v13 = v13Streams(item.source);
      const tokens = firstDiff(v12.tokens, v13.tokens);
      const hidden = firstDiff(v12.hidden, v13.hidden);
      if (EXCLUDED.has(item.id)) {
        // Still different, and for the reason given: v13 rejects the source in preprocess.
        if (tokens ?? hidden) excluded.push(item.id);
        const pre = preprocess(item.source);
        // D704: the front matter below the `%%` line is read.
        const forReason =
          EXCLUDED.get(item.id) === BEFORE_FENCE
            ? pre.frontMatter !== undefined
            : pre.diagnostics.some(
                (d) => d.code === 'UNCLOSED_DIRECTIVE' && d.severity === 'error'
              );
        if (!forReason) accepted.push(item.id);
        continue;
      }
      if (tokens) diffs.push(`${item.id} tokens ${tokens}`);
      if (hidden) diffs.push(`${item.id} hidden ${hidden}`);
    }
    process.stdout.write(
      `event modeling lexer parity: ${compared} of ${items.length} sources lexed by v12, ${errors} with a lexer error\n`
    );
    expect(diffs).toEqual([]);
    expect(excluded.sort()).toEqual([...EXCLUDED.keys()].sort());
    expect(accepted).toEqual([]);
    expect(unreached.sort()).toEqual([...NOT_REACHED.keys()].sort());
    expect(headerKept).toEqual([]);
    // Every e2e fixture reaches the lexer: 25 through #604, 8 baselines from #611, the later
    // ones and #1035's override fixture.
    expect(e2e).toBe(40);
    expect(compared).toBe(items.length - NOT_REACHED.size);
  }, 300_000);
});
