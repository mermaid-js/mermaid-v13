/**
 * Venn hover (DESIGN §4.5, D93):
 * - a set id (in `set`, `union`, `text` or `style`): the set, its label and size as the diagram
 *   draws it (the last `set` of the id counts, D417; `10` when not written), and the overlaps it
 *   is in, each with its size; an id no `set` declares says so;
 * - a text node id: the area it sits in and its label;
 * - a style key: what it does (`facet/tables.ts`);
 * - any keyword: the one-line doc of the grammar file (`generated/docs.ts`).
 * Never a preview.
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { vennDocs } from '../generated/docs.ts';
import { idsKey, setIdOf, type VennModel } from '../model.ts';
import type { VennDocument } from '../parser/ast.ts';
import { idText, listOf } from '../parser/text.ts';
import { T } from '../parser/tokens.ts';
import { code, setsByName, span, STYLE_KEYS } from './tables.ts';
import { inside } from '@mermaid-js/shared/parser/facet';

/** Kinds whose doc is for the keyword at their start only: a title holds its text too. */
const VALUE_WORDS: Readonly<Partial<Record<number, string>>> = { [T.Title]: 'title' };

/** An overlap as written: `union A,B`. */
const union = (sets: readonly string[]) => code(`union ${sets.map(idText).join(',')}`);

/** A size as the model holds it, shortened (`10 / 9` is 1.111…). */
const size = (n: number) => String(Number.isInteger(n) ? n : Number(n.toPrecision(4)));

function setHover(model: VennModel, ast: VennDocument, name: string): string {
  const own = model.subsets.filter((s) => setIdOf(s) === name);
  const last = own[own.length - 1];
  const parts: string[] = [];
  if (!last) {
    parts.push(
      `**${code(name)}** set`,
      `Not declared: no \`set ${idText(name)}\` statement, so nothing naming it is drawn.`
    );
  } else {
    parts.push(
      last.label === undefined ? `**${code(name)}** set` : `**${code(name)}** set · ${last.label}`
    );
    const node = setsByName(ast).get(name)?.at(-1);
    const notes: string[] = [];
    if (node?.size === undefined) notes.push('the default');
    if (own.length > 1) notes.push(`declared ${own.length} times; the last size counts`);
    parts.push(`Size ${size(last.size)}${notes.length > 0 ? ` (${notes.join('; ')})` : ''}.`);
  }
  const overlaps = model.subsets.filter((s) => setIdOf(s) === undefined && s.sets.includes(name));
  if (overlaps.length > 0) {
    const seen = new Set<string>();
    const listed: string[] = [];
    for (const s of overlaps) {
      const key = idsKey(s.sets);
      if (seen.has(key)) continue;
      seen.add(key);
      listed.push(`${union(s.sets)} (size ${size(s.size)})`);
    }
    parts.push(`In ${listOf(listed)}.`);
  }
  return parts.join('\n\n');
}

function textHover(model: VennModel, name: string): string {
  const head = `**${code(name)}** text node`;
  const first = model.textNodes.find((t) => t.id === name);
  if (!first) return head;
  const set = setIdOf(first);
  const where =
    set === undefined ? `In the overlap ${union(first.sets)}` : `In the set ${code(set)}`;
  const label = first.label === undefined ? '' : `, labelled ${first.label}`;
  return `${head}\n\n${where}${label}.`;
}

export function vennHover(at: HoverTarget, doc: DocumentView<VennDocument>): Hover | undefined {
  const { text } = doc;
  const model = doc.result.model as VennModel;
  const sym = at.symbol;
  if (sym && inside(at.offset, sym.range)) {
    if (sym.kind === 'set')
      return { range: sym.range, contents: setHover(model, doc.result.ast, sym.name) };
    if (sym.kind === 'text') return { range: sym.range, contents: textHover(model, sym.name) };
  }
  const t = at.token;
  if (!t) return undefined;
  if (t.kind === T.Identifier) {
    // A style key: the identifier before a field's `:`.
    for (const n of doc.result.ast.children) {
      if (n.type !== 'Style' || !inside(t.range.start, n.range)) continue;
      const field = n.fields.find((f) => f.keyRange.start === t.range.start);
      const entry = field && STYLE_KEYS.find(([key]) => key === field.key);
      if (field && entry)
        return { range: field.keyRange, contents: `**${code(field.key)}**\n\n${entry[1]}` };
    }
    return undefined;
  }
  let range = t.range;
  const word = VALUE_WORDS[t.kind];
  if (word !== undefined) range = span(range.start, range.start + word.length);
  if (!inside(at.offset, range)) return undefined;
  const docText = vennDocs[t.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
