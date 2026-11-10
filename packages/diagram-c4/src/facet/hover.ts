/**
 * C4 hover (DESIGN §4.5, D93): a keyword (a header, a macro, `title`, `accDescr`, …) its
 * one-line doc from the grammar file (`generated/docs.ts`); an argument the slot it fills,
 * positional or `$name`, with what that slot does (`tables.ts`); an alias or a relation end,
 * also the element or boundary it names (an element first, as v12 looks them up). Never a
 * preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { c4Docs } from '../generated/docs.ts';
import type { C4Boundary, C4Element, C4Model } from '../model.ts';
import type { C4Document, C4StatementNode } from '../parser/ast.ts';
import { ELEMENT_FIELDS, OFFSETS, RELATION_FIELDS } from '../parser/build.ts';
import { KEYWORDS } from '../parser/tokens.ts';
import { code, RELATION_TYPE_DOC, SLOT_DOCS, SLOTS, span } from './tables.ts';
import type { Slot } from './tables.ts';

const IGNORED = 'This one is ignored.';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

/** One line, cut at 40 characters. */
function short(text: string): string {
  const line = /^[^\n\r]*/.exec(text.trim())?.[0] ?? '';
  return line.length > 40 || line.length < text.trim().length ? `${line.slice(0, 40)}…` : line;
}

function elementFacts(model: C4Model, e: C4Element): string {
  const facts = [`**${e.kind.replace(/_/g, ' ')}** ${code(e.alias)}`];
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

/** The structural names each statement takes besides its fields (`parser/build.ts`). */
const RELATION_NAMES = new Set(['type', 'from', 'to', 'wrap']);
const ELEMENT_NAMES = new Set(['alias', 'parentBoundary', 'typeC4Shape', 'nodeType', 'wrap']);

/** Whether `node` reads a `$name`: sets a field or the structure with it. */
function reads(node: C4StatementNode, name: string): boolean {
  const relation =
    node.type === 'Relation' || (node.type === 'Style' && node.macro === 'UpdateRelStyle');
  if (relation) return RELATION_FIELDS.has(name) || OFFSETS.has(name) || RELATION_NAMES.has(name);
  return ELEMENT_FIELDS.has(name) || ELEMENT_NAMES.has(name);
}

/** The doc of the `$name` in argument `k` of `node`. */
function nameDoc(node: C4StatementNode, name: string, k: number, slots: readonly Slot[]): string {
  // By position: the name changes nothing.
  if (node.macro === 'UpdateLayoutConfig') return SLOT_DOCS[slots[k]?.name ?? ''] ?? IGNORED;
  if (!reads(node, name)) return `Not a name ${code(node.macro)} reads: kept, not drawn.`;
  if (node.type === 'Relation' && name === 'type') return RELATION_TYPE_DOC;
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
  const node = statementAt(doc.result.ast.children, at.offset);
  if (!node) return undefined;
  const k = node.args.findIndex((a) => a.range.start <= at.offset && at.offset <= a.range.end);
  const arg = node.args[k];
  const kind = KEYWORDS.get(node.macro);
  const slots = kind === undefined ? undefined : SLOTS.get(kind);
  if (!arg || !slots) return undefined;
  const model = doc.result.model as C4Model;
  const where = `Argument ${k + 1} of ${code(node.macro)}`;
  const range = span(arg.range.start, arg.range.end);
  if (arg.name !== undefined) {
    const what = nameDoc(node, arg.name, k, slots);
    return { range, contents: `**${code(`$${arg.name}`)}**\n\n${where}. ${what}`.trim() };
  }
  const slot = slots[k];
  if (!slot) {
    const takes = plural(slots.length, 'argument');
    return { range, contents: `${where}: it takes ${takes}. ${IGNORED}` };
  }
  const lines = [`**${code(slot.name)}**`, `${where}. ${SLOT_DOCS[slot.name] ?? ''}`.trim()];
  if (slot.role !== 'text' && arg.value !== '') {
    // A boundary's own alias names the boundary; a reference looks for an element first.
    lines.push(aliasFacts(model, arg.value, slot.role === 'alias' && node.type === 'Boundary'));
  }
  return { range, contents: lines.join('\n\n') };
}
