// cspell:words gwts
/**
 * Event modeling hover (DESIGN §4.5, D93, spec #527 "Language facet (T6)"). A frame id, where
 * it is declared or referred to, shows the frame's kind and name, its lane, and its resolved
 * sources: the `->>` sources drawn, those named but not drawn (a later frame, or none), or the
 * source v12 infers when there is no `->>` (the nearest earlier frame in another lane), as
 * {@link eventModelStructure} decides them for the layout. A data name shows its type and the
 * frames that show it; an entity name the `gwt` specifications that name it. A reference to
 * something no statement declares (no symbol, D528) says so. A keyword shows the one-line doc
 * of the grammar file (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { firstFrameAt } from '../frames.ts';
import { eventmodelingDocs } from '../generated/docs.ts';
import type { EventModel, EventModelFrame } from '../model.ts';
import type { EventModelDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { eventModelStructure } from '../structure.ts';
import { code, inside, list, span } from './tables.ts';

/** Tokens with a doc that hover leaves alone: names, ids, data and punctuation. */
const NO_DOC = new Set<number>([
  T.Id,
  T.FrameId,
  T.DataInline,
  T.DataBlock,
  T.Dot,
  T.Backtick,
  T.OpenRef,
  T.CloseRef,
]);

/** Each text statement's keyword: only the keyword of its token is hovered. */
const TEXT_WORD: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

/** A frame as hover names it: its id, then its kind and name (`01` and `cmd AddItem`). */
const frameLabel = (f: EventModelFrame): string =>
  `${code(f.id)} (${code(`${f.keyword} ${f.name}`)})`;

function frameHover(id: string, model: EventModel): string {
  const at = firstFrameAt(model.frames).get(id);
  const frame = at === undefined ? undefined : model.frames[at];
  if (at === undefined || !frame) return `**frame** ${code(id)}\n\nNo frame has id ${code(id)}.`;
  const structure = eventModelStructure(model);
  const box = structure.boxes[at];
  const lane = box === undefined ? undefined : structure.lanes[box.lane];
  const lines = [
    `**${frame.reset ? 'reset frame' : 'frame'}** ${code(id)}: ${code(`${frame.keyword} ${frame.name}`)}`,
  ];
  if (lane) lines.push(`In the **${lane.label}** lane.`);
  const into = structure.relations.filter((r) => r.target === at);
  const named = (r: { source: number }) => {
    const f = model.frames[r.source];
    return f ? frameLabel(f) : '';
  };
  const inferred = into.find((r) => r.inferred);
  if (inferred) {
    lines.push(
      `Source, inferred (no \`->>\`): ${named(inferred)}, the nearest earlier frame in another lane.`
    );
  } else if (into.length > 0) {
    lines.push(`Sources (\`->>\`): ${list(into.map(named))}.`);
  } else if (frame.sources.length === 0) {
    lines.push(
      frame.reset
        ? 'No source: a reset frame with no `->>` gets no inferred one.'
        : 'No source: the first frame with no `->>`.'
    );
  }
  const drawn = new Set(into.map((r) => model.frames[r.source]?.id));
  const notDrawn = [...new Set(frame.sources)].filter((s) => !drawn.has(s));
  if (notDrawn.length > 0) {
    const why = (s: string) => {
      const k = firstFrameAt(model.frames).get(s);
      return `${code(s)} (${k === undefined ? 'no frame has it' : 'it comes later'})`;
    };
    lines.push(`Named but not drawn: ${list(notDrawn.map(why))}.`);
  }
  const out = structure.relations.filter((r) => r.source === at && r.target !== at);
  if (out.length > 0) {
    const targets = out.map((r) => model.frames[r.target]).filter((f) => f !== undefined);
    lines.push(`Source of ${list(targets.map(frameLabel))}.`);
  }
  return lines.join('\n\n');
}

