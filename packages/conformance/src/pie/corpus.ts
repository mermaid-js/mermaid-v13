/**
 * The pie corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's set,
 * which adds the quirks the spec lists (#288), line-separator cases, and a CRLF and a commented
 * copy of every source.
 */
// cspell:words accdescr ntitlex nshowdata
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

// U+2028 and U+2029: `\s` and v12's comment removal (`^`, multiline) treat them as line
// terminators; NEWLINE and `[^\n\r]` do not.
export const LINE_SEPARATORS: CorpusItem[] = [
  'pie "a": 1',
  'pie\n"a": 1 "b": 2',
  'pie\ntitle a b\n"a": 1',
  'pie\naccTitle: a b\naccDescr: c d\n"a": 1',
  'pie\naccDescr { a }\n"a": 1',
  'pie\n"a b": 1',
  'pie\n"a": 1\n %% c\n"b": 2',
  'pie\n"a": 1 %% c "b": 2',
  'pie showData title t',
  ' pie\n"a": 1',
].map((source, k) => ({ id: `line separators ${k}`, source }));

/** The quirks the spec probed against 2.0.1 (#288 "Parser"), and the rules' other corners. */
export const QUIRKS: CorpusItem[] = [
  // Strings: either quote, escapes, line breaks inside, not trimmed; tag quotes; unterminated.
  "pie\n'a': 1\n\"b\": 2\n' c ': 3",
  'pie\n"a\\"b": 1\n\'c\\\'d\': 2\n"e\\\\": 3\n"f\\x": 4',
  'pie\n"a\nb": 1\n\'c\n\nd\': 2',
  'pie\n"<b class="x">bold</b>": 1\n"<i a="1" b="2">": 2',
  'pie\n"a\\\nb": 1',
  'pie\n"never closed: 1\n"b": 2',
  "pie\n'never closed: 1",
  'pie\n"a" : 1 "b": 2',
  // Accessibility: `{}` bodies, colons, `%%` ends, blanks before.
  'pie\naccDescr {\n  line one\n\n  line two\n}\n"a": 1',
  'pie accDescr{x}\n"a": 1',
  'pie\naccDescr\n\n{\nx\n}\n"a": 1',
  'pie\naccDescr: a %% b\naccTitle : c %% d\n"a": 1',
  'pie\n  accTitle:\n  accDescr:\n"a": 1',
  'pie\naccTitle x\n"a": 1',
  'pie\naccDescr { never closed\n"a": 1',
  'pie\naccDescription: x',
  // Titles: blanks, `%%`, empty, glued, repeated.
  'pie\ntitle   a   b   %% c\n"a": 1',
  'pie\ntitle\n"a": 1',
  'pie\ntitle%%x\n"a": 1',
  'pie\ntitle \n"a": 1',
  'pie\ntitlex\n"a": 1',
  'pie\ntitle one\ntitle two\n"a": 1',
  'pie title t\n"a": 1 title u',
  '---\ntitle: Front\n---\npie\n"a": 1',
  '---\ntitle: Front\n---\npie\ntitle\n"a": 1',
  '---\ntitle: Front\n---\npie title In text\n"a": 1',
  // Duplicates and zero sums.
  'pie\n"a": 1\n"a": 2\n"b": 3',
  'pie\n"a": 0\n"b": 0',
  'pie showData\n"a": 0',
  // Numbers.
  'pie\n"a": 12.',
  'pie\n"a": 01',
  'pie\n"a": 1e3',
  'pie\n"a": -0',
  'pie\n"a": 1;',
  'pie\n"a": 1;\n"b": 2',
  'pie\n"a": 1.23.',
  'pie\n"a": 1.2.3',
  'pie\n"a": 0.5\n"b": 00.5\n"c": 000\n"d": -12.50',
  'pie\n"a": .5',
  'pie\n"a": 1.\n"b": 2',
  'pie\n"a": --1',
  'pie\n"a": 0.',
  'pie\n"a": 10.5',
  'pie\n"a": 100',
  'pie\n"a": -60.67',
  // Keywords: boundaries, case, places.
  'pie showData\n"a": 1',
  'pie  showData  %% c\n"a": 1',
  'pie%%c\n"a": 1',
  'pie%c\n"a": 1',
  'pieChart\n"a": 1',
  'pie\nshowData\n"a": 1',
  'pie "a": 1',
  'pie\n"a": 1 showData',
  'PIE\n"a": 1',
  'pie\nshowdata',
  'pie "a": 1',
  // Hidden tokens left in the text v12 lexed.
  'pie\n"a": 1 %% trailing\n"b": 2 %%',
  'pie\n"a": 1 %%{init: {}}%%\n"b": 2',
  'pie\n"a": 1 %%{ x }%%y\n"b": 2',
  'pie\n---\nbody: yaml\n---\n"a": 1',
  'pie\n---\n---\n"a": 1',
  'pie\n---  \nx\n---x\n---\n"a": 1',
  'pie\n---\nnever closed\n"a": 1',
  'pie\n"a": 1 ---\n---',
  // Entities and dropped semicolons.
  'pie\ntitle a #quot;b#quot; #9829;\n"#amp;x": 1',
  'pie\n"a": 1#x;',
  'pie\ntitle style a:#f00;\n"a": 1',
  'pie\naccTitle: classDef x:#f00; y;\n"a": 1',
  // Blank-only bodies, stray characters.
  'pie',
  'pie\n\n\n',
  '   pie   \n\t\n  "a"  :  1  \n',
  'pie\n"a": 1\n@\n"b": 2',
  'pie\n"a": 1\n\t\n  \n"b": 2',
  'pie\n"a": 1\n"b": 😀',
  'pie\n"a😀": 1',
  'pie\r"a": 1\r"b": 2',
  'pie\r\n"a": 1\r\n\r\n"b": 2\r\n',
].map((source, k) => ({ id: `quirk ${k}`, source }));

/**
 * Unclosed `%%{` directives. Core's preprocess ends one at its line end and reports
 * `UNCLOSED_DIRECTIVE` (an error, so v13 rejects the source); v12's directive regex removed
 * the line break after it too, or every line after it. That is core's reading of directives
 * for every type, not a pie lexer rule, so the gate leaves these out (see the spec).
 */
export const UNCLOSED_DIRECTIVES: CorpusItem[] = [
  'pie\n%%{ never closed\n"a": 1',
  'pie\n%%{init: {\n"a": 1',
].map((source, k) => ({ id: `unclosed directive ${k}`, source }));

/** The pie corpus: the e2e fixtures and the harvested v12 spec strings. */
export async function pieCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/pie'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/pie-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/** The corpus, the cases above, and a CRLF and a commented copy of each. */
export async function pieGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await pieCorpus()), ...LINE_SEPARATORS, ...QUIRKS, ...UNCLOSED_DIRECTIVES];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
