/**
 * The mindmap corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, and the
 * lexer gate's set, which adds line-separator, edge and mid-line-directive cases and a
 * commented and two CR-cut copies of every source.
 */
// cspell:words mindmapx MINDMAP NSTR
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

const MM = 'mindmap\n';

// U+2028 and U+2029: `\s` and a regex `.` treat them as line terminators, `[^\n]` does not;
// v12's comment removal (`^`, multiline) starts a line after them.
export const LINE_SEPARATORS: CorpusItem[] = [
  MM + 'root\n  a\u2028b\n  c',
  MM + 'root\n  a(b\u2028c)\n  d',
  MM + 'root\n  a(b}c\u2029d)\n  e',
  MM + 'root\n  :::x\u2028y\n  b',
  MM + 'root\n  :::\u2028y\n  b',
  MM + 'root\n  ::icon(a\u2029b)\n  c',
  MM + 'root\n  a(b) %% c\u2028d\n  e',
  MM + 'root\n%% c\u2028d\n  e',
  MM + 'root\n  a\u2028%% c\n  e',
  MM + 'root\n  a["b\u2028c"]\n  d["`e\u2029f`"]',
  MM + '\u2028  root\n \u2029 a\u2028\n  b',
  'mindmap\u2028root',
].map((source, k) => ({ id: `line separators ${k}`, source }));

// Cases the corpus misses: the quirks spec #294 lists, every opener and closer, strings, icons
// and classes, the comments v12's removal left, CRs, entities and the lexical errors.
export const EDGE_CASES: CorpusItem[] = [
  // A shape's text spans line breaks; ids hold blanks, `:`, `%`, `]` and quotes.
  MM + 'root(\n  The root\n)\n  child',
  MM + 'root\n  a b c\n  d: e%f]g"h\n  i:::j\n  k %% l',
  MM + 'root\n  a(\n\n  b\n  c)\n  [\n]',
  // Every opener and closer, mismatched ones too, and ids ending in `-`.
  MM + 'root\n  a((b))\n  c))d((\n  e{{f}}\n  g)h(\n  i(-j-)\n  k-)l(-\n  m[n]\n  o(p)',
  MM + 'root\n  b(x]\n  a[b)\n  a)b)\n  c((d)\n  e(f((\n  g[h}}\n  i-x)\n  -)y(-\n  (-z-)',
  MM + '((root))\n  [a]\n  (b)\n  ))c((\n  {{d}}',
  MM + 'root\n  a(b(c)\n  d[e[f]]\n  g(h)i\n  j(k))l\n  m[n]o p(q)',
  // A `}` in a shape takes the rest of its line; `{` and `}` outside one are errors.
  MM + 'root\n  a(b}c)\n  d[e}}f]\n  g{{h}i}}\n  j(}\n  k)',
  MM + 'root\n  a{b}',
  MM + 'root\n  a}b',
  MM + 'root\n  {x\n  y',
  // Strings and markdown strings.
  MM + 'root\n  a["b `c` d"]\n  e["`md **x**`"]\n  f("g")\n  h(("i"))\n  j["k" l]',
  MM + 'root\n  a["b\n c"]\n  d["`e\n f`"]\n  g[x "y" z]',
  MM + 'root\n  a["b]\n  c',
  MM + 'root\n  a["`b"]',
  MM + 'root\n  a["`b`c`"]',
  MM + 'root\n  a["`b`\n  c',
  MM + 'root\n  a[""]\n  b["``"]\n  c["`"]',
  // Icons and classes, on their own lines and after a node.
  MM + 'root\n  a\n  ::icon(fa fa-book)\n  :::urgent large\n  b\n::icon(x)\n:::y',
  MM + 'root\n  a ::icon(x)\n  b:::c\n  d::icon(e)\n  :::\n  f',
  MM + 'root\n  a\n  ::ICON(x\n y)\n  ::icon()\n  :::  \n  b',
  MM + 'root\n  a\n  ::icon(never closed',
  MM + 'root\n  a\n  :::',
  MM + 'root\n  a\n  ::: x ::icon(y)\n  ::::z',
  // The `%%` v12's comment removal left: mid-line, after a closer, bare `%%` lines.
  MM + 'root\n  a(a) %% x\n  b %% c\n  %%\n  d\n%%\n\n  %%\ne',
  MM + 'root\n  a[b] %%\n  c(d)%%e\n  f\n  %% g',
  MM + 'root\n  a\n\n  %%\n   \n  b',
  // Blank lines, trailing blanks, tabs and other `\s`.
  MM + 'root\n  a\n   \n\n  b\n  \n  c  \n\td\n\t\te',
  MM + 'root\n a\n　b\n ﻿c',
  MM + 'root  \n  a  \n\n\n  b\n\n',
  // The keyword: case-insensitive, word-bounded, and a token anywhere one starts.
  'mindmap root\n  a',
  'mindmapx\n  a',
  MM + '  mindmap\n  Mindmap\n  MINDMAP x\n  mindmap-x\n  a mindmap\n  mindmap_b',
  '  mindmap\n  root',
  // Entities and `style…:#…;` lines, as `encodeEntities` rewrote them.
  MM + 'root\n  a[#quot;hi#59; #9829;]\n  #amp; b\n  c["#lt;d"]',
  MM + 'root\n  style a:#f00;\n  b(style c:#f00;)\n  classDef d:#e;',
  // CRs: v12 turned CRLF and CR into LF.
  'mindmap\r\n  root\r\n\r\n  a\r\n',
  'mindmap\r  root\r\r  a(b\rc)',
  'mindmap\r\n  root(\r\n  x\r\n  )\r\n  ::icon(a\r\nb)\r\n  :::\r\n  c\r\n  \r\n',
  'mindmap\r\n  root\r\n  :::\r\n',
  // A CR and an LF that a removed comment or directive left side by side: two line ends to v12.
  MM + 'root\r%% c\n  a',
  MM + 'root\r%%{init:{}}%%\n  a',
  MM + 'root\n  a(b\r%% c\nd)',
  MM + 'root\n  :::\r%% c\n  a',
  // Front matter and directives.
  '---\ntitle: t\n---\nmindmap\n  root\n    a',
  '%%{init: {"theme": "forest"}}%%\nmindmap\n  root',
  // An empty body, blanks only.
  'mindmap',
  'mindmap\n',
  'mindmap\n   \n\n  ',
].map((source, k) => ({ id: `edge case ${k}`, source }));

