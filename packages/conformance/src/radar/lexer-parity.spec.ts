import { describe, expect, it } from 'vitest';
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { LANGIUM_NAMES, radarTokens } from '@mermaid-js/diagram-radar/testing';
import { decodeEntities } from '../flowchart/v12.ts';
import { loadLangiumLexerOracle } from '../langium-lexer.ts';
import type { LangiumLex, LangiumToken } from '../langium-lexer.ts';
import { radarGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D213, D220, spec #422 T1): the v13 radar lexer emits
 * the same tokens, by Chevrotain token type name and image, as `@mermaid-js/parser@2.0.1`'s
 * radar lexer on the text v12 lexed, and the same hidden tokens. That includes v12's split of
 * names that start with a terminal (`circles` is `GRATICULE ID`, D357).
 *
 * Normalisation, both sides (as pie's gate):
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF and CR as
 *   LF (v13's {@link radarTokens} text);
 * - v12 appended a `\n` before lexing; v13 lexes a zero-width line break there, and the oracle
 *   takes that `\n` off the image of the token that matched it;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   place: the error is written `LEXICAL_ERROR` with the length of the text before it, as v12's
 *   parser read it. Chevrotain skips characters and goes on; neither side is compared after.
 *
 * Every source is also lexed with CRLF line breaks and with comment lines added
 * (`commented()`), which v12 removed before lexing; `corpus/radar-cases.json` adds the spec's
 * quirks and U+2028/U+2029 cases.
 *
 * Exclusions ({@link EXCLUDED}, by id prefix, with every variant of the source):
 * - `radar-cases/unclosed-directive`: core's preprocess ends an unclosed `%%{` at its line end
 *   and reports `UNCLOSED_DIRECTIVE`, so v13 rejects the source; v12's directive regex also
 *   removed the line break after it (or, with a `{` argument, the rest of the text). The
 *   difference is in core's directive reading, shared by every type (pie's gate lists it too),
 *   not in a radar lexer rule.
 * - `dev-diagrams/knsv/knsv2-03-radar.mmd`: its front matter is indented (6 blanks before the
 *   opening `---`, none before the closing one). Core reads indented front matter (#7613, a
 *   listed preprocess divergence) and reports it unclosed, so v13 rejects the source; v12 did
 *   not see front matter there and lexed the block as a body YAML token. Core's reading, not a
 *   radar rule; `radar-cases/dev-diagram-dedented` gates the same diagram without the indent.
 */
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    'radar-cases/unclosed-directive',
    'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)',
  ],
  [
    'dev-diagrams/knsv/knsv2-03-radar.mmd',
    'core reads indented front matter (UNCLOSED_FRONT_MATTER)',
  ],
]);
const ERROR = 'LEXICAL_ERROR';
const HIDDEN = new Set(['YAML', 'DIRECTIVE', 'SINGLE_LINE_COMMENT']);

interface Streams {
  tokens: LangiumToken[];
  hidden: LangiumToken[];
}

function v12Streams(lexed: LangiumLex): Streams {
  const decode = ([n, i]: LangiumToken): LangiumToken => [n, decodeEntities(i)];
  const tokens = lexed.tokens.map(decode);
  if (lexed.errorAt !== undefined) {
    const before = decodeEntities(lexed.input.slice(0, lexed.errorAt));
    tokens.push([ERROR, `@${before.length}`]);
  }
  return { tokens, hidden: lexed.hidden.map(decode) };
}

function v13Streams(source: string): Streams {
  const out: Streams = { tokens: [], hidden: [] };
  for (const t of radarTokens(source)) {
    const name = LANGIUM_NAMES[t.kind] ?? `kind ${t.kind}`;
    if (t.kind === Kind.Error) {
      out.tokens.push([ERROR, `@${lexedBefore(source, t.range.start).length}`]);
      break;
    }
    (HIDDEN.has(name) ? out.hidden : out.tokens).push([name, t.text]);
  }
  return out;
}

/** The text v12's lexer read before source offset `at`: v12's text, trimmed at its start. */
function lexedBefore(source: string, at: number): string {
  const pre = preprocess(source);
  const view = sourceView(
    source,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  return cook(source, pre.bodyStart, at, view).trimStart();
}

const show = (t: LangiumToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

function firstDiff(a: LangiumToken[], b: LangiumToken[]): string | undefined {
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  let at = 0;
  while (JSON.stringify(a[at]) === JSON.stringify(b[at])) at++;
  const from = Math.max(0, at - 2);
  return `@${at}\n    v12 ${show(a.slice(from, at + 3))}\n    v13 ${show(b.slice(from, at + 3))}`;
}

describe('radar lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadLangiumLexerOracle('radar');
    const items = await radarGateCorpus();
    const diffs: string[] = [];
    // Exclusions that still differ somewhere, so each one is still needed.
    const needed = new Set<string>();
    const unreached: string[] = [];
    let compared = 0;
    let e2e = 0;
    let errors = 0;
    for (const item of items) {
      const lexed = await oracle.lex(item.source);
      if (!lexed) {
        // Not detected as radar: the cases written so, and the `commented()` copies of short
        // sources, whose cut falls inside the header. Any other source must reach the lexer.
        if (!item.id.startsWith('radar-cases/not-radar') && item.source.includes('radar-beta')) {
          unreached.push(item.id);
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
      const exclusion = [...EXCLUDED.keys()].find((k) => item.id.startsWith(k));
      if (exclusion !== undefined) {
        if (tokens ?? hidden) needed.add(exclusion);
        continue;
      }
      if (tokens) diffs.push(`${item.id} tokens ${tokens}`);
      if (hidden) diffs.push(`${item.id} hidden ${hidden}`);
    }
    process.stdout.write(
      `radar lexer parity: ${compared} of ${items.length} sources lexed by v12, ${errors} with a lexer error\n`
    );
    expect(diffs).toEqual([]);
    expect([...needed].sort()).toEqual([...EXCLUDED.keys()].sort());
    // Every e2e fixture reaches the radar lexer.
    expect(e2e).toBe(15);
    expect(unreached).toEqual([]);
    expect(compared).toBeGreaterThan(600);
  }, 300_000);
});
