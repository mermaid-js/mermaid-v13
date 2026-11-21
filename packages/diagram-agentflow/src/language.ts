/**
 * Agentflow language facet (`@mermaid-js/diagram-agentflow/language`, DESIGN §4.5, R-LANG-8,
 * D89): the parser entry and the tables the language service needs, on the flow family's facet
 * (`@mermaid-js/shared/parser/flow-facet`), which agentflow shares with flowchart (D595).
 * Nothing reachable from here imports the layout, the renderer, the theme table or the plugin;
 * the import-boundary lint and the bench's language bundle spec hold that in place
 * (`languageBundle` in `workspace.yaml`).
 *
 * Symbols (D468): vertex, connector and flow ids share one name space (`node` and `subgraph`,
 * as flowchart groups them), class names are `class` symbols and edge ids `edge` symbols.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { agentflowCompletions } from './facet/completions.ts';
import { agentflowHover } from './facet/hover.ts';
import { agentflowCategories } from './generated/categories.ts';
import { agentflowTokens, parseAgentflow, RESERVED_ID } from './parser/index.ts';
import type { AgentflowDocument } from './parser/index.ts';
import { T } from './parser/tokens.ts';
import { flowIdCheck } from '@mermaid-js/shared/parser/flow-facet';

export { agentflowCategories } from './generated/categories.ts';
export { agentflowDocs } from './generated/docs.ts';
export {
  agentflowTokens,
  AgentflowTokenKind,
  detectAgentflow,
  parseAgentflow,
} from './parser/index.ts';
export type * from './parser/index.ts';

const HEADER = 'agentflow-beta TD\n';
const LINKS = new Set<number>([T.Link, T.StartLink]);
const KEYWORDS = new Set<number>([
  T.End,
  T.Flow,
  T.Connector,
  T.Global,
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
 * Why `name` cannot be an agentflow node, connector or flow id, class name or edge id, or
 * `undefined` when it can. A flow id is checked as a node id: edges and `style` name it as one.
 */
const invalidReason = flowIdCheck({
  header: HEADER,
  tokens: agentflowTokens,
  parse: parseAgentflow,
  links: LINKS,
  keywords: KEYWORDS,
  reserved: (name) =>
    name === RESERVED_ID
      ? `'${RESERVED_ID}' is reserved: agentflow keeps it for its connectors and draws no node for it.`
      : undefined,
});

/** The agentflow facet. */
export const agentflowLanguage: LanguageFacet<AgentflowDocument> = {
  id: 'agentflow',
  parse: (text, options) => parseAgentflow(text, options),
  categories: agentflowCategories,
  namespaces: [['node', 'subgraph'], ['class'], ['edge']],
  isValidId: invalidReason,
  completions: agentflowCompletions,
  hover: agentflowHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { agentflowLanguage as language };
