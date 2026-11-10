/**
 * Agentflow language facet (`@mermaid-js/diagram-agentflow/language`, DESIGN §4.5, R-LANG-8,
 * D89): the parser entry and the tables the language service needs, written from a copy of
 * flowchart's facet (D467). Nothing reachable from here imports the layout, the renderer, the
 * theme table or the plugin; the import-boundary lint and the bench's language bundle spec hold
 * that in place (`languageBundle` in `workspace.yaml`).
 *
 * Symbols (D468): vertex, connector and flow ids share one name space (`node` and `subgraph`,
 * as flowchart groups them), class names are `class` symbols and edge ids `edge` symbols.
 */
import type { FacetParseOptions, LanguageFacet } from '@mermaid-js/core/parser-kit';
import { agentflowCompletions } from './facet/completions.ts';
import { agentflowHover } from './facet/hover.ts';
import { agentflowCategories } from './generated/categories.ts';
import { agentflowTokens, parseAgentflow } from './parser/index.ts';
import type { AgentflowDocument, AgentflowParseResult } from './parser/index.ts';
import { T } from './parser/tokens.ts';

export { agentflowCategories } from './generated/categories.ts';
export { agentflowDocs } from './generated/docs.ts';
export {
  AGENTFLOW_DETECT,
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

/** The id v12 reserves for its connectors pseudo-flow: it makes no node (D464). */
const RESERVED = 'connectors';

/**
 * Why `name` cannot be an agentflow node, connector or flow id, or `undefined` when it can:
 * the parser must read `name` alone on a line as one node whose id is exactly `name`.
 */
function invalidIdReason(name: string): string | undefined {
  const shape = shapeReason(name);
  if (shape) return shape;
  if (name === RESERVED) {
    return "'connectors' is reserved: agentflow keeps it for its connectors and draws no node for it.";
  }
  const text = `${HEADER}${name}\n`;
  // Tokens that start inside the name (`end` takes its line break with it).
  const tokens = agentflowTokens(text).filter(
    (t) => t.range.start >= HEADER.length && t.range.start < HEADER.length + name.length
  );
  if (tokens.some((t) => LINKS.has(t.kind))) return `'${name}' contains an arrow.`;
  if (tokens.length === 1 && KEYWORDS.has(tokens[0]!.kind)) return `'${name}' is a keyword.`;
  return readsBack(text, HEADER.length, name, 'node') ? undefined : `'${name}' is not a node id.`;
}

/** Blank, line-break and space checks every kind of id shares. */
function shapeReason(name: string): string | undefined {
  if (name === '') return 'An id cannot be empty.';
  if (/[\r\n]/.test(name)) return 'An id cannot contain a line break.';
  if (/\s/.test(name)) return 'An id cannot contain spaces.';
  return undefined;
}

/**
 * Whether `name` reads back as exactly one `kind` symbol named `name` at `at` when written
 * into `text` (a one-statement probe document), with no error.
 */
function readsBack(text: string, at: number, name: string, kind: string): boolean {
  const { diagnostics, symbols } = parseAgentflow(text);
  const hits = symbols.filter((s) => s.kind === kind);
  return (
    !diagnostics.some((d) => d.severity === 'error') &&
    hits.length === 1 &&
    hits[0]!.name === name &&
    hits[0]!.range.start === at &&
    hits[0]!.range.end === at + name.length
  );
}

/**
 * Why `name` cannot be a symbol of `kind` (`node`/`subgraph`, `class`, `edge`), if it cannot.
 * A flow id is checked as a node id: edges and `style` name it as one.
 */
function invalidReason(name: string, kind = 'node'): string | undefined {
  if (kind === 'class') {
    const at = HEADER.length + 'classDef '.length;
    const text = `${HEADER}classDef ${name} fill:#000\n`;
    return (
      shapeReason(name) ??
      (readsBack(text, at, name, 'class') ? undefined : `'${name}' is not a class name.`)
    );
  }
  if (kind === 'edge') {
    const at = HEADER.length + 'A '.length;
    const text = `${HEADER}A ${name}@--> B\n`;
    return (
      shapeReason(name) ??
      (readsBack(text, at, name, 'edge') ? undefined : `'${name}' is not an edge id.`)
    );
  }
  return invalidIdReason(name);
}

/**
 * The parse the service reads: the parser's, less the mentions of the reserved `connectors` id
 * where it names nothing (no `connector connectors` or `flow connectors`). v12 makes no node of
 * it (`AGENTFLOW_RESERVED_ID`), so it is no symbol: renaming it would make a node.
 */
function parse(text: string, options: FacetParseOptions): AgentflowParseResult {
  const result = parseAgentflow(text, options);
  const { model } = result;
  const named =
    model.vertices.some((v) => v.id === RESERVED) || model.flows.some((f) => f.id === RESERVED);
  if (named || !result.symbols.some((s) => s.name === RESERVED)) return result;
  const symbols = result.symbols.filter(
    (s) => s.name !== RESERVED || (s.kind !== 'node' && s.kind !== 'subgraph')
  );
  return { ...result, symbols };
}

/** The agentflow facet. */
export const agentflowLanguage: LanguageFacet<AgentflowDocument> = {
  id: 'agentflow',
  parse,
  categories: agentflowCategories,
  namespaces: [['node', 'subgraph'], ['class'], ['edge']],
  isValidId: invalidReason,
  completions: agentflowCompletions,
  hover: agentflowHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { agentflowLanguage as language };
