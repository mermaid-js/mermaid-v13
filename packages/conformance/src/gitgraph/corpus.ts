/**
 * The gitGraph corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's
 * set, which adds the lexer facts the spec lists (#292 "Parser"), line-separator cases, and a
 * CRLF and a commented copy of every source.
 */
// cspell:words ntitle ntitlex ncommit nbranch nmerge ncheckout gitgraph Graphx NORMALx LRx titled pickx Titlex über
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';
import { GITGRAPH_HARVEST } from './harvest.ts';

// U+2028 and U+2029: `\s` and v12's comment removal (`^`, multiline) treat them as line
// terminators; NEWLINE, `[^\n\r]` and `\w` do not, and STRING's `\\.` stops at them.
export const LINE_SEPARATORS: CorpusItem[] = [
  'gitGraph commit',
  'gitGraph\n  commit commit',
  'gitGraph\ntitle a b\ncommit',
  'gitGraph\naccTitle: a b\naccDescr: c d\ncommit',
  'gitGraph\naccDescr { a }\ncommit',
  'gitGraph\ncommit msg:"a b"',
  'gitGraph\ncommit msg:"a\\ b"',
  'gitGraph\ncommit\n %% c\ncommit',
  'gitGraph\ncommit %% c commit',
  'gitGraph LR :\ncommit',
  ' gitGraph\ncommit',
  'gitGraph\nbranch a b',
].map((source, k) => ({ id: `line separators ${k}`, source }));