function dataHover(name: string, model: EventModel): string {
  const blocks = model.dataBlocks.filter((d) => d.name === name);
  const first = blocks[0];
  if (!first) {
    return `**data** ${code(name)}\n\nNo \`data\` block is named ${code(name)}, so a frame that refers to it shows no data from it.`;
  }
  const lines = [`**data** ${code(name)}`];
  if (first.data.type !== undefined) lines.push(`Written as ${code(first.data.type)}.`);
  if (blocks.length > 1) {
    lines.push(`Defined ${blocks.length} times: frames show the first.`);
  }
  const shown = model.frames.filter((f) => f.dataRef === name);
  lines.push(
    shown.length > 0
      ? `Shown by ${list(shown.map(frameLabel))}.`
      : `No frame shows it: a frame does with ${code(`[[${name}]]`)}.`
  );
  return lines.join('\n\n');
}

function entityHover(name: string, model: EventModel): string {
  const declared = model.entities.some((e) => e.name === name);
  const gwts = model.gwts.filter((g) =>
    [...g.given, ...g.when, ...g.then].some((s) => s.name === name)
  );
  const lines = [`**entity** ${code(name)}`];
  if (!declared) lines.push(`No \`entity\` statement declares ${code(name)}.`);
  else lines.push('Not drawn.');
  const frames = [...new Set(gwts.map((g) => g.frame))];
  lines.push(
    frames.length > 0
      ? `Named by the \`gwt\` of ${list(frames.map((f) => `frame ${code(f)}`))}.`
      : 'No `gwt` step names it.'
  );
  return lines.join('\n\n');
}

/** The name under `offset` that names a frame, data block or entity, symbol or not. */
function nameAt(
  doc: EventModelDocument,
  offset: number
): { kind: 'frame' | 'data' | 'entity'; value: string; range: Range } | undefined {
  const hit = (kind: 'frame' | 'data' | 'entity', t: { value: string; range: Range }) =>
    inside(offset, t.range) ? { kind, ...t } : undefined;
  for (const n of doc.children) {
    if (!inside(offset, n.range)) continue;
    if (n.type === 'Frame') {
      for (const s of n.children) {
        const found = hit('frame', s.frame);
        if (found) return found;
      }
      return (n.dataRef && hit('data', n.dataRef)) ?? hit('frame', n.frame);
    }
    if (n.type === 'Note') return hit('frame', n.frame);
    if (n.type === 'Gwt') {
      for (const s of [...n.given, ...n.when, ...n.then]) {
        const found = hit('entity', s.name);
        if (found) return found;
      }
      return hit('frame', n.frame);
    }
    if (n.type === 'Data') return hit('data', n.name);
    if (n.type === 'Entity') return hit('entity', n.name);
  }
  return undefined;
}

export function eventModelingHover(
  at: HoverTarget,
  doc: DocumentView<EventModelDocument>
): Hover | undefined {
  const { text } = doc;
  // The facet's own parse: its model is an EventModel.
  const model = doc.result.model as EventModel;
  const describe = (kind: string, name: string): string => {
    if (kind === 'frame') return frameHover(name, model);
    return kind === 'data' ? dataHover(name, model) : entityHover(name, model);
  };
  if (at.symbol)
    return { range: at.symbol.range, contents: describe(at.symbol.kind, at.symbol.name) };
  // A reference to a name nothing declares has no symbol (D528): still described.
  const name = nameAt(doc.result.ast, at.offset);
  if (name) return { range: name.range, contents: describe(name.kind, name.value) };
  const t = at.token;
  if (!t || NO_DOC.has(t.kind)) return undefined;
  let range = t.range;
  // A text statement's token holds its text too: only the keyword is hovered.
  const word = TEXT_WORD[t.kind];
  if (word !== undefined) {
    const start =
      range.start + (/^[\t ]*/.exec(text.slice(range.start, range.end))?.[0].length ?? 0);
    range = span(start, start + word.length);
  }
  if (at.offset < range.start || at.offset > range.end) return undefined;
  const docText = eventmodelingDocs[t.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
