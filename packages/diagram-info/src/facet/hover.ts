/**
 * Info hover (DESIGN §4.5, D93): a keyword shows the one-line doc of the grammar file
 * (`generated/docs.ts`). For `title`, `accTitle` and `accDescr` only the keyword is hovered,
 * not the text after it. Never a preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { infoDocs } from '../generated/docs.ts';
import type { InfoDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';

/** Statement tokens that hold their text too: only the keyword is hovered. */
const VALUE_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

export function infoHover(at: HoverTarget, doc: DocumentView<InfoDocument>): Hover | undefined {
  const t = at.token;
  if (!t) return undefined;
  const docText = infoDocs[t.kind];
  if (docText === undefined) return undefined;
  let range = t.range;
  const word = VALUE_WORDS[t.kind];
  if (word !== undefined) {
    const blanks = /^[\t ]*/.exec(doc.text.slice(range.start, range.end))?.[0].length ?? 0;
    range = { start: range.start + blanks, end: range.start + blanks + word.length };
  }
  if (at.offset < range.start || at.offset > range.end) return undefined;
  return { range, contents: `**\`${doc.text.slice(range.start, range.end)}\`**\n\n${docText}` };
}
