/**
 * Flowchart language facet (`@mermaid-js/diagram-flowchart/language`, DESIGN §4.5, R-LANG-8,
 * D89): the parser entry and the tables the language service needs. Nothing reachable from
 * here imports the renderer (`render/`), the plugin or the ASCII renderer; the import-boundary
 * lint and the bench's language bundle spec hold that in place.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { flowchartCategories } from './generated/categories.ts';
import { flowchartTokens, parseFlowchart } from './parser/index.ts';
import type { FlowDocument } from './parser/index.ts';
import { T } from './parser/tokens.ts';

export { flowchartCategories } from './generated/categories.ts';
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
 * Why `name` cannot be a flowchart node or subgraph id, or `undefined` when it can: the
 * parser must read `name` alone on a line as one node whose id is exactly `name`.
 */
function invalidIdReason(name: string): string | undefined {
  if (name === '') return 'An id cannot be empty.';
  if (/[\r\n]/.test(name)) return 'An id cannot contain a line break.';
  if (/\s/.test(name)) return 'An id cannot contain spaces.';
  const text = `${HEADER}${name}\n`;
  // Tokens that start inside the name (`end` takes its line break with it).
  const tokens = flowchartTokens(text).filter(
    (t) => t.range.start >= HEADER.length && t.range.start < HEADER.length + name.length
  );
  if (tokens.some((t) => LINKS.has(t.kind))) return `'${name}' contains an arrow.`;
  if (tokens.length === 1 && KEYWORDS.has(tokens[0]!.kind)) {
    return `'${name}' is a keyword.`;
  }
  const { diagnostics, symbols } = parseFlowchart(text);
  const ok =
    !diagnostics.some((d) => d.severity === 'error') &&
    symbols.length === 1 &&
    symbols[0]!.kind === 'node' &&
    symbols[0]!.name === name &&
    symbols[0]!.range.start === HEADER.length &&
    symbols[0]!.range.end === HEADER.length + name.length;
  return ok ? undefined : `'${name}' is not a node id.`;
}

/** The flowchart facet; `completions` and `hover` come with the completion/hover ticket. */
export const flowchartLanguage: LanguageFacet<FlowDocument> = {
  id: 'flowchart',
  parse: (text, options) => parseFlowchart(text, options),
  categories: flowchartCategories,
  namespaces: [['node', 'subgraph'], ['class'], ['edge']],
  isValidId: invalidIdReason,
};
