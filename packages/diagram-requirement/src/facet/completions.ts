/**
 * Requirement completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items.
 * A keyword is offered only where the parser tests its kind: the kinds, `element` and the other
 * statements at a line start, the fields in a body, the risks after `risk:`, the methods after
 * `verifymethod:`, the relationships after `-`. Where a name is expected, the statement before the
 * cursor tells what it is: a box name at either end of a relation and as a `style` or `class`
 * target, a class name after `:::` and in `class`'s second list, and nothing where a new name or
 * a value is written (after a kind keyword, after a field's `:`). Inside quotes and in the
 * `acc…` values nothing is offered.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { requirementCategories } from '../generated/categories.ts';
import { requirementDocs } from '../generated/docs.ts';
import type { RequirementModel } from '../model.ts';
import type { RequirementDocument } from '../parser/ast.ts';
import { NAME, REQ_KINDS } from '../parser/syntax.ts';
import { T } from '../parser/tokens.ts';
import { nameAsWritten } from './names.ts';
import type { KeywordItem } from './tables.ts';
import {
  FIELDS,
  OPERATORS,
  RELATIONSHIPS,
  span,
  STATEMENT_KEYWORDS,
  tokenBefore,
  VALUES,
} from './tables.ts';
import { CompletionList as Items } from '@mermaid-js/shared/parser/facet';

/** Modes whose text is a value, not code: nothing is offered there. */
const VALUE_MODES = new Set([
  'string',
  'accTitle',
  'accDescr',
  'accDescrMultiline',
  'comment',
  'directive',
  'frontMatter',
]);
const VALUE_KINDS = [T.AccTitleValue, T.AccDescrValue, T.AccDescrMultilineValue, T.QString];
/** Where a statement ends. */
const STATEMENT_END = new Set<number>([
  Kind.Newline,
  Kind.EOF,
  T.NewlineAfterBlank,
  T.StyleEnd,
  T.Eof,
  T.StructStart,
  T.StructStop,
]);
/** Ids, keywords and numbers: a cursor inside one replaces all of it. */
const isWord = (kind: number) =>
  ['Variable', 'Keyword', 'Number', 'Constant', 'Type'].includes(requirementCategories[kind] ?? '');

/** The statement the cursor is in, up to the word being typed. */
interface Statement {
  /** Kind of its first significant token, or -1 at a statement start. */
  head: number;
  /** Kind of the last significant token before the word, or -1. */
  prev: number;
  /** Blank-separated groups after the head (`class a |` has one). */
  groups: number;
}

function statementBefore(text: string, tokens: TokenStream, at: number): Statement {
  const found: { kind: number; start: number; end: number }[] = [];
  for (let i = tokenBefore(tokens, at - 1); i >= 0; i--) {
    const k = tokens.kind[i]!;
    const end = tokens.end[i] ?? 0;
    if (end > at) continue;
    if (STATEMENT_END.has(k)) break;
    if (k === Kind.Comment || k === Kind.Directive || k === Kind.Space) continue;
    found.push({ kind: k, start: tokens.start[i] ?? 0, end });
  }
  found.reverse();
  // Blanks are no token, so groups are told apart by the text between tokens; a quoted name
  // (`"`, text, `"`) is one group.
  let groups = 0;
  for (let i = 1; i < found.length; i++) {
    if (/\s/.test(text.slice(found[i - 1]!.end, found[i]!.start)) && found[i]!.kind !== T.QString)
      groups++;
  }
  return { head: found[0]?.kind ?? -1, prev: found[found.length - 1]?.kind ?? -1, groups };
}

/** Tokens that take the `:` or `{` and the blanks after their keyword. */
const OPENERS = new Set<number>([T.AccTitle, T.AccDescr, T.AccDescrOpen]);

/**
 * The probed word's range: the prefix, plus the rest of the word after the cursor, up to a
 * blank, `:` or `{` (an `acc…` token holds them); undefined when the cursor is past the `:` or
 * `{` of such a token, where the value starts.
 */
function wordRange(text: string, tokens: TokenStream, probe: ProbeResult): Range | undefined {
  const o = probe.offset;
  let end = o;
  const i = tokenBefore(tokens, o);
  const start = tokens.start[i] ?? 0;
  const tokenEnd = tokens.end[i] ?? 0;
  const opener = i >= 0 && start < o && o <= tokenEnd && OPENERS.has(tokens.kind[i]!);
  if (opener && /[:{]/.test(text.slice(start, o))) return undefined;
  if (i >= 0 && start < o && o < tokenEnd && isWord(tokens.kind[i]!)) end = tokenEnd;
  const stop = /[\s:{]/.exec(text.slice(o, end));
  if (stop) end = o + stop.index;
  return span(probe.prefix.start, end);
}

type NameContext = 'boxes' | 'classes' | 'none';

/** What an expected name is at this point of the statement. */
function nameContext(st: Statement): NameContext {
  if (st.prev === T.StyleSeparator) return 'classes';
  if (st.prev === T.ColonSep) return 'none';
  switch (st.head) {
    case T.Class:
      return st.groups === 0 ? 'boxes' : 'classes';
    case T.ClassDef:
      return st.groups === 0 ? 'classes' : 'none';
    case T.Style:
      return st.groups === 0 ? 'boxes' : 'none';
    case T.Element:
      return 'none';
    default:
      // After a kind keyword a new name is written.
      return REQ_KINDS.includes(st.head) ? 'none' : 'boxes';
  }
}

/** The boxes' names, as written where a name goes (quoted when not bare), in palette order. */
function boxes(items: Items, model: RequirementModel): void {
  const add = (name: string, detail: string) => {
    const insert = nameAsWritten(name, 'requirement');
    if (insert !== undefined) items.add(name, 'node', { insertText: insert, detail });
  };
  for (const r of model.requirements) add(r.name, r.kind);
  for (const e of model.elements) add(e.name, 'Element');
}

function classes(items: Items, model: RequirementModel): void {
  for (const c of model.classes) {
    if (c.name === 'default') continue;
    const insert = nameAsWritten(c.name, 'class');
    if (insert !== undefined) items.add(c.name, 'class', { insertText: insert });
  }
}

export function requirementCompletions(
  probe: ProbeResult,
  doc: DocumentView<RequirementDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens || VALUE_MODES.has(probe.mode)) return [];
  const expected = new Set(probe.expected);
  if (VALUE_KINDS.some((k) => expected.has(k))) return [];
  const range = wordRange(text, tokens, probe);
  if (!range) return [];
  const items = new Items(text.slice(range.start, probe.offset), range, true);
  const model = result.model as RequirementModel;
  for (const k of STATEMENT_KEYWORDS)
    if (expected.has(k.kind)) items.keyword(k, requirementDocs[k.kind], 'keyword');
  for (const k of FIELDS)
    if (expected.has(k.kind)) items.keyword(k, requirementDocs[k.kind], 'property');
  for (const k of VALUES)
    if (expected.has(k.kind)) items.keyword(k, requirementDocs[k.kind], 'constant');
  for (const k of RELATIONSHIPS)
    if (expected.has(k.kind)) items.keyword(k, requirementDocs[k.kind], 'keyword');
  const st = statementBefore(text, tokens, range.start);
  if (NAME.some((k) => expected.has(k)) || expected.has(T.Alpha)) {
    const context = nameContext(st);
    if (context === 'boxes') boxes(items, model);
    else if (context === 'classes') classes(items, model);
  }
  if (st.head !== -1)
    for (const k of OPERATORS)
      if (expected.has(k.kind)) items.keyword(k, requirementDocs[k.kind], 'operator');
  return items.list;
}
