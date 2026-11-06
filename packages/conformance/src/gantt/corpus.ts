/**
 * The gantt corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's set,
 * which adds the `ganttDb.spec.ts` cases, `click` fixtures, line-separator and edge cases, and
 * a commented and CR-cut copy of every source.
 */
// cspell:words GANTT ACCTITLE ACCDESCR TOPAXIS TICKINTERVAL ganttx titlex sectionx topaxisx
// cspell:words callme hrefs hreff nhrefs nganttä Datesx Formatx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

const G = 'gantt\n';
const ISO = G + 'dateFormat YYYY-MM-DD\n';

const items = (prefix: string, sources: string[]): CorpusItem[] =>
  sources.map((source, k) => ({ id: `${prefix} ${k}`, source }));

/**
 * v12's `ganttDb.spec.ts` calls the DB directly (`addTask(text, data)`, `setExcludes`, …) and
 * never parses, so the harvest finds no source in it. These are its calls written as gantt
 * text, one source per spec block, with the strings as the spec wrote them.
 */
export const DB_SPEC_CASES: CorpusItem[] = items('ganttDb.spec', [
  ISO +
    'todayMarker off\nexcludes weekends 2019-02-06,friday\nsection weekends skip test\n' +
    'test1 :id1,2019-02-01,1d\ntest2 :id2,after id1,2d',
  ISO + 'section testa1\ntest1 :id1,2013-01-01,2d',
  ISO + 'section testa1\ntest1 :2013-01-01,2d\ntest2 :after id1,2d',
  ISO + 'section testa1\ntest1 :id1,2013-01-01,2w\ntest2 :id2,after id1,2d',
  G +
    'dateFormat x\nsection testa1\ntest1 :id1,0,20ms\ntest2 :id2,after id1,5ms\n' +
    'section testa2\ntest3 :id3,20,10ms\ntest4 :id4,after id3,0.005s',
  ISO +
    'section sec1\ntest1 :id1,2013-01-01,2w\ntest2 :id2,after id3,1d\nsection sec2\n' +
    'test3 :id3,after id1,2d',
  ISO +
    'section sec1\ntask1 :id1,2013-01-01,until id3\nsection sec2\n' +
    'task2 :id2,2013-01-10,until id3\ntask3 :id3,2013-02-01,2d',
  ISO +
    'section sec1\ntask1 :id1,after id2 id3 id4,1d\ntask2 :id2,2013-01-01,1d\n' +
    'task3 :id3,2013-02-01,3d\ntask4 :id4,2013-02-01,2d',
  ISO +
    'section sec1\ntask1 :id1,2013-01-01,until id2 id3 id4\ntask2 :id2,2013-01-11,1d\n' +
    'task3 :id3,2013-02-10,1d\ntask4 :id4,2013-02-12,1d',
  ISO +
    'excludes weekends 2019-02-06,friday\nsection weekends skip test\n' +
    'test1 :id1,2019-02-01,1d\ntest2 :id2,after id1,2d\ntest3 :id3,after id2,7d\n' +
    'test4 :id4,2019-02-01,2019-02-20\ntest5 :id5,after id4,1d\n' +
    'section full ending task on last day\ntest6 :id6,2019-02-13,2d\ntest7 :id7,after id6,1d',
  ISO +
    'excludes weekends\nweekend friday\nsection friday-saturday weekends skip test\n' +
    'test1 :id1,2024-02-28, 3d',
  ISO +
    'excludes weekends,monday,tuesday,wednesday,thursday,friday\nweekend saturday\n' +
    'section weekends skip test\ntest1 :id1,2019-02-01,7d',
  ISO +
    'excludes weekends,monday,tuesday,wednesday,thursday\nweekend saturday\n' +
    'section weekends skip test\ntest1 :id1,2019-02-01,7d',
  G + 'excludes weekends\nexcludes 2019-02-06\nexcludes friday, monday',
  G + 'excludes weekends,2019-02-06\nexcludes weekends 2019-02-07',
  G + 'includes 2019-02-06\nincludes 2019-02-07,2019-02-08',
  ISO +
    'section section A section\nCompleted task :done,    des1, 2014-01-06,2014-01-08\n' +
    'Active task :active,  des2, 2014-01-09, 3d\nFuture task :des3, after des2, 5d\n' +
    'Future task2 :des4, after des3, 5d\nsection section Critical tasks\n' +
    'Completed task in the critical line :crit, done, 2014-01-06,24h\n' +
    'Implement parser and jison :crit, done, after des1, 2d\n' +
    'Create tests for parser :crit, active, 3d\nFuture task in critical line :crit, 5d\n' +
    'Create tests for renderer :2d\nAdd to mermaid :1d\nsection section Documentation\n' +
    'Describe gantt syntax :active, a1, after des1, 3d\n' +
    'Add gantt diagram to demo page :after a1  , 20h\n' +
    'Add another diagram to demo page :doc1, after a1  , 48h\nsection section Last section\n' +
    'Describe gantt syntax :after doc1, 3d\nAdd gantt diagram to demo page :20h\n' +
    'Add another diagram to demo page :48h',
  ISO +
    'section Task endTime is on the 31st day of the month\ntest1 :id1,2019-09-30,11d\n' +
    'test2 :id2,after id1,20d',
  ISO + 'section Task handles 25 hour day\ndaylight savings day :id1,2020-11-01,1d',
  ISO + 'test1 :id1,2019-02-01,1d\ntest2 :id2,2019-02-01,2019-02-03',
  G + 'todayMarker stroke-width:5px,stroke:#00f,opacity:0.5',
  G + 'todayMarker off',
  G + 'dateFormat YYYYMMDD\ntest1 :id1,202304,1d',
  G + 'dateFormat ss\nsection Network Request\nRTT :rtt, 0, 20',
  ISO + 'section Vacation\nLondon Trip 1 :2024-12-01, 7d\nLondon Trip 2 :202-12-01, 7d',
  ISO + 'task1 :id1,2013-01-01,2d\ntask2 :id2,after m1,1d',
  ISO + 'task1 :id1,2013-01-01,until m1',
  ISO + 'task1 :id1,2013-01-01,2d\ntask2 :id2,after id1,1d',
  ISO + 'M1 :milestone, 2023-01-01, m1',
]);

