/**
 * #469: first-party detection against v12 12.2.0's `detectType`, for every row of the detector
 * table (`tools/gen-config/src/registry.ts`, `V12_DETECTORS`). v12 ran its detectors on the text
 * after front matter with directives removed by its `directiveRegex` and each `%%` comment cut
 * together with its line break (`stripAnyComments`, which leaves a `%%` with no line break after
 * it). v13 tests each row's pattern on the raw body first, then on the body with directives
 * removed as core's preprocess reads them and each comment cut, a `%%` on the last line kept
 * (`detectText` in `packages/core/src/preprocess/detect-text.ts`, shared by the registry and the language service). For each type's header `H`, the cases are
 * a comment right after it with and without a line break, a directive after it, a directive
 * inside the keyword, and the detector order when one row matches only the cleaned text and a
 * later one the raw text; then seeded mixes of every header with comment and directive pieces.
 * The language service must detect what mermaid detects, for the same cases and mixes.
 * v13 must give v12's type, or reject where v12 rejects, except the listed divergences and, in
 * the mixes, three kinds:
 * - an unclosed `%%{` is an UNCLOSED_DIRECTIVE error in core's preprocess, every type (the
 *   parity gates exclude it), where v12's regex took the rest of the line;
 * - a type matched on the raw body, which starts after leading directives read to their `}%%`,
 *   tried first as the registry always did;
 * - {@link DIRECTIVE_CUT}: v12's directive regex removed another span than core's preprocess (it
 *   stopped at a lone CR, U+2028, U+2029, or after a one-line directive's first value word).
 */
import { readFileSync } from 'node:fs';
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import { createLanguageService } from '@mermaid-js/language-service';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { loadOracle } from './oracle.ts';

await loadOracle();
const v12 = (
  (await import('mermaid-v12')) as unknown as {
    default: { detectType(text: string): string };
  }
).default;
const v13 = createMermaid();
const service = createLanguageService();
/** The type the language service detects, as `outcome` writes mermaid's. */
const serviceType = (text: string): string =>
  service.update('file:///d.mmd', text).type ?? 'rejected';

