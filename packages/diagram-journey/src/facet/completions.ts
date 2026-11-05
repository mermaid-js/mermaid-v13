/**
 * Journey completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items.
 * `journey` where the header goes; `section`, `title`, `accTitle` and `accDescr` where a
 * statement starts (the parser tests them there); after a task's second `:`, the actors the
 * diagram already names, less those the task names already. A task's data is one token
 * (`: 5: Me, Cat`), so the actor being typed is worked out from its text. Nothing in a title,
 * section name, task name, score or accessibility value, or outside code.
 */
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { journeyDocs } from '../generated/docs.ts';
import type { JourneyModel } from '../model.ts';
import type { JourneyDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { KEYWORDS, plural, span, tokenBefore } from './tables.ts';

/** Characters a keyword is made of: the word being typed runs over them. */
const WORD = /[A-Za-z]/;

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, probe: ProbeResult): Range {
  let end = probe.offset;
  while (end < text.length && WORD.test(text.charAt(end))) end++;
  return span(probe.prefix.start, end);
}

/** How many tasks name each actor. */
function taskCounts(model: JourneyModel): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of model.tasks) {
    for (const p of new Set(t.people)) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return counts;
}

/** Where a task's actors are written, and the actor around the cursor. */
interface ActorSpot {
  /** After the data's second `:`, to its third or its end. */
  list: Range;
  /** The actor around the cursor, blanks off. */
  word: Range;
}

/**
 * The actor spot when the cursor is in a task's data after its second `:`: `null` in the score
 * or past a third `:` (v12 drops that piece), `undefined` when the cursor is in no task data.
 */
function actorSpot(text: string, tokens: TokenStream, o: number): ActorSpot | null | undefined {
  const i = tokenBefore(tokens, o - 1);
  if (i < 0 || tokens.kind[i] !== T.TaskData) return undefined;
  const start = tokens.start[i] ?? 0;
  const end = tokens.end[i] ?? 0;
  if (o <= start || o > end) return undefined;
  // `start` is the data's first `:`; the second one starts the actors.
  const second = text.indexOf(':', start + 1);
  if (second < 0 || second >= o) return null;
  const third = text.indexOf(':', second + 1);
  if (third >= 0 && third < o) return null;
  const stop = third >= 0 && third < end ? third : end;
  // From the `,` (or `:`) before the cursor to the next `,` (or the end).
  let from = Math.max(second, text.lastIndexOf(',', o - 1)) + 1;
  while (from < o && /\s/.test(text.charAt(from))) from++;
  const comma = text.indexOf(',', o);
  let to = comma >= 0 && comma < stop ? comma : stop;
  while (to > o && /\s/.test(text.charAt(to - 1))) to--;
  return { list: span(second + 1, stop), word: span(from, to) };
}

/** Actor items at `o` (see {@link actorSpot}): `[]` where no actor goes. */
function actorItems(
  text: string,
  tokens: TokenStream,
  o: number,
  doc: DocumentView<JourneyDocument>
): CompletionItem[] | undefined {
  const spot = actorSpot(text, tokens, o);
  if (spot === undefined) return undefined;
  if (spot === null) return [];
  const { list, word: range } = spot;
  const typed = text.slice(range.start, o);
  const word = text.slice(range.start, range.end);
  // The others this task names already, and the word being typed if no other task names it.
  const listed = text
    .slice(list.start, list.end)
    .split(',')
    .map((s) => s.trim());
  const self = listed.indexOf(word);
  if (self >= 0) listed.splice(self, 1);
  const others = new Set(listed);
  const model = doc.result.model as JourneyModel;
  const counts = taskCounts(model);
  const items: CompletionItem[] = [];
  for (const name of model.actors) {
    if (name === '' || !name.startsWith(typed) || others.has(name)) continue;
    if (name === word && (counts.get(name) ?? 0) <= 1) continue;
    items.push({
      label: name,
      kind: 'node',
      insertText: name,
      range,
      detail: `actor, in ${plural(counts.get(name) ?? 0, 'task')}`,
    });
  }
  return items;
}

export function journeyCompletions(
  probe: ProbeResult,
  doc: DocumentView<JourneyDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens || probe.mode !== 'INITIAL') return [];
  const actors = actorItems(text, tokens, probe.offset, doc);
  if (actors) return actors;
  const range = wordRange(text, probe);
  const prefix = text.slice(range.start, probe.offset);
  const expected = new Set(probe.expected);
  const out: CompletionItem[] = [];
  for (const k of KEYWORDS) {
    if (!expected.has(k.kind) || !k.label.startsWith(prefix)) continue;
    const documentation = journeyDocs[k.kind];
    out.push({
      label: k.label,
      kind: 'keyword',
      insertText: k.insert ?? k.label,
      range,
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  return out;
}
