import { describe, expect, it } from 'vitest';
import { JISON_NAMES, requirementTokens } from '@mermaid-js/diagram-requirement';
import { v12TokenText } from '../v12-entities.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonRule, JisonToken } from '../jison/oracle.ts';
import type { CorpusItem } from '../types.ts';
import {
  D431_RULES,
  D432_RULES,
  DECIDED_RULES,
  DIRECTIONS,
  requirementGateCorpus,
  VARIANTS,
} from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D212, spec #520 T1, #560): the v13 requirement lexer
 * emits the same terminals, with the same images, as mermaid 12.2.0's
 * `requirementDiagram.jison` lexer on the text v12 lexed (`loadJisonLexerOracle('requirement')`),
 * with the two decided changes below applied to v12's lexer itself.
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so the oracle takes that `\n` off the token that matched it;
 * - after a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`
 *   (v13 writes a one-character error token and lexes on, for recovery).
 *
 * Every source is also lexed in each generated variant (`VARIANTS`): with comment lines added
 * (and one through the middle of a short body), with every line break a CR followed by a
 * removed comment or directive line, with CRLF line breaks, with tab indents, with a blank
 * before every line break (D431 everywhere), and with a directive through the middle of every
 * line after the header (pitfall 3). The cases file holds the line-separator cases (pitfall 2).
 *
 * Listed exclusions (the decided changes; each is a rule of v12's lexer replaced for the
 * comparison, `DECIDED_RULES` in `./corpus.ts`, so every other rule is still compared):
 * - D431, rule 13 `\s+`: v12's blank rule also takes line breaks, so a blank before a line end
 *   swallowed it and v12 rejected `requirementDiagram␠`, `{␠`, `risk: high␠` and `"x"␠` at a
 *   line end. Decided: the lexer drops blanks before a line break. A blank run after other
 *   text on its line now ends at its first line break, which is a `NEWLINE`; at a line start
 *   the run is skipped whole, as before (v12's stream there is unchanged).
 * - D432, rules 8–11 `.*direction\s+(TB|BT|RL|LR)[^\n]*`: v12 tried them first at every token
 *   start, so a `direction XX` anywhere on a line made the whole line a direction token
 *   (`a - traces -\> b direction LR` lost its relationship), and a long line lexed in
 *   quadratic time. Decided: `direction` is read only as a statement at the start of a line:
 *   `direction`, blanks and a direction, then `\b`. The rest of the line, and every other
 *   line, lexes as usual (`direction LR a - traces -\> b` is a direction and a relation, which
 *   the grammar rejects; v12 accepted it and dropped the relation). Its leading blanks are
 *   skipped, not part of the token;
 * - v13 kinds with no jison name, left out of the v13 stream: the quotes around a string, the
 *   `accDescr {` opener and its `}`, the line break that ends a style statement, comments
 *   (the `%%` lines v12 removed and the `#…`/`%…` comments jison skips) and directives, which
 *   v13 writes as trivia;
 * - the sources in {@link EXCLUDED}, with every variant of them: two differences in core's
 *   preprocess, shared by every type, not in a requirement lexer rule;
 * - sources v12 never lexed as a requirement diagram (`oracle.tokens` is undefined: the
 *   detector `/^\s*requirement(Diagram)?/` is case-sensitive, and a commented copy of a short
 *   body can cut the header); the test bounds which.
 *
 * Empty-image tokens are not excluded: `EOF` (`<<EOF>>`, zero-width), the clipped appended
 * `NEWLINE`, and the empty value jison returns when the text ends inside quotes, an
 * `accTitle:`/`accDescr:` value or an `accDescr {` block are v13 tokens too.
 */
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    // v12's directive regex also removed the line break after an unclosed `%%{x}` and the rest
    // of the text (venn's, treemap's, pie's and cynefin's gates list it too).
    'requirement-cases/directive-unclosed',
    'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)',
  ],
  [
    // `preprocess.spec.ts` lists the same file as a decided divergence.
    'e2e/visual-check/with-a-theme-default.mmd',
    'core reads front matter after a leading blank line; v12 render() lexed its fences as text',
  ],
]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VARIANT = new RegExp(` \\((?:${VARIANTS.map(([s]) => escape(s)).join('|')})\\)$`);

