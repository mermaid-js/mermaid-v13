/**
 * Gantt hover (DESIGN §4.5, D93): a task id shows the task it names (the last one written with
 * it, as `after`/`until` look ids up; in a `click`, the latest one written before the click, as
 * v12 bound it) and its section; a keyword the one-line doc of the grammar file
 * (`generated/docs.ts`), the keyword alone where its token holds a value (`title Plan`,
 * `dateFormat YYYY-MM-DD`); in task data, a tag, `after` or `until` what it means. Never a
 * preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { ganttDocs } from '../generated/docs.ts';
import type { GanttModel, GanttTask } from '../model.ts';
import type { GanttDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import {
  clickTask,
  code,
  isTag,
  REFERENCE_WORDS,
  span,
  TAGS,
  tasksById,
  TEXT_WORDS,
} from './tables.ts';

const DATA_WORDS = new Map<string, string>([
  ...TAGS.map(([tag, doc]) => [tag, `A tag: the task is ${doc}.`] as const),
  ...REFERENCE_WORDS,
]);

const NO_TASK = 'No task has this id.';
/** A click binds the task as v12 read its line (`ids.ts`). */
const NO_EARLIER_TASK =
  'No task with this id is written before this click, so the click does nothing.';

function taskHover(
  name: string,
  task: GanttTask | undefined,
  model: GanttModel | undefined,
  missing: string
): string {
  if (!task) return `**task** ${code(name)}\n\n${missing}`;
  const section = task.section === undefined ? undefined : model?.sections[task.section];
  const facts = [`Task: ${code(task.text.trim())}`];
  if (section) facts.push(`Section: ${code(section.text.trim())}`);
  if (task.tags.length > 0) facts.push(`Tags: ${task.tags.map(code).join(', ')}`);
  return `**task** ${code(name)}\n\n${facts.join(' · ')}`;
}

/** A click's id at `offset` (in the ids token `[start, end)`): the task it names, if any. */
function clickHover(text: string, start: number, end: number, offset: number, model?: GanttModel) {
  let a = offset;
  let b = offset;
  while (a > start && text.charAt(a - 1) !== ',') a--;
  while (b < end && text.charAt(b) !== ',') b++;
  if (a === b) return undefined;
  const name = text.slice(a, b);
  const contents = taskHover(name, clickTask(model, offset, name), model, NO_EARLIER_TASK);
  return { range: span(a, b), contents };
}

/** A tag, `after` or `until` in task data `[start, end)` at `offset`. */
function dataWord(text: string, start: number, end: number, offset: number): Hover | undefined {
  let a = offset;
  let b = offset;
  while (a > start && /[a-z]/.test(text.charAt(a - 1))) a--;
  while (b < end && /[a-z]/.test(text.charAt(b))) b++;
  const word = text.slice(a, b);
  const docText = DATA_WORDS.get(word);
  if (docText === undefined || !readAt(text.slice(start + 1, end), a - start - 1, word)) {
    return undefined;
  }
  return { range: span(a, b), contents: `**${code(word)}**\n\n${docText}` };
}

/**
 * Whether v12 reads `word` at offset `at` of task data `data` (after its `:`) as a tag or a
 * reference keyword: a tag is a whole field among the leading ones (v12 `getTaskTags`), `after`
 * starts the start field and `until` the end field, each followed by blanks and an id (v12
 * `getStartDate`/`getEndDate`). The fields as `parseData` splits them.
 */
function readAt(data: string, at: number, word: string): boolean {
  const parts = data.split(',');
  let p = 0;
  let index = 0;
  while (index < parts.length - 1 && p + (parts[index] ?? '').length < at) {
    p += (parts[index] ?? '').length + 1;
    index++;
  }
  const part = parts[index] ?? '';
  let tags = 0;
  while (tags < parts.length && isTag(parts[tags] ?? '')) tags++;
  if (DATA_WORDS.has(word) && !REFERENCE_WORDS.some(([w]) => w === word)) {
    return index < tags && part.trim() === word;
  }
  const n = parts.length - tags;
  const field = index - tags;
  let startField = -1;
  if (n === 3) startField = 1;
  else if (n === 2) startField = 0;
  const endField = n <= 3 ? n - 1 : -1;
  const wanted = word === 'after' ? startField : endField;
  const trimmed = part.trimStart();
  return (
    field === wanted &&
    at === p + part.length - trimmed.length &&
    new RegExp(`^${word}\\s+[\\d\\w-]`).test(trimmed)
  );
}

export function ganttHover(at: HoverTarget, doc: DocumentView<GanttDocument>): Hover | undefined {
  const { text } = doc;
  const model = doc.result.model as GanttModel | undefined;
  const t = at.token;
  if (t?.kind === T.ClickId) return clickHover(text, t.range.start, t.range.end, at.offset, model);
  if (at.symbol?.kind === 'task') {
    const s = at.symbol;
    const task = tasksById(model).get(s.name);
    return { range: s.range, contents: taskHover(s.name, task, model, NO_TASK) };
  }
  if (!t) return undefined;
  const { start } = t.range;
  if (t.kind === T.TaskData) return dataWord(text, start, t.range.end, at.offset);
  const docText = ganttDocs[t.kind];
  if (docText === undefined) return undefined;
  const word = TEXT_WORDS[t.kind];
  // The keyword without the blanks (and line break) a token took after it.
  let end = word === undefined ? t.range.end : start + word.length;
  while (end > start && /\s/.test(text.charAt(end - 1))) end--;
  if (at.offset < start || at.offset > end) return undefined;
  return { range: span(start, end), contents: `**${code(text.slice(start, end))}**\n\n${docText}` };
}