// Directives that start partway through a line (#185).
export const MID_LINE_DIRECTIVES: CorpusItem[] = [
  MM + 'root\n  a %%{init: {\n  %%x "a": 1}}%%\n  b',
  MM + 'root\n  a %%{init: {}}%% b\n  c(d %%{init: {}}%% e)',
  MM + 'root\n  a(b\n%% c %%{init:\n{}}%% d\ne)',
  MM + 'root\n  ::icon(a %%{init: {}}%% b)\n  :::c %%{init: {}}%% d',
].map((source, k) => ({ id: `mid-line directive ${k}`, source }));

/** The mindmap corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function mindmapCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/mindmap'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/mindmap-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/**
 * The e2e fixtures, the v12 spec strings, the cases above, and each of them commented and
 * CR-cut (by a comment line and by a directive).
 */
export async function mindmapGateCorpus(): Promise<CorpusItem[]> {
  const all = [
    ...(await mindmapCorpus()),
    ...LINE_SEPARATORS,
    ...EDGE_CASES,
    ...MID_LINE_DIRECTIVES,
  ];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
    ...all.map((item) => ({ id: `${item.id} (CR cut)`, source: crCut(item.source, '%% c') })),
    ...all.map((item) => ({
      id: `${item.id} (CR cut by a directive)`,
      source: crCut(item.source, '%%{init: {}}%%'),
    })),
  ];
}