/** `click` statements: the e2e corpus has none. Every `clickStatement` form, and the traps. */
export const CLICK_CASES: CorpusItem[] = items('click', [
  ISO + 'a :a1, 2014-01-01, 1d\nclick a1 href "https://example.com/x?y=1&z=2"',
  ISO + 'a :a1, 2014-01-01, 1d\nclick a1 call ganttTestClick("test0", test1, test2)',
  ISO + 'a :a1, 2014-01-01, 1d\nclick a1 call ganttTestClick()',
  ISO + 'a :a1, 2014-01-01, 1d\nclick a1 call ganttTestClick(  )',
  ISO + 'a :a1, 2014-01-01, 1d\nclick a1 call ganttTestClick',
  ISO + 'a :a1, 2014-01-01, 1d\nclick a1 call cb("x") href "https://example.com"',
  ISO + 'a :a1, 2014-01-01, 1d\nclick a1 call cb() href "https://example.com"',
  ISO + 'a :a1, 2014-01-01, 1d\nclick a1 href "https://example.com" call cb(1, "two, three")',
  ISO + 'a :a1, 2014-01-01, 1d\nclick a1 href "https://example.com" call cb',
  ISO + 'a :a1, 1d\nb :b1, 1d\nclick a1,b1 href "#x"',
  ISO + 'a :a1, 1d\nCLICK a1 HREF "u"\nClick a1 Call f()',
  // Blanks: `click[\s]+` takes every blank and line break after `click`; one blank or line
  // break ends the ids; `href[\s]+"` and `call[\s]+` take blank runs.
  ISO + 'a :a1, 1d\nclick   a1   href   "u"\nclick a1\thref\t"u"',
  ISO + 'a :a1, 1d\nclick\na1 href "u"\nclick a1\nb :1d',
  ISO + 'a :a1, 1d\nclick a1 call  f(x)\nclick a1 call\nf(x)',
  ISO + 'a :a1, 1d\nclick a1 call f(\nx\n) href "a\nb"',
  // Unclosed states run to the end of the text.
  ISO + 'a :a1, 1d\nclick a1 href "never closed\nb :1d',
  ISO + 'a :a1, 1d\nclick a1 call f(never closed\nb :1d',
  ISO + 'a :a1, 1d\nclick a1 call f\nb :1d',
  ISO + 'a :a1, 1d\nclick a1',
  ISO + 'a :a1, 1d\nclick ',
  ISO + 'a :a1, 1d\nclick a1 href "',
  ISO + 'a :a1, 1d\nclick a1 call ',
  // `click `, `call ` and `href "` at a token start, in task text.
  ISO + 'click me :1d\ncall me :1d\nhref "me" :1d\ncallme :1d\nclicked :1d\nhrefs :1d',
  ISO + 'a :a1, 1d\nclick a1 href "u" more :1d\nclick a1 call f() x :1d',
  ISO + 'a :a1, 1d\nclick a1 href u\nclick a1 hreff "u"',
  // `#`, `;` and `%` inside the states.
  ISO + 'a :a1, 1d\nclick a1 href "u#x;y%z"\nclick a1 call f(#a; %b)',
  ISO + 'a :a1, 1d\nclick a1;b1 href "u"\nclick a1%b1 call f()',
  ISO + 'a :a1, 1d\nclick a1 href "#quot;u#59;"',
]);

