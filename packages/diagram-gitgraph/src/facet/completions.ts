/**
 * gitGraph completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to
 * items. An item is offered only when the parser tests its kind at the cursor: the header in
 * an empty text; a direction and its colon after `gitGraph` on its line; the statements at the
 * start of a line; each statement's options after it (`id:`, `msg:`, `tag:`, `type:` for a
 * commit, `id:`, `tag:`, `type:` for a merge, `id:`, `parent:`, `tag:` for a cherry-pick,
 * `order:` for a branch); the commit types after `type:`. Names come from the text before the
 * cursor: the branches made so far (the main branch first, under its configured name) after
 * `checkout`, `switch` and `merge` (not the branch checked out, for a merge); after a
 * cherry-pick's `id:` the commit ids written so far that are not on the branch checked out (a
 * merge only with a `parent:`), after its `parent:` the parents of the merge its `id:` names,
 * quoted. Nothing is offered in
 * a message, tag or other text, a title or accessibility value, or outside code. Keywords are
 * matched without regard to case.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { gitgraphDocs } from '../generated/docs.ts';
import type { GitModel } from '../model.ts';
import type { GitGraphDocument } from '../parser/ast.ts';
import { stringValue } from '../parser/convert.ts';
import { GITGRAPH_TRIVIA, T } from '../parser/tokens.ts';
import { invalidReason } from './names.ts';
import {
  COLON_ITEM,
  DIRECTION_ITEMS,
  HEADER_ITEMS,
  lineBefore,
  OPTION_ITEMS,
  quoted,
  span,
  STATEMENT_ITEMS,
  TYPE_ITEMS,
} from './tables.ts';
import type { KeywordItem } from './tables.ts';

const HEADER_LINE = /^[\t ]*gitGraph\b/;
const BARE_HEADER_LINE = /^[\t ]*gitGraph[\t ]+$/;
const QUOTES = new Set(['"', "'"]);
/** The statements that take a branch name. */
const BRANCH_TAKERS = new Set<number>([T.Checkout, T.Switch, T.Merge]);

/**
 * The probed word's line: the significant token before the word and the line's first, whether
 * the line has a `parent:`, and the id its `id:` names (an unclosed string's quote is the word).
 */
interface LineContext {
  readonly previous: number | undefined;
  readonly first: number | undefined;
  readonly parent: boolean;
  readonly id: string | undefined;
}

function lineContext(text: string, tokens: TokenStream, at: number): LineContext {
  let previous: number | undefined;
  let first: number | undefined;
  let parent = false;
  let id: string | undefined;
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j] ?? Kind.EOF;
    const start = tokens.start[j] ?? 0;
    if (GITGRAPH_TRIVIA[kind] === 1) continue;
    if (kind === Kind.Newline || kind === Kind.EOF) {
      if (start >= at) break;
      previous = first = id = undefined;
      parent = false;
      continue;
    }
    if (kind === T.Parent) parent = true;
    if (kind === T.Id && tokens.kind[j + 1] === T.String)
      id = stringValue(text.slice(tokens.start[j + 1] ?? 0, tokens.end[j + 1] ?? 0));
    if ((tokens.end[j] ?? 0) > at || start >= at) continue;
    previous = kind;
    first ??= kind;
  }
  return { previous, first, parent, id };
}

/** The end of the token holding `offset` inside it, else `offset`. */
function tokenEnd(tokens: TokenStream, offset: number): number {
  for (let j = 0; j < tokens.length; j++) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (start >= offset) break;
    if (offset < end && GITGRAPH_TRIVIA[tokens.kind[j] ?? 0] !== 1) return end;
  }
  return offset;
}

/**
 * The text `item` inserts before `rest` (what follows the replaced word): its separator only
 * when `rest` does not start with a blank or a value (`branch` before ` dev`, `id:` before
 * `"x"`).
 */
