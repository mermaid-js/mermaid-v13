import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  CHEVROTAIN_NAMES,
  lexText,
  usecaseTokens,
  usecaseView,
} from '@mermaid-js/diagram-usecase/testing';
import { decodeEntities } from '../flowchart/v12.ts';
import type { CorpusItem } from '../types.ts';
import { loadOracle } from '../oracle.ts';
import { usecaseCases, usecaseCorpus, usecaseGateCorpus } from './corpus.ts';
import { loadUsecaseLexerOracle } from './lexer-oracle.ts';
import type { ChevrotainPair, UsecaseLex } from './lexer-oracle.ts';

/**
 * Lexer-parity gate (parser-method §1, D324, D220, spec #517 T1): the v13 usecase lexer emits
 * the same tokens, by Chevrotain token type name and image, as `mermaid@12.2.0`'s own usecase
 * lexer on the text v12 lexed, and it lexes that very text: `lexText()` equals the text the
 * oracle captured (CRLF and CR as LF, comment lines and directives cut, tag quotes, entity
 * placeholders, the appended `\n`).
 *
 * Normalisation, both sides:
 * - images are compared as v12's renderer read them: entity placeholders decoded (v12's
 *   `ﬂ°amp¶ß` is `LABEL_SYMBOL IDENTIFIER LABEL_SYMBOL`, decoded `&`, `amp`, `;`);
 * - v12 appended a `\n` before lexing; v13 lexes it too, as a zero-width line break at the end
 *   of the source, and both sides take it off the image of the token that matched it;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   offset of the lexed text: it is written `LEXICAL_ERROR @<offset>`. Chevrotain skips
 *   characters and goes on; neither side is compared after.
 *
 * `HWS` is skipped by both. Every source is also lexed with CRLF line breaks, with comment
 * lines added (`commented()`) and with CRs cut from their LF by a comment or a directive, all of
 * which v12 removed before lexing; `corpus/usecase-cases.json` adds the spec's quirks and
 * `LINE_SEPARATORS` the U+2028/U+2029 cases.
 *
 * Every source the gate does not compare is named, and the sets are asserted exactly:
 * - {@link EXCLUDED}: the `usecase-cases/directive-unclosed*` cases, a `%%{` never closed, at
 *   a line start or after a statement. Core's preprocess ends it at its line end and reports
 *   `UNCLOSED_DIRECTIVE` (an error: v13 rejects the source, asserted); v12's directive regex
 *   removed other text with it. In the in-line case's copy CR-cut by a directive, core instead
 *   reads the `%%{` as a directive closed by the added one's `}%%`. Both are core's directive
 *   reading, shared by every type (pie's, radar's and wardley's gates list it too), not a
 *   usecase lexer rule. The line-start case's copy CR-cut by a directive leaves v12 the same
 *   text as v13, so it is gated.
 * - Not reached: the sources v12 never lexed as usecase, asserted exactly: {@link UNDETECTED}
 *   (`usecase-betax` and `usecase` are not detected) in every variant, and the `commented()`
 *   copies of short sources whose cut splits the header ({@link cutsHeader}).
 */
const UNCLOSED = 'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)';
const CLOSED_LATER = "core closes the unclosed %%{ at the added directive's }%%";
const VARIANTS = ['', ' (CRLF)', ' (commented)', ' (CR cut)', ' (CR cut by a directive)'];
const every = (id: string) => VARIANTS.map((v) => `${id}${v}`);
const cutByDirective = (id: string) => id.endsWith('(CR cut by a directive)');
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  ...[
    ...every('usecase-cases/directive-unclosed'),
    ...every('usecase-cases/directive-unclosed-in-line'),
  ]
    .filter((id) => !cutByDirective(id))
    .map((id): [string, string] => [id, UNCLOSED]),
  ['usecase-cases/directive-unclosed-in-line (CR cut by a directive)', CLOSED_LATER],
]);
/** The cases v12 does not detect as usecase, in every variant. */
const UNDETECTED: ReadonlyMap<string, string> = new Map([
  ...every('usecase-cases/keywords-header-glued').map(
    (id) => [id, 'usecase-betax is not detected'] as const
  ),
  ...every('usecase-cases/header-not-usecase').map(
    (id) => [id, 'usecase alone is not detected'] as const
  ),
]);
/**
 * A `commented()` copy whose cut splits the header (a one- or two-line body): v12 detects no
 * usecase there. Decided from the source alone, not from the oracle.
 */
const cutsHeader = (item: CorpusItem) =>
  item.id.endsWith(' (commented)') && !bodyOf(item.source).includes('usecase-beta');
const ERROR = 'LEXICAL_ERROR';
/** `src` after its front matter, which may name the header in a description. */
const bodyOf = (src: string) => src.slice(/^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0].length ?? 0);

function v12Stream(lexed: UsecaseLex): ChevrotainPair[] {
  const tokens = lexed.tokens.map(([n, i]): ChevrotainPair => [n, decodeEntities(i)]);
  if (lexed.errorAt !== undefined) tokens.push([ERROR, `@${lexed.errorAt}`]);
  return tokens;
}

function v13Stream(source: string): ChevrotainPair[] {
  const out: ChevrotainPair[] = [];
  for (const t of usecaseTokens(source)) {
    if (t.kind === Kind.Error) {
      out.push([ERROR, `@${t.at}`]);
      break;
    }
    out.push([CHEVROTAIN_NAMES[t.kind] ?? `kind ${t.kind}`, t.text]);
  }
  return out;
}

