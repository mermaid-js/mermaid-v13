/**
 * State language facet (`@mermaid-js/diagram-state/language`, DESIGN §4.5, R-LANG-8, D89):
 * the parser entry and the tables the language service needs. Nothing reachable from here
 * imports a renderer, layout or the plugin; the import-boundary lint holds that in place.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { stateCompletions } from './facet/completions.ts';
import { stateHover } from './facet/hover.ts';
import { stateCategories } from './generated/categories.ts';
import { parseState } from './parser/index.ts';
import type { StateDocument, StateParseResult } from './parser/index.ts';

export { stateCategories } from './generated/categories.ts';
export { stateDocs } from './generated/docs.ts';
export { detectState, parseState, stateTokens, StateTokenKind } from './parser/index.ts';
export type * from './parser/index.ts';

const HEADER = 'stateDiagram-v2\n';

/** Blank, line-break and space checks every kind of id shares. */
function shapeReason(name: string): string | undefined {
  if (name === '') return 'An id cannot be empty.';
  if (/[\r\n]/.test(name)) return 'An id cannot contain a line break.';
  if (/\s/.test(name)) return 'An id cannot contain spaces.';
  return undefined;
}

/**
 * Whether `name`, written for `@` in the one-statement `line`, reads back as exactly one
 * `kind` symbol named `name` at that spot, with no error.
 */
function readsBack(line: string, name: string, kind: string): boolean {
  const at = HEADER.length + line.indexOf('@');
  const { diagnostics, symbols } = parseState(`${HEADER}${line.replace('@', () => name)}\n`);
  const hits = symbols.filter((s) => s.kind === kind && s.range.start === at);
  return (
    !diagnostics.some((d) => d.severity === 'error') &&
    hits.length === 1 &&
    hits[0]!.name === name &&
    hits[0]!.range.end === at + name.length
  );
}

/** Where a state id is written, apart from `class` and `style` statements. */
const STATE_LINES = [
  '@',
  '@ --> Z',
  'Z --> @',
  '@ : text',
  '@:::c',
  'state @ {\n}',
  'state "text" as @',
  'note left of @ : text',
];
/** `class` and `style` statements, which read ids as v12's `[\w,]+` does. */
const ID_LIST_LINES = ['class @ c', 'style @ fill:#f00'];
const CLASS_LINES = ['classDef @ fill:#000', 'class Z @', 'Z:::@'];

/** Why `name` cannot be a symbol of `kind` (`state`, the default, or `class`), if it cannot. */
function invalidReason(name: string, kind = 'state'): string | undefined {
  const shape = shapeReason(name);
  if (shape) return shape;
  if (kind === 'class') {
    return CLASS_LINES.every((l) => readsBack(l, name, 'class'))
      ? undefined
      : `'${name}' is not a class name.`;
  }
  if (!STATE_LINES.every((l) => readsBack(l, name, 'state'))) return `'${name}' is not a state id.`;
  if (!ID_LIST_LINES.every((l) => readsBack(l, name, 'state'))) {
    return `'${name}' cannot be named in \`class\` or \`style\` statements (letters, digits and \`_\` only).`;
  }
  return undefined;
}

/**
 * The parse with its diagnostics in source order, as the service's contract asks: the parser
 * adds `STATE_NOT_DRAWN` once the whole text is read. The sort is stable.
 */
function inSourceOrder(r: StateParseResult): StateParseResult {
  const d = r.diagnostics;
  if (d.every((x, i) => i === 0 || d[i - 1]!.range.start <= x.range.start)) return r;
  return { ...r, diagnostics: [...d].sort((a, b) => a.range.start - b.range.start) };
}

/** The state facet. */
export const stateLanguage: LanguageFacet<StateDocument> = {
  id: 'state',
  parse: (text, options) => inSourceOrder(parseState(text, options)),
  categories: stateCategories,
  namespaces: [['state'], ['class']],
  isValidId: invalidReason,
  completions: stateCompletions,
  hover: stateHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { stateLanguage as language };
