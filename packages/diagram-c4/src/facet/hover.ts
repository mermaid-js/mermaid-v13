/**
 * C4 hover (DESIGN §4.5, D93): a keyword (a header, a macro, `title`, `accDescr`, …) its
 * one-line doc from the grammar file (`generated/docs.ts`); an argument the slot it fills,
 * positional or `$name`, with what that slot does (`tables.ts`) and, for a `$name`, whether the
 * statement reads it; an alias or a relation end, also the element or boundary it names (an
 * element first, as v12 looks them up). A statement still being written (no `)` yet) has no AST
 * node: its argument is read from the tokens, as completion reads it. Never a preview.
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { c4Docs } from '../generated/docs.ts';
import { kindWords, type C4Boundary, type C4Element, type C4Model } from '../model.ts';
import type { C4Document, C4StatementNode } from '../parser/ast.ts';
import { nameRoute, SLOT_TABLES } from '../parser/slots.ts';
import type { SlotTable } from '../parser/slots.ts';
import { KEYWORDS } from '../parser/tokens.ts';
import { callAt } from './args.ts';
import { code, span } from './markdown.ts';
import { RELATION_TYPE_DOC, SLOT_DOCS } from './tables.ts';
import { plural } from '@mermaid-js/shared/parser/facet';

const IGNORED = 'This one is ignored.';
const SET_AFTER =
  'Changes nothing here: mermaid@12 set it again after the arguments (it applies in `UpdateElementStyle`).';

/** One argument under the cursor, from the AST or the tokens. */
interface ArgAt {
  macro: string;
  table: SlotTable;
  /** Its index among the arguments as written. */
  k: number;
  name?: string;
  value: string;
  range: Range;
  /** The statement's first argument, when positional: the alias `UpdateElementStyle` styles. */
  first?: string;
}

/** The macro statement whose arguments hold `at`, at any depth. */
function statementAt(list: readonly C4StatementNode[], at: number): C4StatementNode | undefined {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const n = list[mid]!;
    if (n.range.end < at) lo = mid + 1;
    else if (n.range.start > at) hi = mid - 1;
    else {
      const last = n.args[n.args.length - 1];
      if (n.type !== 'Boundary' || (last !== undefined && at <= last.range.end)) return n;
      return statementAt(n.children, at);
    }
  }
  return undefined;
}

/** The argument at `at` in a parsed statement. */
function fromAst(doc: DocumentView<C4Document>, at: number): ArgAt | undefined {
  const node = statementAt(doc.result.ast.children, at);
  if (!node) return undefined;
  const k = node.args.findIndex((a) => a.range.start <= at && at <= a.range.end);
  const arg = node.args[k];
  const kind = KEYWORDS.get(node.macro);
  const table = kind === undefined ? undefined : SLOT_TABLES.get(kind);
  if (!arg || !table) return undefined;
  const first = node.args[0];
  return {
    ...(first?.name === undefined && first && { first: first.value }),
    macro: node.macro,
    table,
    k,
    ...(arg.name !== undefined && { name: arg.name }),
    value: arg.value,
    range: arg.range,
  };
}

/** The argument at `at` in a statement still being written, read from the tokens. */
function fromTokens(doc: DocumentView<C4Document>, at: number): ArgAt | undefined {
  const { text, result } = doc;
  const call = result.tokens && callAt(result.tokens, text, at);
  const arg = call?.at;
  const table = call && SLOT_TABLES.get(call.kind);
  if (!call || !arg || !table) return undefined;
  // An argument still open runs to the end of its line here.
  const lineEnd = text.slice(arg.range.start).search(/[\n\r]|$/) + arg.range.start;
  let start = arg.range.start;
  while (start < lineEnd && /[\t ]/.test(text.charAt(start))) start++;
  const range = span(start, Math.min(arg.range.end, lineEnd));
  const name = arg.name && /^[^\s=]*/.exec(text.slice(arg.name.start, arg.name.end))?.[0];
  const value = arg.value ? text.slice(arg.value.start, arg.value.end).trim() : '';
  const head = call.args[0];
  const first = head?.value && !head.name && text.slice(head.value.start, head.value.end).trim();
  return {
    ...(first && { first }),
    macro: text.slice(call.keyword.start, call.keyword.end),
    table,
    k: call.index,
    ...(name !== undefined && { name }),
    value,
    range,
  };
}

/** One line, cut at 40 characters. */
export function short(text: string): string {
  const line = /^[^\n\r]*/.exec(text.trim())?.[0] ?? '';
  return line.length > 40 || line.length < text.trim().length ? `${line.slice(0, 40)}…` : line;
}

