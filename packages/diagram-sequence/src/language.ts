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
import { probeText, readsBackAt, shapeReason } from '@mermaid-js/shared/parser/facet';

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
 * of them reads it back as that participant, so a rename keeps every mention. `actor @ as x`
 * is not among them: the ID rule's `\s+as\s` lookahead only follows a run without blanks, so
 * `Alice Smith as x` is one id, as in v12, though `participant Alice Smith` is accepted. A
 * rename into an aliased declaration is still refused, by the service's read-back of the
 * renamed document.
 */
const PARTICIPANT_LINES = [
  'participant @',
  '@->>Z: x',
  'Z->>@: x',
  'Z->>+@: x',
  'note over @: x',
  'note over Z,@: x',
  'activate @',
  'links @: {}',
];

/** How many lines also name the other participant, `Z`. */
const ZS = PARTICIPANT_LINES.filter((l) => l.includes('Z')).length;

/**
 * Whether `name`, written for `@` in every line of {@link PARTICIPANT_LINES}, reads back as
 * exactly one participant symbol named `name` at each spot, with no error. One parse of all
 * the lines together (the rename bench's budget, R-LANG-4): every line starts in the lexer's
 * initial mode, so a line reads as it would alone.
 */
function readsBack(name: string): boolean {
  const { text, spots } = probeText(HEADER, PARTICIPANT_LINES, name);
  // Each line has one `@` and at most one `Z`, so nothing else may read as a participant.
  return readsBackAt(parseSequence(text), spots, name, 'participant', ZS);
}

/** Why `name` cannot be a participant id, if it cannot. */
function invalidReason(name: string): string | undefined {
  return (
    shapeReason(name, 'An id', 'ends') ??
    (readsBack(name) ? undefined : `'${name}' is not a participant id.`)
  );
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
