/**
 * Flowchart language facet (`@mermaid-js/diagram-flowchart/language`, DESIGN §4.5, R-LANG-8,
 * D89): the parser entry and the tables the language service needs. Nothing reachable from
 * here imports the renderer (`render/`), the plugin or the ASCII renderer; the import-boundary
 * lint and the bench's language bundle spec hold that in place.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { flowchartCompletions } from './facet/completions.ts';
import { flowchartHover } from './facet/hover.ts';
import { flowchartCategories } from './generated/categories.ts';
import { flowchartTokens, parseFlowchart } from './parser/index.ts';
import type { FlowDocument } from './parser/index.ts';
import { T } from './parser/tokens.ts';
import { flowIdCheck } from '@mermaid-js/shared/parser/flow-facet';

export { flowchartCategories } from './generated/categories.ts';
export { flowchartDocs } from './generated/docs.ts';
export { detectFlowchart, flowchartTokens, FlowTokenKind, parseFlowchart } from './parser/index.ts';
export type * from './parser/index.ts';

const HEADER = 'flowchart TD\n';
const LINKS = new Set<number>([T.Link, T.StartLink]);
const KEYWORDS = new Set<number>([
  T.End,
  T.Subgraph,
  T.Graph,
  T.Style,
  T.LinkStyle,
  T.ClassDef,
  T.Class,
  T.Click,
  T.AccTitle,
  T.AccDescr,
  T.Dir,
]);

/**
 * Why `name` cannot be a flowchart node or subgraph id, class name or edge id, or `undefined`
 * when it can.
 */
const invalidReason = flowIdCheck({
  header: HEADER,
  tokens: flowchartTokens,
  parse: parseFlowchart,
  links: LINKS,
  keywords: KEYWORDS,
});

/** The flowchart facet. */
export const flowchartLanguage: LanguageFacet<FlowDocument> = {
  id: 'flowchart',
  parse: (text, options) => parseFlowchart(text, options),
  categories: flowchartCategories,
  namespaces: [['node', 'subgraph'], ['class'], ['edge']],
  isValidId: invalidReason,
  completions: flowchartCompletions,
  hover: flowchartHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { flowchartLanguage as language };
