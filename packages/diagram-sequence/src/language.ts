/**
 * Sequence language facet (`@mermaid-js/diagram-sequence/language`, DESIGN §4.5, R-LANG-8,
 * D89): the parser entry and the tables the language service needs. Nothing reachable from
 * here imports the layout or a renderer; the import-boundary lint and the bench's language
 * bundle spec hold that in place.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { sequenceCompletions } from './facet/completions.ts';
import { sequenceHover } from './facet/hover.ts';
import { sequenceCategories } from './generated/categories.ts';
import { parseSequence } from './parser/index.ts';
import type { SequenceDocument } from './parser/index.ts';

export { sequenceCategories } from './generated/categories.ts';
export { sequenceDocs } from './generated/docs.ts';
export {
  detectSequence,
  parseSequence,
  SequenceTokenKind,
  sequenceTokens,
} from './parser/index.ts';
export type * from './parser/index.ts';

const HEADER = 'sequenceDiagram\n';

/**
 * Where a participant id is written; `@` stands for it. A name is an id only when every one
 * of them reads it back as that participant, so a rename keeps every mention.
 */
const PARTICIPANT_LINES = [
  'participant @',
  'actor @ as x',
  '@->>Z: x',
  'Z->>@: x',
  'Z->>+@: x',
  'note over @: x',
  'note over Z,@: x',
  'activate @',
  'links @: {}',
];

/** Blank, line-break and space checks. */
function shapeReason(name: string): string | undefined {
  if (name === '') return 'An id cannot be empty.';
  if (/[\r\n]/.test(name)) return 'An id cannot contain a line break.';
  if (name !== name.trim()) return 'An id cannot start or end with a space.';
  return undefined;
}

/**
 * Whether `name`, written for `@` in the one-statement `line`, reads back as exactly one
 * participant symbol named `name` at that spot, with no error.
 */
function readsBack(line: string, name: string): boolean {
  const at = HEADER.length + line.indexOf('@');
  const { diagnostics, symbols } = parseSequence(`${HEADER}${line.replace('@', () => name)}\n`);
  const hits = symbols.filter((s) => s.kind === 'participant' && s.range.start === at);
  return (
    !diagnostics.some((d) => d.severity === 'error') &&
    hits.length === 1 &&
    hits[0]!.name === name &&
    hits[0]!.range.end === at + name.length
  );
}

/** Why `name` cannot be a participant id, if it cannot. */
function invalidReason(name: string): string | undefined {
  const shape = shapeReason(name);
  if (shape) return shape;
  return PARTICIPANT_LINES.every((l) => readsBack(l, name))
    ? undefined
    : `'${name}' is not a participant id.`;
}

/** The sequence facet. */
export const sequenceLanguage: LanguageFacet<SequenceDocument> = {
  id: 'sequence',
  parse: (text, options) => parseSequence(text, options),
  categories: sequenceCategories,
  namespaces: [['participant']],
  isValidId: invalidReason,
  completions: sequenceCompletions,
  hover: sequenceHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { sequenceLanguage as language };
