/**
 * The timeline corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's
 * set, which adds line-separator and edge cases and a commented copy of every source.
 */
// cspell:words TIMELINE ACCTITLE ACCDESCR titlex
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

const TL = 'timeline\n';

// U+2028 and U+2029: `\s` and a regex `.` treat them as line terminators, `[^\n]` does not;
// v12's comment removal (`^`, multiline) starts a line after them.
export const LINE_SEPARATORS: CorpusItem[] = [
  TL + '2002 x : a b\n2003 : c',
  TL + 'title a b\n2002 : x',
  TL + 'title b\n2002 : x',
  TL + 'section s\n2002 : x',
  TL + '2002 : x\n2003 : y',
  TL + 'accTitle: hi there\n2002 : x',
  TL + 'accDescr: hi there\n2002 : x',
  TL + '2002 : x\n%% c y\n2003 : z',
  TL + '2002 : x\n %% c\n2003 : z',
  TL + '2002 : x %% c\n2003 : z',
  TL + '   2002 : x',
  'timeline LR\n2002 : x',
].map((source, k) => ({ id: `line separators ${k}`, source }));

// Cases the corpus misses: the quirks spec #291 lists, CRs, entities, the comments jison's
// rules skip, case-insensitive keywords and the accessibility states.
export const EDGE_CASES: CorpusItem[] = [
  // `\s` takes a line break: a bare `title`/`section` takes the next line.
  TL + 'title\nfoo\n2002 : x',
  TL + 'section\n2002 : x',
  TL + 'title \n2002 : x\ntitle',
  TL + 'section \n2002 : x\nsection',
  TL + 'titlex : y\nsections : z\ntitle:x\nsection: y',
  TL + 'title  two  blanks  \nsection  s  : 1\n  section a b : c',
  // Keywords, case-insensitive and word-bounded.
  'timeline RL\n x',
  'timeline LRx\n2002 : x',
  'timeline\tTD\n2002 : x',
  'timeline  lr  \n2002 : x',
  'timeline td\nTITLE T\nSection S\nTIMELINE\nTimeline LR\ntimelines : x',
  TL + 'timeline : x\ntimeline TD : y',
  // `#` ends a period (a comment to the line end) and is text elsewhere.
  TL + '2002 #c : x\n# whole line\n  #x\n2003 : y',
  TL + 'title a #b # c\nsection #s# : 1\n2002 : #e# : f#',
  // The first rule compiles to a single `%`; `x%%` is a comment at any token start.
  TL + '%abc : x\n%{abc : x\n50% done : x\na%%b : x\nab%%c : x\n}%%x : y\n2002 : x %% y',
  TL + '2002 : x\n%%\n2003 : y\n %%\n2004 : z %%',
  // Events: a `:` with a blank after it ends one; otherwise `:` is INVALID.
  TL + 'a :b : c\n : d:e\n: : x\n::y\n2002 : x::y : z: w',
  TL + '2002 :\nfoo\n2003 :\n\n2004 : x :',
  TL + '2002 : x\n2003:x\n2004 :x\n: x\n  : y',
  // Whitespace is kept in periods and events.
  TL + '  2002   :   x   :  y  \n\n   \n  2003\t: \tz\t\n',
  // Accessibility states.
  TL + 'accTitle: a;b#c\naccDescr: d;e#f\n2002 : x',
  TL + 'accTitle:\n\nT\naccDescr :  D\n2002 : x',
  TL + 'accDescr{x}\naccDescr\n{\n y \n}\naccDescr {\n}\n2002 : x',
  TL + 'ACCTITLE: x\nACCDESCR: y\nAccDescr { z }',
  TL + 'accTitle x\naccDescr x\naccDescr : \naccTitle :',
  TL + 'accDescr {\nnever closed',
  TL + 'accTitle: ',
  TL + 'accTitle:',
  TL + 'accDescr: ',
  // Entities and `style…:#…;` lines, as `encodeEntities` rewrote them.
  TL + '2002 : #quot;hi#59; #9829; #x;\n#amp; : x\ntitle #lt;t\nsection #a;b : c',
  TL + 'style x:#f00; : y\n2002 : style x:#f00;\nclassDef a:#b; c',
  // CRs: v12 turned CRLF and CR into LF.
  'timeline\r\n2002 : x\r\n\r\n2003 : y\r\n',
  'timeline\r2002 : x\r\r2003 : y',
  'timeline\r\ntitle\r\nfoo\r\nsection\r\nbar : x\r\n2002 :\r\nz',
  'timeline\r\naccDescr {\r\na\r\nb\r\n}\r\naccTitle:\r\nT\r\n2002 : x',
  'timeline TD\r\n2002 : x',
  // A CR and an LF that a removed comment or directive left side by side: two line ends to v12.
  TL + 'title\r%%{init:{}}%%\nfoo',
  TL + 'title\r%% c\n\nfoo',
  TL + 'section\r%% c\n\nfoo : x',
  TL + '2002 :\r%% c\n\nx',
  TL + 'accTitle:\r%% c\n\nx',
  TL + '2002 : x\r%% c\n\n2003 : y',
  TL + 'a\r%% c\n%%\nb',
  'timeline\r\n2002 : x\r\n%%\r\n2003 : y\r\n}%%\r\n2004 : z\r\n%%',
  'timeline\r\naccDescr\r\n{\r\nx\r\n}\r\nsection\r\n:\r\n2002 :\r\n:\r\nx',
  // An empty body, and blanks only.
  'timeline',
  'timeline\n',
  'timeline\n   \n\n  ',
  'timeline LR',
].map((source, k) => ({ id: `edge case ${k}`, source }));

// Directives that start partway through a line (#185).
export const MID_LINE_DIRECTIVES: CorpusItem[] = [
  TL + '2002 : x %%{init: {\n  %%x "a": 1}}%%\n2003 : y',
  TL + '2002 %%{init: {}}%% : x\n2003 : y',
  TL + 'title a %%{init: {}}%% b\nsection s %%{init: {}}%% t : x',
  TL + '2002 : x\n%% c %%{init:\n{}}%% d\n2003 : y',
].map((source, k) => ({ id: `mid-line directive ${k}`, source }));

/** The parser cases (`corpus/timeline-cases.json`): each corpus gap, and the rejections. */
export function timelineCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/timeline-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/**
 * The e2e fixtures, the v12 spec strings, the parser cases, the cases above, and each of them
 * commented and CR-cut.
 */
export async function timelineGateCorpus(): Promise<CorpusItem[]> {
  const all = [
    ...(await timelineCorpus()),
    ...timelineCases(),
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

/**
 * `src` with every line break of the body written as a CR, then `removed` (a comment or a
 * directive) and an LF on its own line. v12 turned the CR into an LF before removing it, so it
 * saw two line ends where v13's cut text has a CR and an LF side by side.
 */
export function crCut(src: string, removed: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  return head + src.slice(head.length).replace(/\r?\n/g, `\r${removed}\n\n`);
}

/** The timeline corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function timelineCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/timeline'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/timeline-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}
