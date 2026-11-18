import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flowchartTokens, FlowTokenKind, JISON_NAMES } from '@mermaid-js/diagram-flowchart';
import { corpusFromDir, isEmbeddedFixture, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { v12TokenText } from '../v12-entities.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { D621_RULES, LINK_ID_12_3, LINK_ID_RULE } from './d621.ts';

/**
 * Lexer-parity gate (notes/07): the v13 flowchart lexer emits the same terminals, with the same
 * images, as mermaid@12's jison lexer on the text v12 lexed.
 *
 * Normalisation, both sides:
 * - runs of `TEXT`, `EDGE_TEXT`, `STR` and `MD_STR` are merged (jison splits some per
 *   character; v13 splits strings where a removed comment line was);
 * - images are compared as v12's parser read them: entity placeholders decoded (after the
 *   merge, as a placeholder can span split tokens), CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, and the shared oracle takes that `\n` off the token that matched it
 *   (none when a skipped run took it, D212). Inside an unclosed quoted shape-data value jison
 *   folded it into `<br/>`, which v13 folds too.
 *
 * Every source is also lexed with comment lines added, which v12 removed before lexing.
 *
 * Deliberate differences: the `@{` opener keeps its image in v13 (jison clears it); v13 also emits the closing `}` of shape data (jison drops it), and
 * comments and directives as trivia; both are left out. After a lexical error jison stops, so
 * both streams are cut at the first `INVALID` (the oracle's `LEXICAL_ERROR`; flowchart's jison
 * has no `INVALID` terminal).
 *
 * The decided change (D621, ahead of the oracle bump, D316): 12.2.0's LINK_ID rule is replaced
 * in v12's lexer by 12.3.0's (`D621_RULES`), whose run also stops at `[ ] ( ) { } |`; every
 * other rule is still compared.
 */
const MERGED = new Set(['TEXT', 'EDGE_TEXT', 'STR', 'MD_STR']);

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
    flowchartTokens(source).flatMap((t): JisonToken[] => {
      const name = JISON_NAMES[t.kind];
      if (!name) return [];
      if (t.kind !== FlowTokenKind.ShapeData) return [[name, t.text]];
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

async function corpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/flowchart'), 'e2e')) {
    if (!isEmbeddedFixture(item)) items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/flowchart-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  const cases = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/flowchart-cases.json'), 'utf8')
  ) as CorpusItem[];
  const all = [...items, ...specs, ...cases];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}

/**
 * `src` with nine comment lines after every line of the body, or one through the middle of a
 * one-line body. v12 removed them before lexing, so tokens must match across them.
 */
function commented(src: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  const body = src.slice(head.length);
  const lines = body.split('\n');
  const cut = Math.floor(body.length / 2);
  const split = body.slice(0, cut) + '\n%% cut\n' + body.slice(cut);
  return head + (lines.length > 2 ? lines.join('\n' + '  %% c\n'.repeat(9)) : split);
}

interface V12Lexer {
  rules: RegExp[];
}
interface MermaidV12 {
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ parser: { parser: { lexer: V12Lexer } } }>;
  };
}

describe('flowchart lexer parity with mermaid@12 (jison)', () => {
  it('replaces the rule D621 names, and only it', async () => {
    await loadJisonLexerOracle('flowchart');
    const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
    const { rules } = (await mermaid.mermaidAPI.getDiagramFromText('flowchart TD\n')).parser.parser
      .lexer;
    expect(rules.length).toBe(122);
    expect(rules[LINK_ID_RULE]?.source).toBe(String.raw`^(?:[^\s\"]+@(?=[^\{\"]))`);
    expect(Object.keys(D621_RULES)).toEqual([String(LINK_ID_RULE)]);
    // flow.jison at 12.3.0 (a5060b1d8): `[^\s\"\[\]\(\)\{\}\|]+\@(?=[^\{\"])`.
    expect(LINK_ID_12_3.source).toBe(String.raw`^(?:[^\s"[\](){}|]+@(?=[^{"]))`);
  });

  it('emits the same tokens over the e2e fixtures and the v12 spec strings', async () => {
    const oracle = await loadJisonLexerOracle('flowchart');
    const items = await corpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    let compared = 0;
    for (const item of items) {
      const v12 = (await oracle.tokens(item.source, { rules: D621_RULES }))?.map(
        ([n, i]): JisonToken => [n === LEXICAL_ERROR ? 'INVALID' : n, i]
      );
      if (!v12) continue;
      compared++;
      // Merged first: a placeholder split over per-character tokens decodes only when whole.
      const expected = normalise(cutEntityError(v12)).map(
        ([n, i]): JisonToken => [n, v12TokenText(i)]
      );
      const actual = v13Tokens(item.source);
      if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
      let at = 0;
      while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
      diffs.push({
        id: item.id,
        at,
        v12: expected.slice(Math.max(0, at - 2), at + 3),
        v13: actual.slice(Math.max(0, at - 2), at + 3),
      });
    }
    process.stdout.write(`lexer parity: ${compared} of ${items.length} sources lexed by v12\n`);
    expect(compared).toBeGreaterThan(700);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
  }, 120_000);
});
