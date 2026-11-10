/**
 * User journey language facet (`@mermaid-js/diagram-journey/language`, DESIGN §4.5, R-LANG-8,
 * D89): the parser entry and the tables the language service needs. Nothing reachable from
 * here imports the layout or a renderer; the import-boundary lint and the bench's language
 * bundle spec hold that in place.
 *
 * Symbols: the parser's `actor` occurrences (one per mention, so a rename spans tasks) and,
 * added here, a `section` symbol per section line and a `task` symbol per task
 * (`facet/symbols.ts`). Each kind is its own name space. Folding: each section is a block from
 * its line to the next one's.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { journeyCompletions } from './facet/completions.ts';
import { journeyHover } from './facet/hover.ts';
import { forService } from './facet/symbols.ts';
import { journeyCategories } from './generated/categories.ts';
import { parseJourney } from './parser/index.ts';
import type { JourneyDocument, JourneyParseOptions, JourneyParseResult } from './parser/index.ts';
import { shapeReason } from '@mermaid-js/core/parser-kit';

export { journeyCategories } from './generated/categories.ts';
export { journeyDocs } from './generated/docs.ts';
export { detectJourney, JourneyTokenKind, journeyTokens, parseJourney } from './parser/index.ts';
export type * from './parser/index.ts';

/**
 * The parse the language service reads: {@link parseJourney} plus section and task symbols
 * and section blocks (`facet/symbols.ts`). Never throws.
 */
export function parseJourneyForService(
  text: string,
  options: JourneyParseOptions = {}
): JourneyParseResult {
  return forService(text, parseJourney(text, options));
}

/**
 * Where each kind of name is written; `@` stands for it. A name is valid for a kind when every
 * line reads it back as exactly that one symbol, with no error. `Z` and `Y` are other actors.
 */
const LINES: Readonly<Record<string, readonly string[]>> = {
  actor: ['x: 5: @', 'x: 5: Z, @, Y'],
  section: ['section @'],
  task: ['@: 5'],
};

/** What each kind is called in a refusal. */
const NOUNS: Readonly<Record<string, string>> = {
  actor: 'an actor name',
  section: 'a section name',
  task: 'a task name',
};

/** Whether `name`, written for `@` in each of `lines`, reads back as one `kind` symbol there. */
function readsBack(name: string, kind: string, lines: readonly string[]): boolean {
  let text = 'journey\n';
  const spots: number[] = [];
  for (const line of lines) {
    spots.push(text.length + line.indexOf('@'));
    text += `${line.replace('@', () => name)}\n`;
  }
  const { diagnostics, symbols } = parseJourneyForService(text);
  if (diagnostics.some((d) => d.severity === 'error')) return false;
  const mine = symbols.filter((s) => s.kind === kind);
  const others = kind === 'actor' ? lines.join('').split(/[ZY]/).length - 1 : 0;
  if (mine.length !== spots.length + others) return false;
  return spots.every((at) => {
    const hits = mine.filter((s) => s.range.start === at);
    return hits.length === 1 && hits[0]!.name === name && hits[0]!.range.end === at + name.length;
  });
}

/** Why `name` cannot be a name of `kind` (an actor when omitted), if it cannot. */
function invalidReason(name: string, kind = 'actor'): string | undefined {
  const lines = LINES[kind];
  if (!lines) return `'${kind}' is not a user journey symbol kind.`;
  const shape = shapeReason(name, 'A name', 'ends');
  if (shape) return shape;
  return readsBack(name, kind, lines) ? undefined : `'${name}' is not ${NOUNS[kind]}.`;
}

/** The user journey facet. */
export const journeyLanguage: LanguageFacet<JourneyDocument> = {
  id: 'journey',
  parse: (text, options) => parseJourneyForService(text, options),
  categories: journeyCategories,
  namespaces: [['actor'], ['section'], ['task']],
  isValidId: invalidReason,
  completions: journeyCompletions,
  hover: journeyHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { journeyLanguage as language };