const TABLE = readFileSync(
  new URL('../../../tools/gen-config/src/registry.ts', import.meta.url),
  'utf8'
);
/** The types of `V12_DETECTORS`, in order. */
const ROWS = [...TABLE.matchAll(/^ {2}\['([\w-]+)', '/gm)].map((m) => m[1]!);

/** A header each type's v12 detector takes on its own. */
const HEADERS: Readonly<Record<string, string>> = {
  'flowchart-elk': 'flowchart-elk',
  mindmap: 'mindmap',
  architecture: 'architecture-beta',
  agentflow: 'agentflow-beta',
  c4beta: 'c4-beta',
  c4: 'C4Context',
  kanban: 'kanban',
  classDiagram: 'classDiagram',
  er: 'erDiagram',
  gantt: 'gantt',
  info: 'info',
  pie: 'pie',
  requirement: 'requirementDiagram',
  sequence: 'sequenceDiagram',
  swimlane: 'swimlane-beta',
  'flowchart-v2': 'flowchart',
  timeline: 'timeline',
  gitGraph: 'gitGraph',
  stateDiagram: 'stateDiagram-v2',
  journey: 'journey',
  quadrantChart: 'quadrantChart',
  sankey: 'sankey-beta',
  packet: 'packet-beta',
  xychart: 'xychart-beta',
  block: 'block-beta',
  eventmodeling: 'eventmodeling',
  treeView: 'treeView-beta',
  radar: 'radar-beta',
  ishikawa: 'ishikawa-beta',
  treemap: 'treemap',
  railroad: 'railroad-beta',
  railroadEbnf: 'railroad-ebnf-beta',
  railroadAbnf: 'railroad-abnf-beta',
  railroadPeg: 'railroad-peg-beta',
  venn: 'venn-beta',
  wardley: 'wardley-beta',
  cynefin: 'cynefin-beta',
  usecase: 'usecase-beta',
};

const BODY = '\n  x\n';

/**
 * Types with no v12 oracle: 12.2.0 does not know them (spec #730's `c4beta`), so v12's
 * `detectType` rejects their header and there is nothing to compare v13 with. They are held to
 * the rule the cases show for every other type, that a comment or directive around the header does
 * not change the type, and to their own probes below. The comparison with v12 stays for every
 * other type, and for these it says only that v12 rejects them, so a v12 that gains the type
 * fails here and the exception is removed.
 */
const NO_V12_ORACLE: ReadonlySet<string> = new Set(['c4beta']);

/** The cases for one header. */
function cases(h: string): [name: string, text: string][] {
  const k = Math.ceil(h.length / 2);
  return [
    ['header alone', h + BODY],
    ['comment, no line break', `${h}%% c`],
    ['comment, then a body', `${h}%% c${BODY}`],
    ['spaced comment, then a body', `${h} %% c${BODY}`],
    ['directive after it', `${h} %%{init: {}}%%${BODY}`],
    ['directive right after it', `${h}%%{init: {}}%%${BODY}`],
    ['directive inside the keyword', `${h.slice(0, k)}%%{init: {}}%%${h.slice(k)}${BODY}`],
  ];
}

/**
 * Order: a row that matches only v12's text comes before a later row that matches the raw
 * body. v13 tries both texts row by row, so the earlier row wins, as in v12.
 */
const ORDER: [name: string, text: string][] = [
  [
    'flowchart-elk split by a directive (flowchart-v2 matches the raw body)',
    'flowchart%%{init: {}}%%-elk TD\n  a\n',
  ],
  ['classDiagram split by a directive (none matches raw)', 'class%%{init: {}}%%Diagram\n  a\n'],
  ['C4 name in a comment line after a flowchart header', 'flowchart LR\n  %% C4Container\n  a\n'],
];

const DIRECTIVE_CUT =
  'v12’s directive cut before detection is not reproduced in core (size, R-PERF-8): core removes the directive to its `}%%`';

/**
 * A keyword split by a directive whose span v12's regex read otherwise: v12 left part of it in
 * the text, so the keyword was broken; core removes all of it and the keyword matches.
 */
const DIRECTIVE_SPLITS: [name: string, text: string][] = [
  [
    'keyword split by a one-line directive with two value words',
    'cyne%%{init: x y}%%fin-beta\n  a\n',
  ],
  ['keyword split by a directive holding a lone CR', 'cyne%%{init: {\r}}%%fin-beta\n  a\n'],
  ['keyword split by a directive holding U+2028', 'pi%%{init: {\u2028}}%%e\n  a\n'],
];

/** Case name → why v13 detects otherwise than v12. */
const DIVERGENCES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(DIRECTIVE_SPLITS.map(([n]) => [`directive: ${n}`, DIRECTIVE_CUT])),
};

/** Pieces the seeded mixes put inside or after a header, one or two at a time. */
const FRAGMENTS = [
  '%% c\n',
  ' %% c\n',
  '%% c',
  '%%',
  '%%{init: {}}%%',
  '%%{ wrap }%%',
  '%%{init: x}%%',
  '%%{init: x y}%%',
  '%%{wrap x}%%',
  '%%{init : {"a": "}"}}%%',
  '%%{init: {\r\n}}%%',
  '%%{init: {\r}}%%',
  '%%{init: {\u2028}}%%',
  '%%{init:\n{}}%%',
  '%%{init: {}} %%',
  '%%{ \n init: {}}%%',
  '%%{{}}%%',
  '%%{init: {}}%% %% c\n',
  ' ',
  '\n',
  ':',
];
const TAILS = [BODY, '', '\n', '\r\n  x\n'];

/** Each row's pattern, as the table writes it (`[type, source, flags]`). */
const PATTERNS: Readonly<Record<string, RegExp>> = Object.fromEntries(
  [...TABLE.matchAll(/^ {2}\['([\w-]+)', '((?:[^'\\]|\\.)*)', '(\w*)'\]/gm)].map((m) => [
    m[1]!,
    new RegExp(m[2]!.replaceAll('\\\\', '\\'), m[3]),
  ])
);

/**
 * Whether v13's `type` came from the raw body: the text from the diagram's start after core's
 * preprocess (front matter, and leading directives and comments, read as core reads them for
 * every type). The registry tries it first, as it always did.
 */
function fromRawBody(type: string, text: string): boolean {
  const body = text.slice(diagramStart(text, preprocess(text)));
  return PATTERNS[type]?.test(body) ?? false;
}

