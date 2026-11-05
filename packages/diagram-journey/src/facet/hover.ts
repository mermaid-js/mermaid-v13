/**
 * Journey hover (DESIGN §4.5, D93): an actor shows the tasks it is in and their mean score; a
 * section its tasks, mean score and actors; a task its score, section and actors; a score what
 * it draws (D226: `NaN` at 3, others clamped to 0–5); a keyword the one-line doc of the grammar
 * file (`generated/docs.ts`). `title …` and `section …` are one token each: only the keyword is
 * hovered as one. Never a preview.
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { journeyDocs } from '../generated/docs.ts';
import type { JourneyModel, JourneyTask } from '../model.ts';
import type { JourneyDocument, JourneyTaskNode } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { code, meanScore, names, plural, scoreFace, span } from './tables.ts';

/** Keyword tokens that also hold text: the keyword hovered, and the doc it shows. */
const WORDS: Readonly<Partial<Record<number, readonly [word: string, doc: number]>>> = {
  [T.Journey]: ['journey', T.Journey],
  [T.Title]: ['title', T.Title],
  [T.Section]: ['section', T.Section],
  [T.AccTitle]: ['accTitle', T.AccTitle],
  [T.AccDescr]: ['accDescr', T.AccDescr],
  [T.AccDescrMultiline]: ['accDescr', T.AccDescr],
};

const inside = (offset: number, r: Range) => r.start <= offset && offset <= r.end;

/** The task node whose range holds `r`, with its index in the model's tasks. */
function taskAt(ast: JourneyDocument, r: Range): [JourneyTaskNode, number] | undefined {
  let i = 0;
  for (const n of ast.children) {
    if (n.type !== 'Task') continue;
    if (n.range.start <= r.start && r.end <= n.range.end) return [n, i];
    i++;
  }
  return undefined;
}

/** The index of the section line whose range holds `r`. */
function sectionAt(ast: JourneyDocument, r: Range): number {
  let i = 0;
  for (const n of ast.children) {
    if (n.type !== 'Section') continue;
    if (n.range.start <= r.start && r.end <= n.range.end) return i;
    i++;
  }
  return -1;
}

const named = (people: readonly string[]) => [...new Set(people.filter((p) => p !== ''))];

function actorHover(name: string, model: JourneyModel): string {
  const tasks = model.tasks.filter((t) => t.people.includes(name));
  const mean = meanScore(tasks);
  const facts = [`In ${plural(tasks.length, 'task')}`];
  if (mean !== undefined) facts.push(`mean score ${mean}`);
  const list = tasks.length === 0 ? '' : `\n\nTasks: ${names(tasks.map((t) => t.name.trim()))}`;
  return `**actor** ${code(name)}\n\n${facts.join(' · ')}${list}`;
}

function sectionHover(name: string, index: number, model: JourneyModel): string {
  const tasks = model.tasks.filter((t) => t.sectionIndex === index);
  const mean = meanScore(tasks);
  const facts = [plural(tasks.length, 'task')];
  if (mean !== undefined) facts.push(`mean score ${mean}`);
  const actors = named(tasks.flatMap((t) => t.people));
  const who = actors.length === 0 ? '' : `\n\nActors: ${names(actors)}`;
  const lines = model.sections.filter((s) => s.name.trim() === name).length;
  const again = lines > 1 ? `\n\nOne of ${lines} \`section\` lines with this name.` : '';
  return `**section** ${code(name)}\n\n${facts.join(' · ')}${who}${again}`;
}

function taskHover(task: JourneyTask): string {
  const facts = [`Score: ${task.score}`];
  if (task.sectionIndex !== undefined) facts.push(`Section: ${code(task.section.trim())}`);
  const actors = named(task.people);
  const who = actors.length === 0 ? '' : `\n\nActors: ${names(actors)}`;
  return `**task** ${code(task.name.trim())}\n\n${facts.join(' · ')}${who}`;
}

/** The score's range in the data token at `data`: its first `:` piece, blanks off. */
function scoreRange(text: string, data: Range): Range {
  let start = data.start + 1;
  const colon = text.indexOf(':', start);
  let end = colon >= 0 && colon < data.end ? colon : data.end;
  while (start < end && /\s/.test(text.charAt(start))) start++;
  while (end > start && /\s/.test(text.charAt(end - 1))) end--;
  return span(start, end);
}

export function journeyHover(
  at: HoverTarget,
  doc: DocumentView<JourneyDocument>
): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as JourneyModel;
  const s = at.symbol;
  if (s?.kind === 'actor') return { range: s.range, contents: actorHover(s.name, model) };
  if (s?.kind === 'section') {
    const i = sectionAt(result.ast, s.range);
    if (i >= 0) return { range: s.range, contents: sectionHover(s.name, i, model) };
  }
  if (s?.kind === 'task') {
    const task = model.tasks[taskAt(result.ast, s.range)?.[1] ?? -1];
    if (task) return { range: s.range, contents: taskHover(task) };
  }
  const t = at.token;
  if (!t) return undefined;
  if (t.kind === T.TaskData) {
    const range = scoreRange(text, t.range);
    const found = taskAt(result.ast, t.range);
    if (!found || range.start === range.end || !inside(at.offset, range)) return undefined;
    const written = text.slice(range.start, range.end);
    const score = found[0].score;
    const value = String(score) === written ? '' : ` (${score})`;
    return {
      range,
      contents: `**score** ${code(written)}${value}\n\n${scoreFace(score)}.\n\nA score runs from 0 (worst) to 5 (best).`,
    };
  }
  const word = WORDS[t.kind];
  if (!word) return undefined;
  const [keyword, docKind] = word;
  let start = t.range.start;
  while (/\s/.test(text.charAt(start)) && start < t.range.end) start++;
  const range = span(start, start + keyword.length);
  if (!inside(at.offset, range)) return undefined;
  const docText = journeyDocs[docKind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
