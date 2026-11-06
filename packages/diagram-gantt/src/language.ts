/**
 * Gantt language facet (`@mermaid-js/diagram-gantt/language`, DESIGN §4.5, R-LANG-8, D89):
 * the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the schedule, the layout or a renderer; the import-boundary lint and the bench's
 * language bundle spec hold that in place.
 *
 * Symbols are task ids (kind `task`): defined where a task's data names one, referred to after
 * `after` (a start), `until` (an end) and `click`. Each `section` folds to the line before the
 * next one.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { ganttCompletions } from './facet/completions.ts';
import { ganttHover } from './facet/hover.ts';
import { ganttCategories } from './generated/categories.ts';
import { parseGantt } from './parser/index.ts';
import type { GanttDocument } from './parser/index.ts';
import { NEVER_STORED } from './ids.ts';

export { ganttCategories } from './generated/categories.ts';
export { ganttDocs } from './generated/docs.ts';
export { detectGantt, GanttTokenKind, ganttTokens, parseGantt } from './parser/index.ts';
export type * from './parser/index.ts';

/**
 * Where any task id may be written; `@` stands for it. A name is an id when both read it back
 * as that task id. v12 also takes ids `after` and `until` cannot name (`:ps`, `a.b`: their
 * `[\d\w- ]+` stops short); a rename that puts one where a mention would not read it is refused
 * by the service's read-back of the renamed text.
 */
const ID_LINES = ['a :@, 2024-01-01, 1d', 'click @ href "u"'];

/**
 * Whether `name`, written for `@` in every line of {@link ID_LINES}, reads back as exactly one
 * task symbol named `name` at each spot, with no error. One parse of all the lines together.
 */
function readsBack(name: string): boolean {
  let text = 'gantt\n';
  const spots: number[] = [];
  for (const line of ID_LINES) {
    spots.push(text.length + line.indexOf('@'));
    text += `${line.replace('@', () => name)}\n`;
  }
  const { diagnostics, symbols } = parseGantt(text);
  if (diagnostics.some((d) => d.severity === 'error')) return false;
  const ids = symbols.filter((s) => s.kind === 'task' && s.name === name);
  if (ids.length !== spots.length) return false;
  return spots.every((at, i) => {
    const s = ids[i];
    return s !== undefined && s.range.start === at && s.range.end === at + name.length;
  });
}

/** Why `name` cannot be a task id, if it cannot. */
function invalidReason(name: string): string | undefined {
  if (name === '') return 'A task id cannot be empty.';
  if (/[\r\n]/.test(name)) return 'A task id cannot contain a line break.';
  if (/\s/.test(name)) return 'A task id cannot contain a blank.';
  if (name === NEVER_STORED)
    return `v12 never stores the id \`${NEVER_STORED}\`: nothing finds it.`;
  return readsBack(name)
    ? undefined
    : `'${name}' is not a task id (no \`,\`, \`#\` or \`;\`, and not a tag such as \`done\`).`;
}

/** The gantt facet. */
export const ganttLanguage: LanguageFacet<GanttDocument> = {
  id: 'gantt',
  parse: (text, options) => parseGantt(text, options),
  categories: ganttCategories,
  namespaces: [['task']],
  isValidId: invalidReason,
  completions: ganttCompletions,
  hover: ganttHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { ganttLanguage as language };