function v13Tokens(source: string): JisonToken[] {
  const out: JisonToken[] = [];
  for (const t of requirementTokens(source)) {
    const name = JISON_NAMES[t.kind];
    if (!name) continue;
    if (name === LEXICAL_ERROR) {
      out.push([LEXICAL_ERROR, '']);
      break;
    }
    out.push([name, t.text]);
  }
  return out;
}

/** Direction images without their leading blanks (v13's direction token starts at `direction`). */
const trimDirections = (t: JisonToken[] | undefined) =>
  t?.map(([n, i]): JisonToken => [n, n.startsWith('direction_') ? i.trimStart() : i]);
const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
const same = (a: JisonToken[] | undefined, b: JisonToken[] | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

const H = 'requirementDiagram\n';
/** Non-ASCII code units each rule class treats apart: blanks, line ends, case folds, halves. */
const NON_ASCII = [
  0x85, 0xa0, 0xb5, 0xc0, 0xc4, 0x17f, 0x1680, 0x2000, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f,
  0x212a, 0x3000, 0xd83d, 0xdc00, 0xfb02, 0xfeff, 0xfffe, 0xb6,
].map((c) => String.fromCharCode(c));
const ASCII = Array.from({ length: 128 }, (_, c) => String.fromCharCode(c));

/**
 * Code units in each character-class position, generated: every unit inside an unquoted and a
 * quoted string (one source each; `<`, `>`, `=` and CR, which end an unquoted string with an
 * error or a line break, and `"` left out), and each ASCII unit and the non-ASCII ones above
 * at a token start and in a style statement (one source each, as jison stops at an error).
 */
function codeUnits(): CorpusItem[] {
  const all = Array.from({ length: 0x10000 }, (_, c) => String.fromCharCode(c));
  const unquoted = all.filter((ch) => !'<>=\r\n"'.includes(ch));
  const one = [...ASCII, ...NON_ASCII];
  return [
    { id: 'code units: unquoted', source: H + unquoted.map((ch) => `a${ch}b`).join('\n') },
    {
      id: 'code units: quoted',
      source: H + 'requirement "' + all.filter((ch) => ch !== '"').join('') + '" {\n}',
    },
    ...one.map((ch, k) => ({ id: `code units: token start ${k}`, source: `${H}${ch}x\n` })),
    ...one.map((ch, k) => ({ id: `code units: style ${k}`, source: `${H}style a ${ch}x:#f00\n` })),
  ];
}

interface V12Lexer {
  rules: RegExp[];
}
interface MermaidV12 {
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ parser: { parser: { lexer: V12Lexer } } }>;
  };
}

