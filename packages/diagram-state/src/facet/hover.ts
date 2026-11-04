/**
 * State hover (DESIGN §4.5, D93): a state id shows what it is (plain, composite, fork, …), its
 * labels, where it is drawn, its classes and transition and note counts; a class its
 * `classDef` styles; `[*]` which start or end it is; an arrow the transition it makes; a
 * keyword the one-line doc of the grammar file (`generated/docs.ts`). Never a preview.
 */
import type {
  DocumentView,
  Hover,
  HoverTarget,
  Range,
  SymbolOccurrence,
} from '@mermaid-js/core/parser-kit';
import { stateDocs } from '../generated/docs.ts';
import type { StateDocument, StateRegionNode, StateStatementNode } from '../parser/ast.ts';
import type { StateModel } from '../parser/model.ts';
import { T } from '../parser/tokens.ts';
import { code, DIRECTIONS, KIND_NAMES, plural, span } from './tables.ts';

/** Kinds with no grammar terminal, and the kind whose doc covers them. */
const DOC_OF: Readonly<Record<number, number>> = {
  [T.State]: T.As,
  [T.Marker]: T.Fork,
  [T.EndNote]: T.Note,
  [T.AccDescrOpen]: T.AccDescr,
  [T.AccDescrClose]: T.AccDescr,
  [T.ScaleWidth]: T.Scale,
};
const DIRECTION_KINDS = new Set<number>([
  T.DirectionTB,
  T.DirectionBT,
  T.DirectionRL,
  T.DirectionLR,
]);

type Node = StateStatementNode | StateRegionNode;

/** Every node of the AST below `children`, in source order. */
function* walk(children: readonly Node[]): Generator<Node> {
  for (const c of children) {
    yield c;
    if ('children' in c) yield* walk(c.children as readonly Node[]);
  }
}

const within = (r: Range, at: number) => r.start <= at && at <= r.end;

/** Where `parent` (a composite or one of its regions) is, as hover says it. */
function placeOf(parent: string, model: StateModel): string {
  const region = model.regions.find((r) => r.id === parent);
  if (!region) return code(parent);
  const k = /:region(\d+)$/.exec(region.id)?.[1] ?? '?';
  return `${code(region.parent)}, region ${k}`;
}

function stateInfo(name: string, model: StateModel): string {
  const s = model.states.find((x) => x.id === name);
  if (!s) {
    return `**state** ${code(name)}\n\nNot drawn: name it in a transition or give it a description.`;
  }
  const facts: string[] = [];
  if (s.descriptions.length > 0) {
    const label = s.descriptions.length === 1 ? 'Label' : 'Labels';
    facts.push(`${label}: ${s.descriptions.map(code).join(', ')}`);
  }
  if (s.parent !== undefined) facts.push(`In: ${placeOf(s.parent, model)}`);
  const classes = [...new Set(s.classes)];
  if (classes.length > 0) {
    facts.push(`${classes.length === 1 ? 'Class' : 'Classes'}: ${classes.map(code).join(', ')}`);
  }
  let into = 0;
  let out = 0;
  for (const t of model.transitions) {
    if (t.to === name) into++;
    if (t.from === name) out++;
  }
  const notes = model.notes.filter((n) => n.target === name).length;
  const counts = `Transitions: ${into} in, ${out} out${notes > 0 ? ` · ${plural(notes, 'note')}` : ''}`;
  const what = KIND_NAMES[s.kind] ?? s.kind;
  const body = facts.length > 0 ? `${facts.join(' · ')}\n\n` : '';
  return `**${what}** ${code(name)}\n\n${body}${counts}`;
}

function classHover(name: string, model: StateModel): string {
  const c = model.classes.find((x) => x.id === name);
  const used = `Used by ${plural(model.states.filter((s) => s.classes.includes(name)).length, 'state')}`;
  let styles = 'No `classDef` defines it.';
  if (c !== undefined) {
    styles =
      c.styles.length === 0
        ? 'Its `classDef` sets no styles.'
        : code(`classDef ${name} ${c.styles.join(',')}`);
  }
  return `**class** ${code(name)}\n\n${styles}\n\n${used}`;
}

function symbolHover(s: SymbolOccurrence, model: StateModel): string | undefined {
  if (s.kind === 'state') return stateInfo(s.name, model);
  if (s.kind === 'class') return classHover(s.name, model);
  return undefined;
}

/** `[*]` under the cursor: the start or end state it is, from its AST id. */
function pseudoHover(ast: StateDocument, at: number): Hover | undefined {
  for (const n of walk(ast.children)) {
    if (n.type !== 'State' || n.name !== '[*]' || !within(n.nameRange, at)) continue;
    const m = /^n:(?:(.*)\/)?\[\*\](start|end)/.exec(n.id);
    if (!m) return undefined;
    const of = m[1] === undefined ? 'the diagram' : `composite state ${code(m[1])}`;
    return { range: n.nameRange, contents: `**${code('[*]')}** the ${m[2]} state of ${of}` };
  }
  return undefined;
}

/** An arrow under the cursor: the transition it makes. */
function arrowHover(ast: StateDocument, range: Range): Hover | undefined {
  for (const n of walk(ast.children)) {
    if (n.type !== 'Transition') continue;
    const t = n;
    const [a, b] = t.children;
    if (a.nameRange.end > range.start || b.nameRange.start < range.end) continue;
    const label = t.label ? `: ${code(t.label)}` : '';
    return {
      range,
      contents: `**${code('-->')}** transition ${code(t.from)} → ${code(t.to)}${label}\n\n${stateDocs[T.Arrow]}`,
    };
  }
  return undefined;
}

/** A range without its leading and trailing blanks. */
function trimmed(text: string, r: Range): Range {
  let { start, end } = r;
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return span(start, end);
}

export function stateHover(at: HoverTarget, doc: DocumentView<StateDocument>): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as StateModel;
  if (at.symbol) {
    const contents = symbolHover(at.symbol, model);
    if (contents !== undefined) return { range: at.symbol.range, contents };
  }
  const t = at.token;
  if (!t) return undefined;
  // Tokens may take blanks and line breaks with them (`state `, the header): only their text.
  const range = trimmed(text, t.range);
  if (at.offset < range.start || at.offset > range.end || range.start === range.end) {
    return undefined;
  }
  const word = text.slice(range.start, range.end);
  if (t.kind === T.EdgeState) return pseudoHover(result.ast, at.offset);
  if (t.kind === T.Arrow) {
    return (
      arrowHover(result.ast, range) ?? {
        range,
        contents: `**${code(word)}**\n\n${stateDocs[T.Arrow]}`,
      }
    );
  }
  if (DIRECTION_KINDS.has(t.kind)) {
    const dir = word.slice(-2).toUpperCase();
    const meaning = DIRECTIONS.find(([d]) => d === dir)?.[1] ?? dir;
    return { range, contents: `**${code(word)}** direction: ${meaning}\n\n${stateDocs[t.kind]}` };
  }
  const docText = stateDocs[t.kind] ?? stateDocs[DOC_OF[t.kind] ?? -1];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(word)}**\n\n${docText}` };
}