function v13Input(source: string): string {
  const { bodyStart, view } = usecaseView(source);
  return lexText(source, bodyStart, view).text;
}

const show = (t: ChevrotainPair[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

function firstDiff(a: ChevrotainPair[], b: ChevrotainPair[]): string | undefined {
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  let at = 0;
  while (JSON.stringify(a[at]) === JSON.stringify(b[at])) at++;
  const from = Math.max(0, at - 2);
  return `@${at}\n    v12 ${show(a.slice(from, at + 3))}\n    v13 ${show(b.slice(from, at + 3))}`;
}

describe('usecase lexer oracle (D324)', () => {
  it('loads mermaid@12.2.0 through its core build, with chevrotain from the mermaid-v12 package', async () => {
    const oracle = await loadUsecaseLexerOracle();
    expect(oracle.entry.endsWith(join('mermaid', 'dist', 'mermaid.core.mjs'))).toBe(true);
    expect(oracle.entry).toContain(`mermaid@12.2.0${sep}`);
    expect(oracle.chevrotain).toContain(`${sep}chevrotain@`);
    // The text v12 lexed: preprocessed, entities encoded, `\n` appended.
    expect(await oracle.input('usecase-beta\r\n%% c\nA[#amp;]')).toBe('usecase-beta\nA[ﬂ°amp¶ß]\n');
    expect(await oracle.input('flowchart LR\nA')).toBeUndefined();
    // v12's own lexer spec, raw text.
    expect(oracle.lexText('1.5 1mg').tokens).toEqual([
      ['NUMBER', '1.5'],
      ['IDENTIFIER', '1mg'],
    ]);
  });

  it('accepts the four decoded <<…>> fixtures and rejects the &lt; case at its first & (D471)', async () => {
    const oracle = await loadOracle();
    const fixtures = (await usecaseCorpus()).filter((i) =>
      DECODED.some((f) => i.id === `e2e/${f}`)
    );
    expect(fixtures).toHaveLength(DECODED.length);
    for (const item of fixtures) {
      const result = await oracle.parse(item.source);
      expect(result.accepted, `${item.id}: ${result.accepted ? '' : result.error}`).toBe(true);
      // The hostile label is kept, decoded, as a sanitisation case.
      if (item.id.includes('pr-check')) expect(item.source).toContain('Hostile("<img src=x');
    }
    const rejected = usecaseCases().find(
      (i) => i.id === 'usecase-cases/entity-stereotype-rejected'
    );
    const result = await oracle.parse(rejected?.source ?? '');
    expect(result.accepted).toBe(false);
    expect(result.accepted ? '' : result.error).toMatch(
      /^Error parsing usecase diagram: [\s\S]*but found: '&'/
    );
  });
});

/** The fixtures D471 decoded from `&lt;&lt;…&gt;&gt;` to `<<…>>`. */
const DECODED = [
  'nightly-check/09-business-and-stereotypes.mmd',
  'nightly-check/20-full-featured-order-system.mmd',
  'pr-check/complete-hand-drawn-rendering-contract.mmd',
  'pr-check/small-representative-visual-snapshot.mmd',
];

describe('usecase lexer parity with mermaid@12.2.0 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadUsecaseLexerOracle();
    const items: CorpusItem[] = await usecaseGateCorpus();
    const diffs: string[] = [];
    const excluded: string[] = [];
    const unreached: string[] = [];
    const notReached = new Set([
      ...UNDETECTED.keys(),
      ...items.filter(cutsHeader).map((i) => i.id),
    ]);
    const accepted: string[] = [];
    let compared = 0;
    let e2e = 0;
    let errors = 0;
    for (const item of items) {
      const lexed = await oracle.lex(item.source);
      if (!lexed) {
        unreached.push(item.id);
        continue;
      }
      compared++;
      if (item.id.startsWith('e2e/') && !item.id.endsWith(')')) e2e++;
      if (lexed.errorAt !== undefined) errors++;
      const input = v13Input(item.source) === lexed.input ? undefined : 'differs';
      const tokens = firstDiff(v12Stream(lexed), v13Stream(item.source));
      if (EXCLUDED.has(item.id)) {
        // Still different, and for the reason given: v13 rejects the source in preprocess.
        if (tokens ?? input) excluded.push(item.id);
        const unclosed = preprocess(item.source).diagnostics.some(
          (d) => d.code === 'UNCLOSED_DIRECTIVE' && d.severity === 'error'
        );
        if (!unclosed && EXCLUDED.get(item.id) === UNCLOSED) accepted.push(item.id);
        continue;
      }
      if (input) diffs.push(`${item.id} lexed text\n    v12 ${JSON.stringify(lexed.input)}`);
      if (tokens) diffs.push(`${item.id} tokens ${tokens}`);
    }
    process.stdout.write(
      `usecase lexer parity: ${compared} of ${items.length} sources lexed by v12, ${errors} with a lexer error, ${notReached.size} not reached\n`
    );
    expect(diffs).toEqual([]);
    expect(excluded.sort()).toEqual([...EXCLUDED.keys()].sort());
    expect(accepted).toEqual([]);
    expect(unreached.sort()).toEqual([...notReached].sort());
    // Every e2e fixture reaches the usecase lexer: 30 in `nightly-check/` (8 of them the
    // parser's, `parser-*.mmd`, #563), 10 in `pr-check/`.
    expect(e2e).toBe(40);
    expect(errors).toBeGreaterThan(20);
    expect(compared).toBe(items.length - notReached.size);
  }, 300_000);
});