// U+2028 and U+2029: `\s` takes them, `[^\n]` and `[^:\n]` do not; v12's comment removal
// (`^`, multiline) starts a line after them.
export const LINE_SEPARATORS: CorpusItem[] = items('line separators', [
  G + 'a\u2028b :1d\u2028c\nd :2d',
  G + 'title\u2028x\nsection\u2029y\na :1d',
  G + 'title a\u2028b\nsection s\u2028t\na :1d',
  G + 'dateFormat\u2028YYYY\naxisFormat %d\u2029%m\na :1d',
  G + 'accTitle:\u2028hi there\naccDescr:\u2029hi\na :1d',
  G + 'a :1d\n%% c\u2028b :1d\nc :1d',
  G + 'a :1d\n\u2028%% c\nb :1d',
  G + 'a :1d\u2028%% c\nb :1d',
  G + 'a :1d\u2028  %% c\u2028b\nc :1d',
  G + 'a :a1, 1d\nclick\u2028a1\u2028href "u"\nclick a1 call\u2029f()',
  G + 'weekday\u2028monday\nweekend\u2029friday\na :1d',
  G + 'gantt\u2028a :1d',
  'gantt\u2028\na :1d',
  G + '   a :1d',
]);

// Cases the corpus misses: the quirks spec #293 lists, keyword prefixes and `\b`, the comment
// rules, CRs, entities and the accessibility states.
export const EDGE_CASES: CorpusItem[] = items('edge case', [
  // `[^\}]\%\%*`: one character and a `%` at a token start take the line (`5% buffer` vanishes).
  ISO + 'a :1d\n5% buffer :3d\nab% c :1d\na%b :1d\n}% x :1d\n  b :1d',
  ISO + 'a :1d\n% single\n\n\nb :1d\n%\nc :1d',
  ISO + 'a :1d %% c\nb :1d%x\n%%\nc :1d\n %%\nd :1d %%',
  ISO + 'a :1d\n%x :1d\nb :1d\n%%x\nc :1d',
  // `accDescription` is lexed but no rule takes it.
  ISO + 'accDescription a long description\naccDescription x;y\naccDescription\nz',
  // A leading `;` or `#` is task text; `#` and `;` end task data.
  ISO + ';a :1d\n#b :1d\n#c\n;d',
  ISO + 'a :1d #x\nb :1d;c\nd :#e\nf :;g\nh :\ni ::j',
  // An ISO date at a token start is a `date` token.
  ISO + '2020-01-01 x :1d\n2020-01-011 :1d\n2020-01-01x :1d\n2020-1-01 :1d\n20200101 :1d',
  // Keyword prefixes beat task text; keywords are case-insensitive and word-bounded.
  ISO + 'gantt plan :1d\nganttx :1d\ngantt_x :1d\nganttä :1d\nGANTT\nGantt chart :1d',
  ISO + 'topAxis x :1d\ntopAxisx :1d\nTOPAXIS\ninclusiveEndDates\ninclusiveEndDatesx :1d',
  ISO + 'weekend friday party :1d\nweekday  Monday\nweekday\nsunday\nweekdays monday :1d',
  ISO + 'weekday mondays :1d\nweekend sunday :1d\nweekday monday_x :1d\nweekend saturday',
  ISO + 'weekday tuesday\nweekday wednesday\nweekday thursday\nweekday friday\nweekday saturday',
  ISO + 'title x\ntitlex :1d\ntitle\nfoo\ntitle\n\nbar :1d\ntitle',
  ISO + 'section x\nsectionx :1d\nsection\nfoo\nsection\n\nbar :1d\nsection',
  ISO + 'section a #b ;c: d\ntitle #t ;u: v\na :1d',
  // `\s[^#\n;]+` statements: `#` and `;` end them; `todayMarker` allows `#`.
  G + 'dateFormat YYYY-MM-DD #x\naxisFormat %d;x\ntickInterval 1day #y\nexcludes a;b',
  G + 'includes 2020-01-01 # c\ntodayMarker stroke:#f00;x\ntodayMarker\noff\ntodayMarker',
  G + 'dateFormat\nYYYY\naxisFormat\n\nx :1d\ndateFormat #x\ndateFormatx :1d',
  G + 'DATEFORMAT YYYY\nAxisFormat %d\nTICKINTERVAL 1week\nExcludes weekends\nINCLUDES x',
  G + 'dateFormat  YYYY-MM-DD  \naxisFormat\t%d\ntickInterval   2day',
  // Blanks: `\s+` takes line breaks after blanks; task text keeps trailing blanks.
  G + 'a   :1d   \n   b\t:\t2d\t\n  \n\t\nc :1d  ',
  G + 'Completed task            :done, des1, 2014-01-06,2014-01-08',
  // Accessibility states.
  G + 'accTitle: a;b#c\naccDescr: d;e#f\na :1d',
  G + 'accTitle:\n\nT\naccDescr :  D\na :1d',
  G + 'accDescr{x}\naccDescr\n{\n y \n}\naccDescr {\n}\na :1d',
  G + 'ACCTITLE: x\nACCDESCR: y\nAccDescr { z }',
  G + 'accTitle x :1d\naccDescr x :1d\naccDescr : \naccTitle :',
  G + 'accDescr {\nnever closed',
  G + 'accTitle: ',
  G + 'accTitle:',
  G + 'accDescr: ',
  // `%%{` where no directive starts (no word after it): jison's first rule begins an undeclared
  // state and throws. (`%%{word` unclosed is a directive to both; v12 removed more of the text
  // after it than v13 does, a decided preprocess divergence, so the gate has no such case.)
  G + 'a :a1, 1d\nclick a1 call f()%%{ :1d\nb :1d',
  G + 'a :a1, 1d\nclick a1 href "u"%%{ :1d',
  G + 'topAxis%%{ ;x',
  G + '2020-01-01%%{ ;x',
  G + 'accDescr{x}%%{ ;y',
  G + '%%{ :1d\nx %%{ :1d\n}%%{ :1d',
  // Entities and `style…:#…;` lines, as `encodeEntities` rewrote them.
  G + 'a #quot;b#59; :1d #amp;\nstyle a:#f00;\n#9829; :1d\ntitle #lt;t\nsection #a;b',
  G + 'style x:#f00; :1d\na :style x:#f00;\nclassDef a:#b; c',
  // A `"` v12 turned into `'` inside a tag (`cleanupText`).
  G + 'a :a1, 1d\nclick a1 href "<a b="c">"\n<b x="y"> :1d',
  // CRs: v12 turned CRLF and CR into LF.
  'gantt\r\na :1d\r\n\r\nb :1d\r\n',
  'gantt\ra :1d\r\rb :1d',
  'gantt\r\ntitle\r\nfoo\r\nsection\r\nbar\r\ndateFormat\r\nYYYY\r\na :\r\nz',
  'gantt\r\naccDescr {\r\na\r\nb\r\n}\r\naccTitle:\r\nT\r\na :1d',
  'gantt\r\na :a1, 1d\r\nclick\r\na1\r\nhref "u"\r\nclick a1\r\nb :1d',
  'gantt\r\na :1d\r\n5% x\r\nb :1d\r\n% y\r\nc :1d',
  // A CR and an LF that a removed comment or directive left side by side: two line ends to v12.
  G + 'title\r%%{init:{}}%%\nfoo',
  G + 'title\r%% c\n\nfoo',
  G + 'section\r%% c\n\nfoo',
  G + 'a :\r%% c\n\nx',
  G + 'accTitle:\r%% c\n\nx',
  G + 'a :1d\r%% c\n\nb :1d',
  G + 'a :a1, 1d\nclick a1\r%% c\n\nb :1d',
  G + 'x\r%% c\n%y\nb :1d',
  'gantt\r\na :1d\r\n%%\r\nb :1d\r\n}%%\r\nc :1d\r\n%%',
  // An empty body, and blanks only.
  'gantt',
  'gantt\n',
  'gantt\n   \n\n  ',
  'gantt a :1d',
]);

// Directives that start partway through a line (#185).
export const MID_LINE_DIRECTIVES: CorpusItem[] = items('mid-line directive', [
  G + 'a :1d %%{init: {\n  %%x "a": 1}}%%\nb :1d',
  G + 'a %%{init: {}}%% b :1d\nc :1d',
  G + 'title a %%{init: {}}%% b\nsection s %%{init: {}}%% t\na :1d',
  G + 'a :1d\n%% c %%{init:\n{}}%% d\nb :1d',
  G + 'a :a1, 1d\nclick a1 href "u%%{init: {}}%%v"',
]);

/** The e2e fixtures, the v12 spec strings, the cases above, and each of them commented and CR-cut. */
export async function ganttGateCorpus(): Promise<CorpusItem[]> {
  const all = [
    ...(await ganttCorpus()),
    ...DB_SPEC_CASES,
    ...CLICK_CASES,
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

/** The gantt corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function ganttCorpus(): Promise<CorpusItem[]> {
  const out: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/gantt'), 'e2e')) {
    out.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/gantt-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...out, ...specs];
}