/** The lexer facts the spec probed against 2.0.1 (#292 "Parser"), and the rules' corners. */
export const QUIRKS: CorpusItem[] = [
  // Headers: the colon forms, directions, boundaries, case, statements on the header line.
  'gitGraph:\ncommit',
  'gitGraph :\ncommit',
  'gitGraph TB:\ncommit',
  'gitGraph BT :\ncommit',
  'gitGraph LR\ncommit',
  'gitGraph:TB\ncommit',
  'gitGraph\tTB:\ncommit',
  'gitGraph commit',
  'gitGraph:commit',
  'gitGraph TB: commit',
  'gitGraph%%x\ncommit',
  'gitGraph%x\ncommit',
  'gitGraphx\ncommit',
  'gitGraph.x\ncommit',
  'gitGraph-x\ncommit',
  'gitGraph:x\ncommit',
  'gitGraph\ngitGraph\ncommit',
  'gitGraph\nGITGRAPH\ngitgraph\ncommit',
  'gitGraph TBx:\ncommit',
  'gitGraph LR-:\ncommit',
  'gitGraph\nLR\nTB\nBT\nLRx\nlr',
  // Keywords that start a longer name yield to REFERENCE; colon keywords do not.
  'gitGraph\ncommits\ncherry-pick03\nmerged\nNORMALx\nHIGHLIGHTs\nREVERSE_',
  'gitGraph\ncommit:\ncommit-x\ncommit.x\ncommit.\ncommit/\ncommit/x',
  'gitGraph\ncheckout-\nswitch.a\nbranch_\nmerge-/',
  'gitGraph\ncommitid:"x"',
  'gitGraph\ncommit id:"a"msg:"b"tag:"c"type:HIGHLIGHT',
  'gitGraph\ncommit id :"a" msg : "b"',
  'gitGraph\ncommit idx:"a" ids:"b" message:"c"',
  'gitGraph\ncommit type:NORMAL\ncommit type: REVERSE\ncommit type:HIGHLIGHT\ncommit type:REVERSEd',
  'gitGraph\ncommit type:normal',
  'gitGraph\ncommit\nCommit\nCOMMIT',
  'gitGraph\ncommit "message" "two"',
  'gitGraph\ncommit tag:"a" tag:"b" tag:""',
  'gitGraph\ncommit\nbranch b order:1\nbranch c order: 2\nbranch d order:  10',
  'gitGraph\ncherry-pick id:"a" parent:"b" tag:"c"',
  'gitGraph\ncherry-pick\ncherry-\ncherry-pickx\ncherry',
  'gitGraph\nmerge a id:"m" tag:"t" type:REVERSE',
  'gitGraph\nparent:x order:y type:z msg:w tag:v id:u',
  'gitGraph\nparent: order: type: msg: tag: id: :',
  // TITLE does not yield (D269); the blanks before it and the accessibility tokens stay in.
  'gitGraph\nbranch titled',
  'gitGraph\ntitlex\ncommit',
  'gitGraph\n  title  x  %% c\ncommit',
  'gitGraph\ntitle\ncommit',
  'gitGraph\ntitle%%x\ncommit',
  'gitGraph\ntitle \ncommit',
  'gitGraph title t\ncommit',
  'gitGraph\ncommit msg:"a" title x',
  'gitGraph\naccTitle: a %% b\naccDescr : c %% d\ncommit',
  'gitGraph\naccDescr {\n  one\n\n  two\n}\ncommit',
  'gitGraph\naccDescr\n\n{x}\ncommit',
  'gitGraph\naccDescr { never closed\ncommit',
  'gitGraph\naccTitle x\ncommit',
  'gitGraph\naccTitlex: y\naccDescription: z',
  '---\ntitle: Front\n---\ngitGraph\ntitle In text\ncommit',
  // INT outranks REFERENCE and gives up a digit before a dot.
  'gitGraph\nbranch 123',
  'gitGraph\nbranch 10abc',
  'gitGraph\nbranch 1.0.1',
  'gitGraph\nbranch 1.5',
  'gitGraph\nbranch 10.5',
  'gitGraph\nbranch b order: 1.5',
  'gitGraph\nbranch b order: 01',
  'gitGraph\nbranch b order: 0.5',
  'gitGraph\nbranch b order: 100',
  'gitGraph\nbranch b order: -1',
  'gitGraph\nbranch 0x1\nbranch 007\nbranch 99.',
  // References: the characters they take, where they stop.
  'gitGraph\nbranch feature/test-branch\nbranch my-feature_branch\nbranch v1.0.2-MDR',
  'gitGraph\nbranch a.\nbranch a/\nbranch a-\nbranch a..b\nbranch a./',
  'gitGraph\nbranch _x\nbranch x_\nbranch 9a\nbranch a.-',
  'gitGraph\nbranch über',
  'gitGraph\nbranch 😀\ncommit',
  'gitGraph\nbranch "quoted name"\nbranch \'single\'',
  // Strings: either quote, escapes, line breaks inside, unterminated.
  'gitGraph\ncommit msg:"a\\"b" tag:\'c\\\'d\' id:"e\\\\"',
  'gitGraph\ncommit msg:"a\nb"',
  'gitGraph\ncommit msg:"a\\\nb"',
  'gitGraph\ncommit msg:"never closed\ncommit',
  "gitGraph\ncommit msg:'never closed",
  'gitGraph\ncommit msg:"<b class="x">bold</b>"',
  'gitGraph\ncommit msg:"Fix issue #123: Handle errors"',
  // Stray characters: one error, the characters skipped, lexing goes on.
  'gitGraph\n-x\ncommit',
  'gitGraph\ncommit;',
  'gitGraph\ncommit id:"a";\ncommit',
  'gitGraph\ncommit @ commit',
  'gitGraph\ncommit msg:"😀"',
  'gitGraph\ncommit\n\t\n  \ncommit',
  // Hidden tokens left in the text v12 lexed; entities and dropped semicolons.
  'gitGraph\ncommit %% trailing\ncommit %%',
  'gitGraph\ncommit %%{init: {}}%%\ncommit',
  'gitGraph\ncommit %%{ x }%%y\ncommit',
  'gitGraph\n---\nbody: yaml\n---\ncommit',
  'gitGraph\n---\nnever closed\ncommit',
  'gitGraph\ncommit\n---\n---\ncommit\n---\n---\n',
  'gitGraph\ncommit msg:"a #quot;b#quot; #9829;"',
  'gitGraph\ncommit msg:"style a:#f00;"',
  'gitGraph\naccTitle: classDef x:#f00; y;\ncommit',
  // Line breaks, blank-only bodies, leading blanks.
  'gitGraph',
  'gitGraph\n\n\n',
  '   gitGraph   \n\t\n  commit  \n',
  'gitGraph\rcommit\rcommit',
  'gitGraph\r\ncommit\r\n\r\ncommit\r\n',
  '%% lead\ngitGraph\ncommit',
].map((source, k) => ({ id: `quirk ${k}`, source }));