/**
 * v12's `directiveRegex` removal, test-only, as a linear scanner (the regex's nested quantifier
 * backtracks): `%%{`, blanks, a word (and a `:` after it, blanks allowed), blanks, then either a
 * word or everything up to `}%%` or a character `.` does not match (a lone CR, U+2028, U+2029),
 * then blanks and the `}%%` if it is there; `%%{` with no word after it is no match.
 */
function v12StripDirectives(text: string): string {
  const run = (from: number, set: RegExp): number => {
    let i = from;
    while (i < text.length && set.test(text[i]!)) i++;
    return i;
  };
  const blanks = (from: number): number => run(from, /\s/);
  const word = (from: number): number => run(from, /\w/);
  const close = (at: number): number => (text.startsWith('}%%', at) ? at + 3 : at);
  let out = '';
  let kept = 0;
  let from = 0;
  for (let p = text.indexOf('%%{', from); p !== -1; p = text.indexOf('%%{', from)) {
    const name = blanks(p + 3);
    let at = word(name);
    if (at === name) {
      from = p + 1;
      continue;
    }
    const colon = blanks(at);
    if (text[colon] === ':') at = colon + 1;
    at = blanks(at);
    const value = word(at);
    if (value > at) at = close(blanks(value));
    else {
      while (at < text.length && !text.startsWith('}%%', at)) {
        const c = text[at];
        if (c === '\r' && text[at + 1] === '\n') at += 2;
        else if (c === '\r' || c === '\u2028' || c === '\u2029') break;
        else at++;
      }
      at = close(blanks(at));
    }
    out += text.slice(kept, p);
    kept = at;
    from = at;
  }
  return out + text.slice(kept);
}

/** Whether v12's directive regex removed another span of `text` than core's preprocess. */
function directiveCutDiffers(text: string): boolean {
  let core = '';
  let at = 0;
  for (const { range } of preprocess(text).directives) {
    core += text.slice(at, Math.max(at, range.start));
    at = Math.max(at, range.end);
  }
  return core + text.slice(at) !== v12StripDirectives(text);
}

const outcome = (detect: (t: string) => string, text: string): string => {
  try {
    return detect(text);
  } catch (e) {
    const codes = (e as { diagnostics?: { code: string }[] }).diagnostics?.map((d) => d.code);
    return codes?.includes('UNCLOSED_DIRECTIVE') ? 'unclosed directive' : 'rejected';
  }
};

