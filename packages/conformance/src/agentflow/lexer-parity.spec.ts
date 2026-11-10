import { describe, expect, it } from 'vitest';
import { agentflowTokens, AgentflowTokenKind, JISON_NAMES } from '@mermaid-js/diagram-agentflow';
import { decodeEntities } from '../flowchart/v12.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonLexerOracle, JisonToken } from '../jison/oracle.ts';
import { agentflowGateCorpus, VARIANTS } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, #544): the v13 agentflow lexer emits the same terminals,
 * with the same images, as mermaid 12.2.0's jison lexer on the text v12 lexed. That text keeps
 * the comments (agentflow's DB set `preserveCommentsWhenParsing`), so `COMMENT` tokens are
 * compared too, and the generated variants that add comment lines check them rather than
 * their removal. Past `maxTextSize` v12 lexed the comment-free text instead, and so does v13
 * (the `v12-max-text-size-4000` case).
 *
 * Normalisation, both sides:
 * - runs of `TEXT`, `EDGE_TEXT`, `STR` and `MD_STR` are merged (jison splits some per
 *   character, and around the `%%` comments it skips inside labels; v13 splits strings where
 *   a removed directive was);
 * - images are compared as v12's parser read them: entity placeholders decoded (after the
 *   merge, as a placeholder can span split tokens), CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, and the shared oracle takes that `\n` off the token that matched it
 *   (D212). Inside an unclosed quoted shape-data value jison folded it into `<br/>`, which v13
 *   folds too;
 * - after a lexical error jison stops, so both streams are cut at the first `INVALID` (the
 *   oracle's `LEXICAL_ERROR`); an entity placeholder outside a label errors after its `ﬂ`.
 *
 * Left out of the v13 stream (v13 kinds with no jison name, as jison's rule returns no token):
 * the `}` closing shape data, the `click` keyword, the `%%` comments inside a text, ellipse or
 * trapezoid label (`Kind.Comment`), and directives. The `@{` opener keeps its image in v13
 * (jison clears it): compared as empty.
 *
 * Exclusions, listed and pinned below:
 * - D463: a lone `%` in a text or trapezoid label. 12.2.0 compiled the rules' `%(?!%)` to
 *   `(?!)`, so its stream stops there with `LEXICAL_ERROR`, where v13 reads the `%` as label
 *   text, as the rules intend and as flowchart does. Each such source must match v12's
 *   stream for the same source with every lone `%` written as `!` (which every rule reads as
 *   it reads `%`, but the label ones), and the cases holding one are listed.
 * - D462 (`[/…/]` is a parallelogram of kind input) needs none: 12.2.0 already lexes it as
 *   `TRAPSTART TEXT INVTRAPEND`; it differs in v12's shape table after the tag, not in its
 *   lexer (the model parity of #546 lists it).
 */
const MERGED = new Set(['TEXT', 'EDGE_TEXT', 'STR', 'MD_STR']);
const VARIANT = new RegExp(` \\((?:${VARIANTS.map(([s]) => s).join('|')})\\)$`);

function normalise(tokens: JisonToken[]): JisonToken[] {
  const out: JisonToken[] = [];
  for (const [name, image] of tokens) {
    const last = out[out.length - 1];
    if (last && last[0] === name && MERGED.has(name)) last[1] += image;
    else out.push([name, image]);
    if (name === 'INVALID') {
      out[out.length - 1] = ['INVALID', ''];
      break;
    }
  }
  return out;
}

function v13Tokens(source: string): JisonToken[] {
  let quoted = false;
  return normalise(
    agentflowTokens(source).flatMap((t): JisonToken[] => {
      const name = JISON_NAMES[t.kind];
      if (!name) return [];
      if (t.kind !== AgentflowTokenKind.ShapeData) return [[name, t.text]];
      // jison clears the image of the `@{` opener, and folds line breaks inside a quoted
      // shape-data value into `<br/>`; v13 keeps the source text (the parser folds).
      if (t.text === '@{') return [[name, '']];
      if (t.text === '"') quoted = !quoted;
      else if (quoted) {
        // At the end of the text v12's appended line break folded in too.
        const atEnd = t.range.end === source.length;
        return [[name, (atEnd ? t.text + '\n' : t.text).replace(/\n\s*/g, '<br/>')]];
      }
      return [[name, t.text]];
    })
  );
}

/** jison lexes the `ﬂ` of an entity placeholder outside labels, then fails on `°`. */
function cutEntityError(tokens: JisonToken[]): JisonToken[] {
  const i = tokens.findIndex(
    ([n, img], k) => n === 'UNICODE_TEXT' && img === 'ﬂ' && tokens[k + 1]?.[0] === 'INVALID'
  );
  return i < 0 ? tokens : [...tokens.slice(0, i), ['INVALID', '']];
}

/** A `%` that is not part of a `%%` (a directive next to it is removed first). */
const LONE_PERCENT = /(?<!%)%(?!%)|(?<!%)%(?=%%\{)|(?<=\}%%)%(?!%)/g;

/**
 * v12's tokens for `source`, normalised and decoded as the gate compares them (undefined when
 * v12 does not lex it as agentflow).
 */
async function v12Tokens(
  oracle: JisonLexerOracle,
  source: string
): Promise<JisonToken[] | undefined> {
  const v12 = await oracle.tokens(source);
  if (!v12) return undefined;
  const named = v12.map(([n, i]): JisonToken => [n === LEXICAL_ERROR ? 'INVALID' : n, i]);
  // Merged first: a placeholder split over per-character tokens decodes only when whole.
  return normalise(cutEntityError(named)).map(([n, i]): JisonToken => [n, decodeEntities(i)]);
}

/**
 * D463: v12 stopped at a lone `%` with a lexical error, and with every lone `%` written as `!`
 * (an id, text, edge-text and shape-data character in every state, where `%` is one too but
 * in labels) v12's stream is v13's, `%` read as `!`.
 */
async function lonePercent(
  oracle: JisonLexerOracle,
  source: string,
  expected: JisonToken[],
  actual: JisonToken[]
): Promise<boolean> {
  if (expected.at(-1)?.[0] !== 'INVALID' || actual.at(-1)?.[0] === 'INVALID') return false;
  const swapped = await v12Tokens(oracle, source.replace(LONE_PERCENT, '!'));
  const read = actual.map(([n, i]): JisonToken => [n, i.replace(LONE_PERCENT, '!')]);
  return JSON.stringify(swapped) === JSON.stringify(read);
}

describe('agentflow lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the corpus, the cases and their variants', async () => {
    const oracle = await loadJisonLexerOracle('agentflow');
    const items = await agentflowGateCorpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    const skipped: string[] = [];
    const percent: string[] = [];
    let compared = 0;
    let e2e = 0;
    let specs = 0;
    let cases = 0;
    for (const item of items) {
      const expected = await v12Tokens(oracle, item.source);
      if (!expected) {
        skipped.push(item.id);
        continue;
      }
      compared++;
      if (!VARIANT.test(item.id)) {
        if (item.id.startsWith('e2e')) e2e++;
        if (item.id.startsWith('v12-')) specs++;
        if (item.id.startsWith('agentflow-cases/')) cases++;
      }
      const actual = v13Tokens(item.source);
      if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
      if (await lonePercent(oracle, item.source, expected, actual)) {
        percent.push(item.id);
        continue;
      }
      let at = 0;
      while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
      diffs.push({
        id: item.id,
        at,
        v12: expected.slice(Math.max(0, at - 2), at + 3),
        v13: actual.slice(Math.max(0, at - 2), at + 3),
      });
    }
    process.stdout.write(
      `lexer parity: ${compared} of ${items.length} sources lexed by v12, ` +
        `${percent.length} D463 exclusions, ${skipped.length} skipped\n`
    );
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
    // Every e2e fixture, every harvested spec and syntax-page string and every case but one
    // reaches the lexer.
    expect({ e2e, specs, cases }).toEqual({ e2e: 57, specs: 179, cases: 253 });
    // D463: the cases with a lone `%` in a text or trapezoid label, in each variant that keeps
    // it; a lone `%` elsewhere (ellipse and edge text, ids, strings, shape data) and `%%` in a
    // label lex as in v12.
    expect([...new Set(percent.map((id) => id.replace(VARIANT, '')))].sort()).toEqual(
      ['diamond', 'pipe', 'round', 'text', 'text-end', 'text-start', 'trap', 'two'].map(
        (c) => `agentflow-cases/percent-${c}`
      )
    );
    expect(percent).toHaveLength(58);
    // The only source v12 does not lex: `agentflow-betax`, no agentflow to v12's detector
    // (`^\s*agentflow-beta\b`), in each variant that changes it.
    expect(skipped).toEqual(
      ['', ' (commented)', ' (CR cut)', ' (CR cut by a directive)', ' (CRLF)', ' (tabs)'].map(
        (v) => `agentflow-cases/header-word${v}`
      )
    );
  }, 300_000);
});
