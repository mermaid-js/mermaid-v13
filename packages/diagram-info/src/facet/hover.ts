/**
 * Info hover (DESIGN §4.5, D93): a keyword shows the one-line doc of the grammar file
 * (`generated/docs.ts`). For `title`, `accTitle` and `accDescr` only the keyword is hovered,
 * not the text after it. Never a preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { keywordHover } from '@mermaid-js/shared/parser/facet';
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
  return t
    ? keywordHover(doc.text, at.offset, t.range, VALUE_WORDS[t.kind], infoDocs[t.kind])
    : undefined;
}