describe('first-party detection against v12 detectType (#469)', () => {
  it('covers every row of the detector table, each header detected alone by v12', () => {
    expect(ROWS.length).toBeGreaterThan(30);
    expect(Object.keys(HEADERS)).toEqual(ROWS);
    for (const [type, h] of Object.entries(HEADERS)) {
      if (NO_V12_ORACLE.has(type)) {
        expect(
          outcome((t) => v12.detectType(t), h + BODY),
          h
        ).toBe('rejected');
        expect(v13.detectType(h + BODY), h).toBe(type);
      } else expect(v12.detectType(h + BODY), h).toBe(type);
    }
  });

  it('gives v12’s type, or rejects where v12 rejects, except the listed divergences', () => {
    const all = [
      ...ROWS.filter((type) => !NO_V12_ORACLE.has(type)).flatMap((type) =>
        cases(HEADERS[type]!).map(([n, t]) => [`${type}: ${n}`, t] as const)
      ),
      ...ORDER.map(([n, t]) => [`order: ${n}`, t] as const),
      ...DIRECTIVE_SPLITS.map(([n, t]) => [`directive: ${n}`, t] as const),
    ];
    const found: Record<string, string> = {};
    for (const [name, text] of all) {
      const old = outcome((t) => v12.detectType(t), text);
      const now = outcome((t) => v13.detectType(t), text);
      if (old !== now) found[name] = `v12 ${old}, v13 ${now}`;
    }
    expect(Object.keys(found).sort()).toEqual(Object.keys(DIVERGENCES).sort());
    for (const [n] of DIRECTIVE_SPLITS)
      expect(found[`directive: ${n}`], n).toMatch(/^v12 rejected, v13 /);
  });

  it('agrees over seeded mixes of headers, comments and directives', () => {
    let seed = 469;
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const headers = Object.entries(HEADERS)
      .filter(([type]) => !NO_V12_ORACLE.has(type))
      .map(([, h]) => h);
    const found: string[] = [];
    let rejected = 0;
    let unclosed = 0;
    let raw = 0;
    let cutOtherwise = 0;
    for (let i = 0; i < 3000; i++) {
      const h = headers[next(headers.length)]!;
      const cut = next(h.length + 1);
      const pieces = Array.from({ length: 1 + next(2) }, () => FRAGMENTS[next(FRAGMENTS.length)]);
      const text = h.slice(0, cut) + pieces.join('') + h.slice(cut) + TAILS[next(TAILS.length)]!;
      const old = outcome((t) => v12.detectType(t), text);
      const now = outcome((t) => v13.detectType(t), text);
      if (old === 'rejected') rejected++;
      // Core's directive reading, every type (as the parity gates exclude it): an unclosed
      // `%%{` is an UNCLOSED_DIRECTIVE error, where v12's regex took the rest of the line.
      if (now === 'unclosed directive') unclosed++;
      else if (old !== now && fromRawBody(now, text)) raw++;
      else if (old !== now && directiveCutDiffers(text)) cutOtherwise++;
      else if (old !== now) found.push(`${JSON.stringify(text)}: v12 ${old}, v13 ${now}`);
    }
    expect(rejected).toBeGreaterThan(100);
    expect(unclosed).toBeLessThan(300);
    expect(raw).toBeLessThan(300);
    expect(cutOtherwise).toBeLessThan(400);
    expect(found).toEqual([]);
  });

  it('gives the language service mermaid’s type for every case (one detection rule)', () => {
    const all = [
      ...ROWS.flatMap((type) => cases(HEADERS[type]!)),
      ...ORDER,
      ...DIRECTIVE_SPLITS,
    ].map(([, t]) => t);
    let seed = 470;
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const headers = Object.values(HEADERS);
    for (let i = 0; i < 1000; i++) {
      const h = headers[next(headers.length)]!;
      const cut = next(h.length + 1);
      const piece = FRAGMENTS[next(FRAGMENTS.length)]!;
      all.push(h.slice(0, cut) + piece + h.slice(cut) + TAILS[next(TAILS.length)]!);
    }
    const found: string[] = [];
    for (const text of all) {
      const now = outcome((t) => v13.detectType(t), text);
      // The service reads an unclosed `%%{` as core's preprocess does and reports it as a
      // diagnostic; mermaid refuses the text.
      if (now === 'unclosed directive') continue;
      const lsp = serviceType(text);
      if (lsp !== now) found.push(`${JSON.stringify(text)}: mermaid ${now}, service ${lsp}`);
    }
    expect(found).toEqual([]);
  });

  it('detects each type without a v12 oracle through the same comment and directive cases', () => {
    for (const type of NO_V12_ORACLE)
      for (const [name, text] of cases(HEADERS[type]!))
        expect(
          outcome((t) => v13.detectType(t), text),
          `${type}: ${name}`
        ).toBe(type);
  });

  it('never takes plain C4 for c4-beta, or c4-beta for C4 (spec #730)', () => {
    const probes: [text: string, type: string][] = [
      ['c4-beta', 'c4beta'],
      ['c4-beta context\n  person a "A"', 'c4beta'],
      ['  c4-beta container', 'c4beta'],
      ['%% note\nc4-beta dynamic', 'c4beta'],
      ['C4Context\n  Person(a, "A")', 'c4'],
      ['C4Container', 'c4'],
      ['C4Dynamic\n  title c4-beta', 'c4'],
      ['C4Context\n  Person(a, "c4-beta")', 'c4'],
      ['c4-beta\n  person a "C4Context"', 'c4beta'],
      ['c4-betas', 'rejected'],
      ['c4-beta-x', 'rejected'],
      ['c4beta', 'rejected'],
      ['c4context', 'rejected'],
    ];
    for (const [text, type] of probes)
      expect(
        outcome((t) => v13.detectType(t), text),
        JSON.stringify(text)
      ).toBe(type);
  });

  it('agrees on the order cases v12’s text decides', () => {
    expect(outcome((t) => v13.detectType(t), ORDER[0]![1])).toBe('flowchart-elk');
    expect(outcome((t) => v12.detectType(t), ORDER[0]![1])).toBe('flowchart-elk');
  });
});