function insertText(item: KeywordItem, rest: string): string {
  const sep = item.separator ?? '';
  if (sep === '' || /^[\t ]*[:{"']/.test(rest) || /^[\t ]/.test(rest)) return item.label;
  return item.label + sep;
}

/** The branches made before `at`, the main branch first, and the one checked out there. */
function branchesBefore(
  ast: GitGraphDocument,
  main: string,
  at: number
): { names: string[]; current: string } {
  const names = [main];
  let current = main;
  for (const node of ast.children) {
    if (node.range.start >= at) break;
    if (node.type === 'Branch') {
      if (!names.includes(node.name.value)) names.push(node.name.value);
      current = node.name.value;
    } else if (node.type === 'Checkout' && names.includes(node.branch.value)) {
      current = node.branch.value;
    }
  }
  return { names, current };
}

/**
 * The commit ids a cherry-pick at `at` can name with `id:`: written by a commit or merge before
 * it, not on the branch checked out there; a merge only when the line has a `parent:` (v12
 * needs one for a merge).
 */
function pickIds(
  ast: GitGraphDocument,
  model: GitModel,
  at: number,
  current: string,
  merges: boolean
): string[] {
  const out: string[] = [];
  for (const node of ast.children) {
    if (node.range.start >= at) break;
    if (node.type !== 'Commit' && node.type !== 'Merge') continue;
    const id = node.commitId?.value;
    if (!id || out.includes(id) || (node.type === 'Merge' && !merges)) continue;
    if (model.commits.find((c) => c.id === id)?.branch === current) continue;
    out.push(id);
  }
  return out;
}

/** The parents of merge `id` that have an id the text wrote, for `parent:`. */
function mergeParents(model: GitModel, id: string | undefined): string[] {
  const merge = model.commits.find((c) => c.id === id && c.type === 'MERGE');
  if (!merge) return [];
  return merge.parents.filter((p) => model.commits.find((c) => c.id === p)?.customId);
}

/** Name items: `labels` that start with what was typed (quotes aside), over `range`. */
function nameItems(
  labels: readonly string[],
  typed: string,
  range: Range,
  detail: string
): CompletionItem[] {
  const unquoted = (s: string) => (QUOTES.has(s.charAt(0)) ? s.slice(1) : s).toLowerCase();
  const want = unquoted(typed);
  return labels
    .filter((l) => unquoted(l).startsWith(want))
    .map((label) => ({ label, kind: 'value', insertText: label, range, detail }));
}

/**
 * A name where the parser expects one: a branch after `checkout`, `switch` or `merge`; a commit
 * id after a cherry-pick's `id:` or `parent:`. Over the word or string being typed, to its end.
 * `undefined` where no name goes.
 */
function nameCompletions(
  probe: ProbeResult,
  doc: DocumentView<GitGraphDocument>,
  tokens: TokenStream
): CompletionItem[] | undefined {
  const { text, result } = doc;
  const start = probe.prefix.start;
  const typed = text.slice(start, probe.offset);
  const expected = new Set(probe.expected);
  const line = lineContext(text, tokens, start);
  const { previous, first } = line;
  const model = result.model as GitModel;
  const range = span(start, tokenEnd(tokens, probe.offset));
  const quote = QUOTES.has(typed.charAt(0)) ? typed.charAt(0) : undefined;
  const { names, current } = branchesBefore(result.ast, model.mainBranch, start);
  if (expected.has(T.Reference) && previous !== undefined && BRANCH_TAKERS.has(previous)) {
    const labels = names
      .filter((n) => previous !== T.Merge || n !== current)
      .map((n) => (quote === undefined && invalidReason(n) === undefined ? n : quoted(n, quote)));
    return nameItems(labels, typed, range, 'branch');
  }
  const pick = first === T.CherryPick && (previous === T.Id || previous === T.Parent);
  if (!expected.has(T.String) || !pick) return undefined;
  const ids =
    previous === T.Id
      ? pickIds(result.ast, model, start, current, line.parent)
      : mergeParents(model, line.id);
  return nameItems(
    ids.map((id) => quoted(id, quote)),
    typed,
    range,
    'commit'
  );
}

/**
 * Keywords where the parser expects them, over the word being typed to its end (an option
 * keeps its colon); at a word's first character nothing is replaced.
 */
function keywordCompletions(probe: ProbeResult, text: string): CompletionItem[] {
  const start = probe.prefix.start;
  const prefix = text.slice(start, probe.offset).toLowerCase();
  const expected = new Set(probe.expected);
  const before = lineBefore(text, start);
  const items: KeywordItem[] = [];
  if (/^[\t ]*$/.test(before) && expected.has(T.GitGraph)) items.push(...HEADER_ITEMS);
  else if (BARE_HEADER_LINE.test(before)) items.push(...DIRECTION_ITEMS);
  else if (HEADER_LINE.test(before)) items.push(COLON_ITEM);
  else items.push(...STATEMENT_ITEMS, ...OPTION_ITEMS, ...TYPE_ITEMS);
  const end =
    prefix === ''
      ? probe.offset
      : probe.offset + (/^[-\w./]*:?/.exec(text.slice(probe.offset))?.[0].length ?? 0);
  const rest = text.slice(end);
  // Before `{` only `accDescr` reads as a block.
  const block = /^[\t ]*\{/.test(rest);
  const out: CompletionItem[] = [];
  for (const k of items) {
    if (!expected.has(k.kind) || !k.label.toLowerCase().startsWith(prefix)) continue;
    if (block && k.kind !== T.AccDescr) continue;
    const documentation = gitgraphDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: insertText(k, rest),
      range: span(start, end),
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  return out;
}

export function gitGraphCompletions(
  probe: ProbeResult,
  doc: DocumentView<GitGraphDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens || (probe.mode !== 'INITIAL' && probe.mode !== 'string')) return [];
  if (/[\n\r]/.test(text.slice(probe.prefix.start, probe.offset))) return [];
  const names = nameCompletions(probe, doc, tokens);
  if (names) return names;
  return probe.mode === 'INITIAL' ? keywordCompletions(probe, text) : [];
}
