/**
 * Mindmap language facet (`@mermaid-js/diagram-mindmap/language`, DESIGN §4.5, R-LANG-8, D89):
 * the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the layout or a renderer; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 *
 * Symbols (D289): each node id is a definition with no references, so it is `standalone`
 * (ids repeat: two nodes `a` are two symbols), and a rename changes that id only. The words of
 * `:::` lines are `class` names, one namespace, and rename together. Each node folds with its
 * subtree: the parser nests a node's statement span in its parent's.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { mindmapCompletions } from './facet/completions.ts';
import { mindmapHover } from './facet/hover.ts';
import { mindmapCategories } from './generated/categories.ts';
import { mindmapTokens, parseMindmap } from './parser/index.ts';
import type { MindmapDocument } from './parser/index.ts';
import { T } from './parser/tokens.ts';

export { mindmapCategories } from './generated/categories.ts';
export { mindmapDocs } from './generated/docs.ts';
export { detectMindmap, MindmapTokenKind, mindmapTokens, parseMindmap } from './parser/index.ts';
export type * from './parser/index.ts';

const LINE_BREAK = /[\n\r\u2028\u2029]/;
/** The blanks the model splits a `:::` line at (HTML class-attribute words). */
const CLASS_BLANK = /[\t\n\f\r ]/;
/** What ends a node id: a shape opener or closer (`]` is part of an id, as in v12). */
const DELIMITERS = /[()[{}]/;

/** Whether `name`, written as a node id under a root, lexes as exactly that id. */
function readsAsId(name: string): boolean {
  const text = `mindmap\n  root\n    ${name}[x]`;
  const at = text.length - name.length - 3;
  const t = mindmapTokens(text).find((x) => x.range.start === at);
  return t?.kind === T.NodeId && t.range.end === at + name.length && t.text === name;
}

/** Why `name` cannot be a `kind` name (a node id when omitted), if it cannot. */
function invalidReason(name: string, kind = 'node'): string | undefined {
  if (kind === 'class') {
    if (name === '') return 'A class name cannot be empty.';
    if (CLASS_BLANK.test(name) || LINE_BREAK.test(name))
      return 'A class name cannot hold blanks or line breaks: `:::a b` is two classes.';
    return undefined;
  }
  if (kind !== 'node') return `'${kind}' is not a mindmap symbol kind.`;
  if (name.trim() === '') return 'A node id cannot be empty.';
  if (LINE_BREAK.test(name)) return 'A node id cannot hold a line break.';
  if (name !== name.trim())
    return 'A node id cannot start or end with a blank: the indent before it sets the nesting.';
  if (DELIMITERS.test(name))
    return 'A node id cannot hold `(`, `)`, `[`, `{` or `}`: they write the shape.';
  return readsAsId(name) ? undefined : `'${name}' would not read as a node id.`;
}

/** The mindmap facet. */
export const mindmapLanguage: LanguageFacet<MindmapDocument> = {
  id: 'mindmap',
  parse: (text, options) => parseMindmap(text, options),
  categories: mindmapCategories,
  namespaces: [['node'], ['class']],
  standalone: ['node'],
  isValidId: invalidReason,
  completions: mindmapCompletions,
  hover: mindmapHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { mindmapLanguage as language };
