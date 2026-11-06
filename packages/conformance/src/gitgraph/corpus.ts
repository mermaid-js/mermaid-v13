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
  const all = [...(await gitGraphCorpus()), ...LINE_SEPARATORS, ...QUIRKS, ...UNCLOSED_DIRECTIVES];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}
