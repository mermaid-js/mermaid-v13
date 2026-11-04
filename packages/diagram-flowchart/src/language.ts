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
 * Why `name` cannot be a flowchart node or subgraph id, or `undefined` when it can: the
 * parser must read `name` alone on a line as one node whose id is exactly `name`.
 */
function invalidIdReason(name: string): string | undefined {
  const shape = shapeReason(name);
  if (shape) return shape;
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

/** Blank, line-break and space checks every kind of id shares. */
function shapeReason(name: string): string | undefined {
  if (name === '') return 'An id cannot be empty.';
  if (/[\r\n]/.test(name)) return 'An id cannot contain a line break.';
  if (/\s/.test(name)) return 'An id cannot contain spaces.';
  return undefined;
}

/**
 * Whether `name` reads back as exactly one `kind` symbol named `name` at `at` when written
 * into `text` (a one-statement probe document).
 */
function readsBack(text: string, at: number, name: string, kind: string): boolean {
  const { diagnostics, symbols } = parseFlowchart(text);
  const hits = symbols.filter((s) => s.kind === kind);
  return (
    !diagnostics.some((d) => d.severity === 'error') &&
    hits.length === 1 &&
    hits[0]!.name === name &&
    hits[0]!.range.start === at &&
    hits[0]!.range.end === at + name.length
  );
}

/** Why `name` cannot be a symbol of `kind` (`node`/`subgraph`, `class`, `edge`), if it cannot. */
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
