/**
 * Ishikawa language facet (`@mermaid-js/diagram-ishikawa/language`, DESIGN §4.5, R-LANG-8,
 * D89): the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the layout or the renderer; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 *
 * Symbols (D497): each cause is a `cause` symbol, its own definition with no references, so it
 * is `standalone` (labels repeat: two causes `Cost` are two symbols), and a rename changes that
 * label only; it refuses a line break or a leading keyword (`isValidId`). The effect is no
 * symbol. Each cause folds with its subtree: the parser nests a cause's statement span in its
 * parent's. Diagnostics: a line that starts with the keyword is an error (mermaid\@12 rejects
 * it); each cause the baseline clamp makes top-level gets an `info` `ISHIKAWA_INDENT_CLAMPED`
 * (where a render warns once, D496).
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { ishikawaCompletions } from './facet/completions.ts';
import { ishikawaHover } from './facet/hover.ts';
import { invalidReason } from './facet/names.ts';
import { ishikawaCategories } from './generated/categories.ts';
import { parseIshikawa } from './parser/index.ts';
import type { IshikawaDocument } from './parser/index.ts';

export { ishikawaCategories } from './generated/categories.ts';
export { ishikawaDocs } from './generated/docs.ts';
export {
  detectIshikawa,
  IshikawaTokenKind,
  ishikawaTokens,
  parseIshikawa,
} from './parser/index.ts';
export type * from './parser/index.ts';

/** The ishikawa facet. */
export const ishikawaLanguage: LanguageFacet<IshikawaDocument> = {
  id: 'ishikawa',
  parse: (text, options) => parseIshikawa(text, { ...options, clampInfo: true }),
  categories: ishikawaCategories,
  namespaces: [['cause']],
  standalone: ['cause'],
  isValidId: invalidReason,
  completions: ishikawaCompletions,
  hover: ishikawaHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { ishikawaLanguage as language };
