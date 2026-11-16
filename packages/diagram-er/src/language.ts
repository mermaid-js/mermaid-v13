/**
 * ER language facet (`@mermaid-js/diagram-er/language`, DESIGN §4.5, R-LANG-8, D89): the parser
 * entry and the tables the language service needs. Nothing reachable from here imports a
 * renderer, layout or plugin code; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { erCompletions } from './facet/completions.ts';
import { erHover } from './facet/hover.ts';
import { erCategories } from './generated/categories.ts';
import { parseEr } from './parser/index.ts';
import type { ErDocument } from './parser/index.ts';
import { entityReason, HEADER, readsBack, shapeReason } from './facet/names.ts';

export { erCategories } from './generated/categories.ts';
export { erDocs } from './generated/docs.ts';
export { detectEr, parseEr } from './parser/index.ts';
export { erTokens } from './parser/tokens-api.ts';
export { T as ErTokenKind } from './parser/tokens.ts';
export type * from './parser/index.ts';

/** Why `name` cannot be a symbol of `kind` (`entity`/`subgraph`, `class`), if it cannot. */
function invalidReason(name: string, kind = 'entity'): string | undefined {
  if (kind === 'class') {
    const at = HEADER.length + 'classDef '.length;
    const text = `${HEADER}classDef ${name} fill:#000\n`;
    return (
      shapeReason(name, 'A name') ??
      (readsBack(parseEr(text), at, name, 'class') ? undefined : `'${name}' is not a class name.`)
    );
  }
  return entityReason(name);
}

/** The ER facet. */
export const erLanguage: LanguageFacet<ErDocument> = {
  id: 'er',
  parse: (text, options) => parseEr(text, options),
  categories: erCategories,
  namespaces: [['entity', 'subgraph'], ['class']],
  isValidId: invalidReason,
  completions: erCompletions,
  hover: erHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { erLanguage as language };