describe('requirement lexer parity with mermaid@12 (jison)', () => {
  it('replaces the rules the two decisions name', async () => {
    await loadJisonLexerOracle('requirement');
    const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
    const { rules } = (await mermaid.mermaidAPI.getDiagramFromText('requirementDiagram\n')).parser
      .parser.lexer;
    expect(rules.length).toBe(71);
    expect(rules[13]?.source).toBe(String.raw`^(?:\s+)`);
    expect([8, 9, 10, 11].map((k) => rules[k]?.source)).toEqual(
      DIRECTIONS.map((d) => String.raw`^(?:.*direction\s+${d}[^\n]*)`)
    );
    expect(Object.keys(D431_RULES)).toEqual(['13']);
    expect(Object.keys(D432_RULES)).toEqual(['8', '9', '10', '11']);
  });

  it('emits the same tokens over the corpus, the cases and their variants', async () => {
    const oracle = await loadJisonLexerOracle('requirement');
    const items = [...(await requirementGateCorpus()), ...codeUnits()];
    const diffs: string[] = [];
    const skipped: string[] = [];
    /** Sources (not variants) whose stream each decision changes, by decision. */
    const changed: Record<'D431' | 'D432', string[]> = { D431: [], D432: [] };
    let compared = 0;
    let e2e = 0;
    let specs = 0;
    let cases = 0;
    const excluded: string[] = [];
    /** Sources whose only D432 change is a direction token without its leading blanks. */
    let indented = 0;
    for (const item of items) {
      if ([...EXCLUDED.keys()].some((prefix) => item.id.startsWith(prefix))) {
        excluded.push(item.id);
        continue;
      }
      const v12 = await oracle.tokens(item.source, { rules: DECIDED_RULES });
      if (!v12) {
        skipped.push(item.id);
        continue;
      }
      compared++;
      if (!VARIANT.test(item.id)) {
        if (item.id.startsWith('e2e')) e2e++;
        if (item.id.startsWith('v12-')) specs++;
        if (item.id.startsWith('requirement-cases/')) cases++;
        const plain = await oracle.tokens(item.source);
        const only = async (rules: Readonly<Record<number, JisonRule>>) =>
          await oracle.tokens(item.source, { rules });
        if (!same(plain, await only(D431_RULES))) changed.D431.push(item.id);
        const d432 = await only(D432_RULES);
        // A direction line's leading blanks leave its token: an image-only change.
        if (!same(plain, d432)) {
          if (same(trimDirections(plain), trimDirections(d432))) indented++;
          else changed.D432.push(item.id);
        }
      }
      const expected = v12.map(([n, i]): JisonToken => [n, v12TokenText(i)]);
      const cut = expected.findIndex(([n]) => n === LEXICAL_ERROR);
      if (cut >= 0) expected.length = cut + 1;
      const actual = v13Tokens(item.source);
      if (same(expected, actual)) continue;
      let at = 0;
      while (same([expected[at]!], [actual[at]!])) at++;
      const near = (t: JisonToken[]) => show(t.slice(Math.max(0, at - 2), at + 3));
      diffs.push(`${item.id} @${at}\n  v12 ${near(expected)}\n  v13 ${near(actual)}`);
    }
    process.stdout.write(
      `requirement lexer parity: ${compared} of ${items.length} sources lexed by v12; ` +
        `D431 changes ${changed.D431.length}, D432 ${changed.D432.length} ` +
        `(and the leading blanks of ${indented})\n`
    );
    expect(diffs).toEqual([]);
    // The excluded sources: the two above, and their variants.
    expect(excluded.filter((id) => !VARIANT.test(id))).toHaveLength(EXCLUDED.size);
    // Every e2e fixture, harvested spec and syntax-page string and case reaches the lexer, but
    // the unclosed-front-matter title case (v12 rejects its front matter), the upper-case
    // header case and the excluded sources.
    expect(e2e).toBe(200);
    expect(specs).toBe(48);
    expect(cases).toBe(203);
    // No e2e fixture, harvested string or syntax-page example depends on either decision, but
    // for the leading blanks D432 leaves out of an indented direction token.
    expect(changed.D431.filter((id) => !id.startsWith('requirement-cases/'))).toEqual([]);
    expect(changed.D432.filter((id) => !id.startsWith('requirement-cases/'))).toEqual([]);
    expect([changed.D431.length, changed.D432.length]).toEqual([19, 13]);
    // The only sources v12 does not lex: the cases whose header v12 does not detect (and their
    // variants), and commented copies of a body of two lines or fewer, where `%% cut` goes
    // through the middle of the header.
    const byId = new Map(items.map((item) => [item.id, item.source]));
    const undetected = new Set([
      'requirement-cases/title-front-matter-unclosed',
      'requirement-cases/header-upper-case',
    ]);
    expect(
      skipped.filter((id) => {
        const base = id.replace(VARIANT, '');
        if (undetected.has(base)) return false;
        const original = byId.get(base) ?? '';
        const cut = byId.get(id) ?? '';
        const header = id.endsWith(' (commented)') && original.split('\n').length <= 2;
        return !(header && !/^\s*requirement/.test(cut));
      })
    ).toEqual([]);
    expect(skipped.length).toBeLessThan(24);
  }, 600_000);
});
