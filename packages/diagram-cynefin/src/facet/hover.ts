/**
 * Cynefin hover (DESIGN §4.5, D93): a domain name, in a block or at either end of a transition,
 * shows what the domain means (v12's syntax page), the decision model and practice v12 drew
 * under it (`domains.ts`) and the domain's keyword doc, and says when its block is replaced by a later one (D364); any other keyword the
 * one-line doc of the grammar file (`generated/docs.ts`). Items and labels have none. Never a
 * preview.
 */
import { LineIndex } from '@mermaid-js/core/parser-kit';
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { cynefinDocs } from '../generated/docs.ts';
import { CYNEFIN_DOMAIN_NAMES } from '../model.ts';
import type { CynefinDocument, CynefinDomainNode } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { code, DOMAIN_MEANING, domainLine, span } from './tables.ts';
import { inside } from '@mermaid-js/core/parser-kit/facet';
import { keywordHover } from '@mermaid-js/core/parser-kit/facet';

/** Statement tokens that hold their text too: only the keyword is hovered. */
const VALUE_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

/** Kinds whose doc is for completion only: an item's quote and a transition's `:`. */
const NO_HOVER = new Set<number>([T.String, T.Colon]);

/** When the block named at `range` is not its domain's last, which line the drawn one is on. */
function replacedBy(doc: DocumentView<CynefinDocument>, range: Range, name: string) {
  const blocks = doc.result.ast.children.filter(
    (n): n is CynefinDomainNode => n.type === 'Domain' && n.name === name
  );
  const last = blocks[blocks.length - 1];
  if (!last || !blocks.some((b) => b !== last && b.nameRange.start === range.start)) return;
  return new LineIndex(doc.text).position(last.nameRange.start).line + 1;
}

function domainHover(doc: DocumentView<CynefinDocument>, range: Range): Hover | undefined {
  const name = CYNEFIN_DOMAIN_NAMES.find((n) => n === doc.text.slice(range.start, range.end));
  if (name === undefined) return undefined;
  const parts = [`**${code(name)}** domain`, DOMAIN_MEANING[name], domainLine(name)];
  const docText = cynefinDocs[T.DomainName];
  if (docText !== undefined) parts.push(docText);
  const line = replacedBy(doc, range, name);
  if (line !== undefined)
    parts.push(`Replaced: only the last ${code(name)} block (line ${line}) is drawn.`);
  return { range, contents: parts.join('\n\n') };
}

export function cynefinHover(
  at: HoverTarget,
  doc: DocumentView<CynefinDocument>
): Hover | undefined {
  const { text } = doc;
  const t = at.token;
  if (at.symbol?.kind === 'domain' && inside(at.offset, at.symbol.range))
    return domainHover(doc, at.symbol.range);
  if (!t) return undefined;
  if (t.kind === T.DomainName) return domainHover(doc, t.range);
  const docText = NO_HOVER.has(t.kind) ? undefined : cynefinDocs[t.kind];
  return keywordHover(text, at.offset, t.range, VALUE_WORDS[t.kind], docText);
}
