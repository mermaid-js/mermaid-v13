import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { ampEntities } from '@mermaid-js/core/parser-kit/support';
import { LANGIUM_NAMES, treeViewLex } from '@mermaid-js/diagram-treeview/testing';
import { v12TokenText } from '../v12-entities.ts';
import { loadLangiumLexerOracle } from '../langium-lexer.ts';
import type { LangiumLex, LangiumToken } from '../langium-lexer.ts';
import { TREEVIEW_E2E_AT_LEAST, treeViewE2eIds, treeViewGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D213, D220, spec #518 T1): the v13 treeView lexer emits
 * the same tokens, by Chevrotain token type name and image, as `@mermaid-js/parser@2.0.1`'s
 * treeView lexer on the text v12 lexed, and the same hidden tokens. For a box-drawing source
 * that is the text after v12's box-drawing pass: the oracle captures what the shared Langium
 * parser received (`capture: 'langium'`), not what v12's diagram parser did.
 *
 * Normalisation, both sides (as wardley's gate):
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF and CR as
 *   LF (v13's token text);
 * - v12 appended a `\n` before lexing; v13 lexes a zero-width line break there, and the oracle
 *   takes that `\n` off the image of the token that matched it;
 * - v12's `NL` and `WS` are skipped Chevrotain tokens, in neither of its lists; v13 writes
 *   `Kind.Newline` tokens for the parser, which the gate leaves out;
 * - on a lexer error (D220) both streams are cut at the first error, which must be at the same
 *   place: the error is written `LEXICAL_ERROR` with the length of the text before it, as v12's
 *   parser read it. Chevrotain skips characters and goes on; neither side is compared after.
 *
 * A second gate checks v13's box-drawing pass against v12's on every source v12's treeView
 * parser received: the same rewritten text (what v12's Langium lexer read) when v12 rewrote it,
 * the same message (v12's line number included) when its pass threw, and no rewrite when it
 * left the text alone.
 *
 * Every source the gates do not compare is named, and the sets are asserted exactly:
 * - {@link EXCLUDED}, both differences in core's preprocess, shared by every type, not treeView
 *   lexer rules:
 *   - `treeView-cases/unclosed-directive` (all three copies), a `%%{` that starts a line and is
 *     never closed. Core's preprocess ends it at its line end and reports `UNCLOSED_DIRECTIVE`
 *     (an error: v13 rejects the source, asserted); v12's directive regex took the rest of the
 *     text (pie's, radar's and wardley's gates list it too);
 *   - `treeView-cases/cypress-custom-config-raw` (and its CRLF copy), the Cypress template as
 *     written, with a blank line before its `---`. Core reads front matter on the first
 *     non-blank line (asserted); v12's `getDiagramFromText` reads it only at offset 0 and lexed
 *     the `---` lines as names (and rejected the source, as it did the copy without the blank
 *     line, for its trailing blank line). Its commented copy puts the comment lines first, and
 *     core reads front matter after them too (D704), so it is excluded as well.
 * - {@link NOT_REACHED}: the sources v12 never lexed as treeView: the ones v12's box pass
 *   rejected (their messages are gated by the box gate), the ones another type took or none did
 *   (`treeview-beta`, an upper-case header), and the `commented()` copies of short sources,
 *   whose cut falls inside the header.
 */
const UNCLOSED = 'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)';
const variants = (id: string) => [id, `${id} (CRLF)`, `${id} (commented)`];
const LEADING_FRONT_MATTER = 'core reads front matter after leading blank lines';
const BEFORE_FENCE = 'core reads front matter after leading `%%` lines (D704)';
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  ...variants('treeView-cases/unclosed-directive').map((id) => [id, UNCLOSED] as const),
  ...[
    'treeView-cases/cypress-custom-config-raw',
    'treeView-cases/cypress-custom-config-raw (CRLF)',
  ].map((id) => [id, LEADING_FRONT_MATTER] as const),
  ['treeView-cases/cypress-custom-config-raw (commented)', BEFORE_FENCE],
]);
const BOX_ERROR = 'v12 box pass threw';
const NOT_TREEVIEW = 'not detected as treeView';
const CUT_HEADER = 'the commented() cut falls inside the header';
/** Box errors whose commented() copy cuts the header instead. */
const CUT_ERRORS = new Set([
  'box-error-empty-node-dashes',
  'box-error-empty-node-tab',
  'spec-box-throw-on-empty-content-after-prefix',
]);
const NOT_REACHED: ReadonlyMap<string, string> = new Map([
  ...[
    'box-error-empty-node-dashes',
    'box-error-empty-node-tab',
    'box-error-first-wins',
    'box-error-indent-after-comment-lines',
    'box-error-indent-after-front-matter',
    'box-error-indent-crlf',
    'box-error-indent-nbsp',
    'box-error-indent-tab',
    'spec-box-include-line-number-in-empty-content-error',
    'spec-box-throw-on-empty-content-after-prefix',
    'spec-box-throw-on-indented-line-without-box-chars',
  ].flatMap((id) =>
    (CUT_ERRORS.has(id) ? [id, `${id} (CRLF)`] : variants(id)).map(
      (v) => [`treeView-cases/${v}`, BOX_ERROR] as const
    )
  ),
  // The box-drawing errors of the recovery set and the box-mode column cases (#572).
  ...[
    'an-empty-box-drawing-node',
    'an-empty-box-drawing-node-and-a-title-after-a-node',
    'an-empty-box-drawing-node-and-an-unclosed-name',
    'an-indented-line-in-box-drawing',
    'an-indented-line-in-box-drawing-and-an-icon-that-does-not-close',
    'a-stray-blank-an-empty-box-drawing-node-and-a-title-after-a-node',
    'two-box-drawing-errors',
  ].flatMap((id) => variants(`treeView-recovery/${id}`).map((v) => [v, BOX_ERROR] as const)),
  ...['box-columns-error-deep', 'box-columns-error-entity', 'box-columns-error-tab'].flatMap((id) =>
    variants(`treeView-cases/${id}`).map((v) => [v, BOX_ERROR] as const)
  ),
  // The commented() cut splits a box line: an empty node.
  ...['box-cr-only', 'box-long-dashes'].map(
    (id) => [`treeView-cases/${id} (commented)`, BOX_ERROR] as const
  ),
  ...['not-treeview', 'header-upper'].flatMap((id) =>
    variants(`treeView-cases/${id}`).map((v) => [v, NOT_TREEVIEW] as const)
  ),
  ...[
    'treeView-cases/acc-descr-node',
    'treeView-cases/bare-blank-run-before-desc',
    'treeView-cases/bare-class-no-name',
    'treeView-cases/bare-class-no-name-blank',
    ...[1, 3, 8, 20, 23, 24].map((k) => `line separators ${k}`),
    'treeView-cases/bare-colon-start',
    'treeView-cases/bare-entity',
    'treeView-cases/bare-entity-number',
    'treeView-cases/bare-glued-class',
    'treeView-cases/bare-hash-glued',
    'treeView-cases/bare-html',
    'treeView-cases/bare-icon-glued',
    'treeView-cases/bare-inline-comment',
    'treeView-cases/bare-inner-blanks',
    'treeView-cases/bare-line-separator',
    'treeView-cases/bare-nel',
    'treeView-cases/bare-paragraph-separator',
    'treeView-cases/bare-percent',
    'treeView-cases/bare-quote-inside',
    'treeView-cases/bare-root',
    'treeView-cases/bare-simple',
    'treeView-cases/bare-single-hash',
    'treeView-cases/bare-slash-only',
    'treeView-cases/bare-trailing-tab',
    'treeView-cases/bare-two-colons',
    'treeView-cases/bare-unicode-space',
    'treeView-cases/bom',
    'treeView-cases/box-error-empty-node-dashes',
    'treeView-cases/box-error-empty-node-tab',
    'treeView-cases/box-glyph-in-quoted-indent',
    'treeView-cases/box-header-comment',
    'treeView-cases/box-header-indented',
    'treeView-cases/box-tab-after-dashes',
    'treeView-cases/box-tab-before-dashes',
    'treeView-cases/class-basic',
    'treeView-cases/class-blanks-after',
    'treeView-cases/class-digit-start',
    'treeView-cases/class-line-start',
    'treeView-cases/comment-inline-after-quoted',
    'treeView-cases/comment-inline-after-quoted-glued',
    'treeView-cases/cr-only',
    'treeView-cases/desc-basic',
    'treeView-cases/desc-empty',
    'treeView-cases/desc-line-start',
    'treeView-cases/front-matter',
    'treeView-cases/header-alone',
    'treeView-cases/header-comment',
    'treeView-cases/header-glued',
    'treeView-cases/header-glued-comment',
    'treeView-cases/header-glued-dash',
    'treeView-cases/header-indented',
    'treeView-cases/header-line-separator',
    'treeView-cases/header-nbsp',
    'treeView-cases/header-newline',
    'treeView-cases/header-node-same-line',
    'treeView-cases/header-trailing-blanks',
    'treeView-cases/header-trailing-tab',
    'treeView-cases/icon-basic',
    'treeView-cases/icon-empty',
    'treeView-cases/icon-line-start',
    'treeView-cases/icon-unclosed',
    'treeView-cases/quoted-double',
    'treeView-cases/quoted-empty',
    'treeView-cases/quoted-glued',
    'treeView-cases/quoted-single',
    'treeView-cases/quoted-then-blank-class',
    'treeView-cases/quoted-then-class',
    'treeView-cases/spec-box-throw-on-empty-content-after-prefix',
    'treeView-recovery/a-blank-after-the-header',
    'treeView-recovery/text-after-the-header',
    'v12-specs/boxDrawingPreprocessor.spec.ts#2',
    'v12-specs/treeView.test.ts#16',
    'v12-specs/treeView.test.ts#2',
    'v12-specs/treeView.test.ts#23',
    'v12-specs/treeView.test.ts#5',
  ].map((id) => [`${id} (commented)`, CUT_HEADER] as const),
]);
const ERROR = 'LEXICAL_ERROR';
const HIDDEN = new Set(['ML_COMMENT']);
const SKIPPED = new Set(['NL']);
const BOX_MESSAGE = /^Line \d+: (Empty node|Unexpected indentation)/;

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
  const lexed = treeViewLex(source);
  for (const [i, t] of lexed.tokens.entries()) {
    const name = LANGIUM_NAMES[t.kind] ?? `kind ${t.kind}`;
    if (t.kind === Kind.Error) {
      out.tokens.push([ERROR, `@${lexed.before(i).length}`]);
      break;
    }
    if (SKIPPED.has(name)) continue;
    (HIDDEN.has(name) ? out.hidden : out.tokens).push([name, t.text]);
  }
  return out;
}

const show = (t: LangiumToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

function firstDiff(a: LangiumToken[], b: LangiumToken[]): string | undefined {
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  let at = 0;
  while (JSON.stringify(a[at]) === JSON.stringify(b[at])) at++;
  const from = Math.max(0, at - 2);
  return `@${at}\n    v12 ${show(a.slice(from, at + 3))}\n    v13 ${show(b.slice(from, at + 3))}`;
}

describe('treeView lexer parity with @mermaid-js/parser@2.0.1 (Chevrotain)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadLangiumLexerOracle('treeView');
    const items = await treeViewGateCorpus();
    const diffs: string[] = [];
    const excluded: string[] = [];
    const unreached: string[] = [];
    const reasons: string[] = [];
    const accepted: string[] = [];
    let compared = 0;
    let e2e = 0;
    let errors = 0;
    let boxed = 0;
    for (const item of items) {
      const lexed = await oracle.lex(item.source);
      if (!lexed) {
        unreached.push(item.id);
        // For the reason given.
        const reason = NOT_REACHED.get(item.id);
        const trace = await oracle.trace(item.source);
        const boxError = trace.parsed !== undefined && BOX_MESSAGE.test(trace.error ?? '');
        if ((reason === BOX_ERROR) !== boxError) reasons.push(`${item.id}: ${trace.error}`);
        if (reason === CUT_HEADER && item.source.includes('treeView-beta')) reasons.push(item.id);
        continue;
      }
      compared++;
      if (item.id.startsWith('e2e/') && !item.id.endsWith(')')) e2e++;
      if (lexed.errorAt !== undefined) errors++;
      if (treeViewLex(item.source).box.kind === 'rewrite') boxed++;
      const v12 = v12Streams(lexed);
      const v13 = v13Streams(item.source);
      const tokens = firstDiff(v12.tokens, v13.tokens);
      const hidden = firstDiff(v12.hidden, v13.hidden);
      if (EXCLUDED.has(item.id)) {
        // Still different, and for the reason given: v13 rejects the source in preprocess.
        if (tokens ?? hidden) excluded.push(item.id);
        const pre = preprocess(item.source);
        const reason =
          EXCLUDED.get(item.id) === UNCLOSED
            ? pre.diagnostics.some((d) => d.code === 'UNCLOSED_DIRECTIVE' && d.severity === 'error')
            : pre.frontMatter !== undefined && /^\s/.test(item.source);
        if (!reason) accepted.push(item.id);
        continue;
      }
      if (tokens) diffs.push(`${item.id} tokens ${tokens}`);
      if (hidden) diffs.push(`${item.id} hidden ${hidden}`);
    }
    process.stdout.write(
      `treeView lexer parity: ${compared} of ${items.length} sources lexed by v12, ${errors} with a lexer error, ${boxed} after a box rewrite\n`
    );
    expect(diffs).toEqual([]);
    expect(excluded.sort()).toEqual([...EXCLUDED.keys()].sort());
    expect(accepted).toEqual([]);
    expect(unreached.sort()).toEqual([...NOT_REACHED.keys()].sort());
    expect(reasons).toEqual([]);
    // Every e2e fixture in the folder reaches the treeView lexer, and there are at least the
    // #577 set (`TREEVIEW_E2E_AT_LEAST`).
    expect(e2e).toBe(treeViewE2eIds().length);
    expect(e2e).toBeGreaterThanOrEqual(TREEVIEW_E2E_AT_LEAST);
    expect(compared).toBe(items.length - NOT_REACHED.size);
  }, 300_000);

  it("rewrites box drawing as v12's pass did, and throws its errors", async () => {
    const oracle = await loadLangiumLexerOracle('treeView');
    const items = await treeViewGateCorpus();
    const diffs: string[] = [];
    let rewritten = 0;
    let thrown = 0;
    for (const item of items) {
      const trace = await oracle.trace(item.source);
      if (trace.parsed === undefined) continue;
      const { box } = treeViewLex(item.source);
      const v12Error = trace.lexed === undefined && BOX_MESSAGE.test(trace.error ?? '');
      const v13Error = box.kind === 'error' ? box.errors[0].message : undefined;
      if (v12Error || v13Error !== undefined) {
        thrown++;
        if (v13Error !== (v12Error ? trace.error : undefined)) {
          diffs.push(`${item.id}: v12 ${trace.error}\n    v13 ${v13Error}`);
        }
        continue;
      }
      if (trace.lexed === undefined) {
        diffs.push(`${item.id}: v12 never lexed it (${trace.error})`);
        continue;
      }
      const v12 = v12TokenText(trace.lexed);
      if (box.kind === 'rewrite') {
        rewritten++;
        const v13 = ampEntities(box.rewrite.text);
        if (v13 !== v12) {
          diffs.push(`${item.id}:\n    v12 ${JSON.stringify(v12)}\n    v13 ${JSON.stringify(v13)}`);
        }
      } else if (trace.lexed !== trace.parsed) {
        diffs.push(`${item.id}: v12 rewrote it, v13 did not\n    v12 ${JSON.stringify(v12)}`);
      }
    }
    process.stdout.write(`treeView box pass: ${rewritten} rewritten, ${thrown} rejected\n`);
    expect(diffs).toEqual([]);
    expect(rewritten).toBeGreaterThan(0);
    expect(thrown).toBeGreaterThan(0);
  }, 300_000);
});