function elementFacts(model: C4Model, e: C4Element): string {
  const facts = [`**${kindWords(e.kind)}** ${code(e.alias)}`];
  if (e.label !== '') facts.push(`Label: ${code(short(e.label))}`);
  const parent = model.boundaries[e.parent];
  if (parent) facts.push(`In ${code(parent.alias)}`);
  return facts.join('\n\n');
}

function boundaryFacts(model: C4Model, b: C4Boundary, index: number): string {
  const what = b.nodeKind === undefined ? 'boundary' : 'deployment node';
  const facts = [`**${what}** ${code(b.alias)}`];
  if (b.label !== '') facts.push(`Label: ${code(short(b.label))}`);
  if (b.type !== undefined && b.type !== '') facts.push(`Type: ${code(short(b.type))}`);
  const held =
    model.elements.filter((e) => e.parent === index).length +
    model.boundaries.filter((x) => x.parent === index).length;
  facts.push(`Holds ${plural(held, 'shape or boundary', 'shapes and boundaries')}`);
  const parent = model.boundaries[b.parent];
  if (parent) facts.push(`In ${code(parent.alias)}`);
  return facts.join('\n\n');
}

/** What the alias names: an element first, else a boundary (v12's lookup). */
function aliasFacts(model: C4Model, alias: string, boundary: boolean): string {
  const b = model.boundaries.findIndex((x) => x.alias === alias);
  if (boundary && b >= 0) return boundaryFacts(model, model.boundaries[b]!, b);
  const e = model.elements.find((x) => x.alias === alias);
  if (e) return elementFacts(model, e);
  if (b >= 0) return boundaryFacts(model, model.boundaries[b]!, b);
  return `No element or boundary has the alias ${code(alias)}.`;
}

/**
 * The doc of the `$name` in argument `arg.k`: what it sets on the statement's item, as
 * `parser/build.ts` reads it (`parser/slots.ts`).
 */
function nameDoc(model: C4Model, arg: ArgAt, name: string): string {
  const { table } = arg;
  // By position: the name changes nothing.
  if (table.names === 'none') return SLOT_DOCS[table.slots[arg.k]?.name ?? ''] ?? IGNORED;
  // `UpdateElementStyle` styles the element with the alias, else the boundary.
  const styledBoundary =
    !model.elements.some((e) => e.alias === arg.first) &&
    model.boundaries.some((b) => b.alias === arg.first);
  let item: 'element' | 'boundary' | 'relation' = styledBoundary ? 'boundary' : 'element';
  if (table.names !== 'styled') item = table.names;
  // Where the builder sends it (`nameRoute`, the one routing table).
  const route = nameRoute(item, name, table.setAfter);
  if (route === 'extra') return `Not a name ${code(arg.macro)} reads: kept, not drawn.`;
  if (route === 'again' && name !== 'wrap') return SET_AFTER;
  if (route === 'structure' && item === 'relation' && name === 'type') return RELATION_TYPE_DOC;
  return SLOT_DOCS[name] ?? '';
}

export function c4Hover(at: HoverTarget, doc: DocumentView<C4Document>): Hover | undefined {
  const t = at.token;
  const keywordDoc = t === undefined ? undefined : c4Docs[t.kind];
  if (t && keywordDoc !== undefined) {
    // The keyword alone: `title` and `accDescr {` take the text or blanks after them.
    const written = doc.text.slice(t.range.start, t.range.end);
    const word = /^\w+/.exec(written)?.[0] ?? written.trim();
    const range = span(t.range.start, t.range.start + word.length);
    return { range, contents: `**${code(word)}**\n\n${keywordDoc}` };
  }
  const arg = fromAst(doc, at.offset) ?? fromTokens(doc, at.offset);
  if (!arg) return undefined;
  const model = doc.result.model as C4Model;
  const { table, k, range } = arg;
  const where = `Argument ${k + 1} of ${code(arg.macro)}`;
  if (arg.name !== undefined) {
    const what = nameDoc(model, arg, arg.name);
    return { range, contents: `**${code(`$${arg.name}`)}**\n\n${where}. ${what}`.trim() };
  }
  const slot = table.slots[k];
  if (!slot) {
    const takes = plural(table.slots.length, 'argument');
    return { range, contents: `${where}: it takes ${takes}. ${IGNORED}` };
  }
  const what = slot.dropped ? `Dropped (as mermaid@12).` : (SLOT_DOCS[slot.name] ?? '');
  const lines = [`**${code(slot.name)}**`, `${where}. ${what}`.trim()];
  if (slot.role !== 'text' && arg.value !== '') {
    // A boundary's own alias names the boundary; a reference looks for an element first.
    lines.push(aliasFacts(model, arg.value, slot.role === 'alias' && table.names === 'boundary'));
  }
  return { range, contents: lines.join('\n\n') };
}
