/**
 * Sequence hover (DESIGN §4.5, D93): a participant id shows its label, type, box and message
 * counts; an arrow what it draws and which participants it joins; a keyword or activation sign
 * the one-line doc of the grammar file (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { sequenceDocs } from '../generated/docs.ts';
import type { SequenceModel, SequenceStatement } from '../model.ts';
import type {
  SequenceDocument,
  SequenceMessageStmt,
  SequenceStatementNode,
} from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { ARROWS, code, MESSAGE_DOC, span } from './tables.ts';
import { trimmed } from '@mermaid-js/shared/parser/facet';
import { plural } from '@mermaid-js/shared/parser/facet';

const ARROW_BY_TOKEN = new Map(ARROWS.map((a) => [a.token, a]));
/** `title …` is one token: only the keyword is hovered. */
const TITLE_KINDS = new Set<number>([T.Title, T.LegacyTitle]);

/** Every statement of the model, blocks opened, in source order. */
function* statements(list: readonly SequenceStatement[]): Generator<SequenceStatement> {
  for (const s of list) {
    yield s;
    if (s.kind === 'fragment') for (const sec of s.sections) yield* statements(sec.statements);
    else if (s.kind === 'rect') yield* statements(s.statements);
  }
}

/** Every message of the AST, blocks opened, in source order. */
function* messages(children: readonly SequenceStatementNode[]): Generator<SequenceMessageStmt> {
  for (const c of children) {
    if (c.type === 'Message') yield c;
    else if (c.type === 'Fragment' || c.type === 'Section' || c.type === 'Rect') {
      yield* messages(c.children);
    }
  }
}

function participantHover(name: string, model: SequenceModel): string | undefined {
  const p = model.participants.find((x) => x.id === name);
  if (!p) return undefined;
  let into = 0;
  let out = 0;
  let notes = 0;
  for (const s of statements(model.statements)) {
    if (s.kind === 'message') {
      if (s.to === name) into++;
      if (s.from === name) out++;
    } else if (s.kind === 'note' && (s.participants as readonly string[]).includes(name)) notes++;
  }
  const facts = [`Label: ${code(p.label)}`, `Type: ${code(p.kind)}`];
  const box = p.box === undefined ? undefined : model.boxes[p.box];
  if (box) facts.push(box.label === '' ? 'In a box' : `Box: ${code(box.label)}`);
  const life: string[] = [];
  if (p.createAst !== undefined) life.push('created by a message');
  if (p.destroyAst !== undefined) life.push('destroyed by a message');
  const lifeLine = life.length === 0 ? '' : `\n\nIt is ${life.join(' and ')}.`;
  const counts = `Messages: ${into} in, ${out} out · ${plural(notes, 'note')}`;
  return `**${p.kind === 'actor' ? 'actor' : 'participant'}** ${code(name)}\n\n${facts.join(' · ')}\n\n${counts}${lifeLine}`;
}

function arrowHover(text: string, range: Range, kind: number, ast: SequenceDocument): Hover {
  const a = ARROW_BY_TOKEN.get(kind)!;
  const written = text.slice(range.start, range.end);
  let ends = '';
  for (const m of messages(ast.children)) {
    if (m.arrowRange.start <= range.start && range.end <= m.arrowRange.end) {
      ends = `: ${code(m.from)} → ${code(m.to)}`;
      break;
    }
  }
  return { range, contents: `**${code(written)}** ${a.draws}${ends}\n\n${MESSAGE_DOC}` };
}

export function sequenceHover(
  at: HoverTarget,
  doc: DocumentView<SequenceDocument>
): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as SequenceModel;
  if (at.symbol?.kind === 'participant') {
    const contents = participantHover(at.symbol.name, model);
    if (contents !== undefined) return { range: at.symbol.range, contents };
  }
  const t = at.token;
  if (!t) return undefined;
  let range = trimmed(text, t.range);
  if (TITLE_KINDS.has(t.kind)) {
    const word = /^title/i.exec(text.slice(range.start, range.end));
    if (!word) return undefined;
    range = span(range.start, range.start + word[0].length);
  }
  if (at.offset < range.start || at.offset > range.end || range.start === range.end) {
    return undefined;
  }
  if (ARROW_BY_TOKEN.has(t.kind)) return arrowHover(text, range, t.kind, result.ast);
  const docText = sequenceDocs[t.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