/**
 * Parser and model cases (#370): each of v12's DB checks, repeated and duplicate ids (D264,
 * cycles included), cherry-pick tags, branch order, title and accessibility lines, names that
 * need quotes, and several errors in one text.
 */
export const PARSER_CASES: CorpusItem[] = [
  // v12's DB checks: branch, checkout, merge (7), cherry-pick (5).
  'gitGraph\ncommit\nbranch main',
  'gitGraph\ncommit\nbranch a\nbranch a',
  'gitGraph\ncommit\ncheckout nope',
  'gitGraph\ncommit\nbranch a\ncommit\ncheckout main\nmerge a\ncheckout a\nmerge main',
  'gitGraph\ncommit\nbranch a\nmerge a',
  'gitGraph\ncommit\nbranch a\ncommit\ncheckout main\nmerge main',
  'gitGraph\nbranch a\ncommit\ncheckout main\nmerge a',
  'gitGraph\ncommit\nmerge nope',
  'gitGraph\nbranch a\ncheckout main\ncommit\nmerge a',
  'gitGraph\ncommit\nbranch a\ncheckout main\nmerge a',
  'gitGraph\ncommit id:"A"\nbranch a\ncommit\ncheckout main\nmerge a id:"A"',
  'gitGraph\ncommit\ncherry-pick',
  'gitGraph\ncommit\ncherry-pick id:"nope"',
  'gitGraph\ncommit id:"A"\nbranch a\ncommit id:"B"\ncheckout main\ncommit id:"C"\nmerge a id:"M"\nbranch b\ncommit\ncherry-pick id:"M" parent:"B2"',
  'gitGraph\ncommit id:"A"\nbranch a\ncommit id:"B"\ncheckout main\ncommit id:"C"\nmerge a id:"M"\nbranch b\ncommit\ncherry-pick id:"M"',
  'gitGraph\ncommit id:"A"\ncherry-pick id:"A"',
  'gitGraph\nbranch b\ncheckout main\ncommit id:"A"\ncheckout b\ncherry-pick id:"A"',
  // Successful cherry-picks: the default tag, a merge source, tag "" and several tags.
  'gitGraph\ncommit id:"A" msg:"first"\nbranch a\ncommit\ncherry-pick id:"A"',
  'gitGraph\ncommit id:"A"\nbranch a\ncommit\ncherry-pick id:"A" tag:""',
  'gitGraph\ncommit id:"A"\nbranch a\ncommit\ncherry-pick id:"A" tag:"x" tag:"" tag:"y"',
  'gitGraph\ncommit id:"A"\nbranch a\ncommit\ncherry-pick id:"A" parent:"Z"',
  'gitGraph\ncommit id:"A"\nbranch a\ncommit\ncherry-pick id:"A" parent:""',
  'gitGraph\ncommit id:"A"\nbranch a\ncommit id:"B"\ncheckout main\ncommit id:"C"\nmerge a id:"M"\nbranch b\ncommit\ncherry-pick id:"M" parent:"B"\ncherry-pick id:"C"',
  // Merges: ids, types, tags, an empty id, a type and tags in any order.
  'gitGraph\ncommit\nbranch a\ncommit\ncheckout main\nmerge a id:"" tag:"t" type:HIGHLIGHT tag:"u"',
  'gitGraph\ncommit\nbranch a\ncommit\ncheckout main\nmerge "a" type:REVERSE id:"m" type:NORMAL',
  'gitGraph\ncommit\nbranch a\ncommit\ncheckout main\ncommit\nmerge a\nswitch a\ncommit\nswitch main\nmerge a',
  // Duplicate ids (D264): consecutive, a cycle, across branches, a derived id written out.
  'gitGraph\ncommit id:"A"\ncommit id:"A"',
  'gitGraph\ncommit id:"A"\ncommit id:"B"\ncommit id:"A"',
  'gitGraph\ncommit id:"A"\ncommit id:"B"\ncommit id:"A"\ncommit id:"B"\ncommit',
  'gitGraph\ncommit id:"A"\nbranch a\ncommit id:"A"\ncheckout main\ncommit',
  'gitGraph\ncommit\ncommit id:"0-9e3779b"\ncommit',
  'gitGraph\ncommit id:"1-3c6ef36"\ncommit',
  'gitGraph\ncommit id:""\ncommit id:"" msg:"x"',
  // Branch order: ties keep creation order; unordered branches are 0.
  'gitGraph\ncommit\nbranch a order:3\nbranch b\nbranch c order:1\nbranch d order:0',
  'gitGraph\nbranch x order:99999999999999999999\nbranch y',
  // Commit options: repeats, types, bare and `msg:` messages, empty values.
  'gitGraph\ncommit "a" msg:"b" "c" id:"x" id:"y" type:REVERSE type:HIGHLIGHT tag:"1" tag:"1"',
  'gitGraph\ncommit msg:""\ncommit type:NORMAL',
  'gitGraph\ncommit msg:"a = b < c > d <br> e"\nbranch "x<br>y"\ncommit tag:"a=b"',
  'gitGraph\ncommit id:"__proto__"\nbranch constructor\ncommit\ncheckout main\nmerge constructor',
  'gitGraph\nbranch "quoted name"\ncommit\ncheckout "main"\nmerge "quoted name"',
  'gitGraph\nbranch a\nbranch b\ncheckout a\ncheckout main\ncommit',
  // Title and accessibility lines: in-text, repeated, empty, with the front matter.
  'gitGraph\ntitle Release flow\naccTitle: Releases\naccDescr: How releases branch off\ncommit',
  'gitGraph TB:\n  title  One  two  \n  commit\n  title second\n  branch a\n  commit',
  'gitGraph\naccDescr {\n  line one\n    line two\n}\ncommit\naccTitle: x\naccTitle: ',
  '---\ntitle: Front\n---\ngitGraph\ncommit\ntitle\ncommit',
  '---\ntitle: Front\n---\ngitGraph BT:\naccTitle: Front matter and text\ncommit',
  'gitGraph title On the header line\ncommit',
  'gitGraph accTitle: a\naccDescr: b\ncommit',
  // Names that need quotes (D269), keywords as names.
  'gitGraph\ncommit\nbranch "titled"\ncommit',
  'gitGraph\ncommit\nbranch title',
  'gitGraph\ncommit\nbranch "123"\ncheckout "123"',
  'gitGraph\ncommit\nbranch commit',
  'gitGraph\ncommit\nbranch "commit"\ncheckout "commit"',
  'gitGraph\ncommit\nbranch LR\nbranch NORMAL',
  'gitGraph\ncommit\nbranch\ncommit',
  'gitGraph\ncommit\nmerge',
  // Statements on the header line and several errors in one text.
  'gitGraph TB: commit\nbranch a',
  'gitGraph: branch a\ncommit',
  'gitGraph\ncommit id:"a" oops:"x"\ncommit',
  'gitGraph\ncommit id:"1" commit id:"2"',
  'gitGraph\ncommit\ncheckout x\nbranch a order:x\nmerge y\ncommit',
  'gitGraph\ncommit id "a"\ncommit tag "b"\ncommit',
  'gitGraph\ncommit type:OTHER\ncommit\ncherry-pick id:"x" msg:"y"',
].map((source, k) => ({ id: `parser case ${k}`, source }));

/**
 * Unclosed `%%{` directives. Core's preprocess ends one at its line end and reports
 * `UNCLOSED_DIRECTIVE` (an error, so v13 rejects the source); v12's directive regex removed
 * the line break after it too, or every line after it. That is core's reading of directives
 * for every type, not a gitGraph lexer rule, so the gate leaves these out (see the spec).
 */
export const UNCLOSED_DIRECTIVES: CorpusItem[] = [
  'gitGraph\n%%{ never closed\ncommit',
  'gitGraph\n%%{init: {\ncommit',
].map((source, k) => ({ id: `unclosed directive ${k}`, source }));

/** The gitGraph corpus: the e2e fixtures and the harvested v12 spec strings. */
export async function gitGraphCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/git'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(readFileSync(GITGRAPH_HARVEST, 'utf8')) as CorpusItem[];
  return [...items, ...specs];
}

/** The corpus, the cases above, and a CRLF and a commented copy of each. */
export async function gitGraphGateCorpus(): Promise<CorpusItem[]> {
  const all = [
    ...(await gitGraphCorpus()),
    ...LINE_SEPARATORS,
    ...QUIRKS,
    ...PARSER_CASES,
    ...UNCLOSED_DIRECTIVES,
  ];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
