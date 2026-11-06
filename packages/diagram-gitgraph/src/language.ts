/**
 * gitGraph language facet (`@mermaid-js/diagram-gitgraph/language`, DESIGN §4.5, R-LANG-8,
 * D89): the parser entry and the tables the language service needs. Nothing reachable from
 * here imports the layout or a renderer; the import-boundary lint and the bench's language
 * bundle spec hold that in place.
 *
 * Symbols (spec #292): branch names (defined at `branch`, referenced at `checkout`, `switch`
 * and `merge`) and commit ids (defined at a commit's or merge's `id:`, referenced at a
 * cherry-pick's `id:` and `parent:`), in separate namespaces. A quoted name keeps its quotes on
 * rename (D191). The main branch is no symbol: its name lives in config (`mainBranchName`), so
 * it is neither renamed nor offered as a rename target's clash; the facet reads that name from
 * the document's front matter and `init` directives, as the plugin gets it from the config.
 * Folding is the parser's statement spans: a multi-line `accDescr { … }`.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { gitGraphCompletions } from './facet/completions.ts';
import { gitGraphHover } from './facet/hover.ts';
import { invalidReason, parseDocument } from './facet/names.ts';
import { gitgraphCategories } from './generated/categories.ts';
import type { GitGraphDocument } from './parser/index.ts';

export { gitgraphCategories } from './generated/categories.ts';
export { gitgraphDocs } from './generated/docs.ts';
export {
  detectGitGraph,
  GITGRAPH_TRIVIA,
  GitGraphTokenKind,
  gitGraphTokens,
  parseGitGraph,
} from './parser/index.ts';
export type * from './parser/index.ts';
export { documentGitConfig } from './facet/names.ts';

/** The gitGraph facet. */
export const gitGraphLanguage: LanguageFacet<GitGraphDocument> = {
  id: 'gitGraph',
  parse: parseDocument,
  categories: gitgraphCategories,
  namespaces: [['branch'], ['commit']],
  isValidId: invalidReason,
  completions: gitGraphCompletions,
  hover: gitGraphHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { gitGraphLanguage as language };
