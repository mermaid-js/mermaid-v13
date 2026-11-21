/**
 * The v13 side of sequence parity: the sequence parser's result and the normaliser from its
 * `SequenceModel` (and the actor menus of its AST) to the {@link SequenceSnapshot} that
 * `v12.ts` takes from mermaid\@12's SequenceDB.
 *
 * The model is a statement tree; v12 kept one flat message list. The normaliser writes the
 * rows v12's grammar actions and `apply` added for each statement: a message and then its
 * activation or central-connection rows, a fragment's start row, its sections and its end
 * row, and so on. A `wrap` the source leaves open is `false`: the oracle applies no front
 * matter or directive config when it parses (its `getDiagramFromText`), so v12's `autoWrap()`
 * gave `false` for every corpus source.
 */
import { detectSequence, parseSequence } from '@mermaid-js/diagram-sequence';
import type {
  SequenceMessage,
  SequenceModel,
  SequenceParseResult,
  SequenceStatement,
} from '@mermaid-js/diagram-sequence';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { LINETYPE, SEQUENCE_V12_TYPES, sequenceV12Snapshot } from './v12.ts';
import type { SequenceRowSnapshot, SequenceSnapshot } from './v12.ts';

/** What the parity adapter parses. */
export interface SequenceParity {
  result: SequenceParseResult;
}

const START: Record<string, number> = {
  loop: LINETYPE.LOOP_START,
  alt: LINETYPE.ALT_START,
  opt: LINETYPE.OPT_START,
  par: LINETYPE.PAR_START,
  par_over: LINETYPE.PAR_OVER_START,
  critical: LINETYPE.CRITICAL_START,
  break: LINETYPE.BREAK_START,
};
const SECTION: Record<string, number> = {
  alt: LINETYPE.ALT_ELSE,
  par: LINETYPE.PAR_AND,
  par_over: LINETYPE.PAR_AND,
  critical: LINETYPE.CRITICAL_OPTION,
};
const END: Record<string, number> = {
  loop: LINETYPE.LOOP_END,
  alt: LINETYPE.ALT_END,
  opt: LINETYPE.OPT_END,
  par: LINETYPE.PAR_END,
  par_over: LINETYPE.PAR_END,
  critical: LINETYPE.CRITICAL_END,
  break: LINETYPE.BREAK_END,
};
const PLACEMENT = { left: 0, right: 1, over: 2 } as const;

const row = (
  type: number,
  from: string | null = null,
  extra: Partial<SequenceRowSnapshot> = {}
): SequenceRowSnapshot => ({
  type,
  from,
  to: null,
  text: '',
  wrap: false,
  activate: false,
  central: 0,
  placement: null,
  ...extra,
});

const CENTRAL: Record<string, number> = {
  to: LINETYPE.CENTRAL_CONNECTION,
  from: LINETYPE.CENTRAL_CONNECTION_REVERSE,
  both: LINETYPE.CENTRAL_CONNECTION_DUAL,
};

/** A message's row, then the activation and central-connection rows v12 added after it. */
function messageRows(
  s: SequenceMessage,
  out: SequenceRowSnapshot[],
  at: Map<string, number>
): void {
  at.set(s.ast, out.length);
  out.push({
    type: LINETYPE[s.arrow.toUpperCase() as keyof typeof LINETYPE],
    from: s.from,
    to: s.to,
    text: s.text,
    wrap: s.wrap ?? false,
    activate: s.activation === 'activate' || s.central === 'to' || s.central === 'both',
    central: s.central ? (CENTRAL[s.central] ?? 0) : 0,
    placement: null,
  });
  if (s.activation === 'activate') out.push(row(LINETYPE.ACTIVE_START, s.to));
  if (s.activation === 'deactivate') out.push(row(LINETYPE.ACTIVE_END, s.from));
  if (s.central === 'to' || s.central === 'both') out.push(row(LINETYPE.CENTRAL_CONNECTION, s.to));
  if (s.central === 'from' || s.central === 'both')
    out.push(row(LINETYPE.CENTRAL_CONNECTION_REVERSE, s.from));
}

/** The rows v12 added for `statements`, in order; `at` gets each message's row. */
function rows(
  statements: readonly SequenceStatement[],
  out: SequenceRowSnapshot[],
  at: Map<string, number>
): void {
  for (const s of statements) {
    switch (s.kind) {
      case 'message':
        messageRows(s, out, at);
        break;
      case 'note':
        out.push({
          type: LINETYPE.NOTE,
          from: s.participants[0],
          to: s.participants[1] ?? s.participants[0],
          text: s.text,
          wrap: s.wrap ?? false,
          activate: false,
          central: 0,
          placement: PLACEMENT[s.placement],
        });
        break;
      case 'activation':
        out.push(row(s.active ? LINETYPE.ACTIVE_START : LINETYPE.ACTIVE_END, s.participant));
        break;
      case 'autonumber':
        out.push(
          row(LINETYPE.AUTONUMBER, null, {
            autonumber: { start: s.start ?? null, step: s.step ?? null, visible: s.visible },
          })
        );
        break;
      case 'rect':
        out.push(row(LINETYPE.RECT_START, null, { text: s.color }));
        rows(s.statements, out, at);
        out.push(row(LINETYPE.RECT_END));
        break;
      case 'fragment':
        s.sections.forEach((section, i) => {
          const type = i === 0 ? START[s.fragment] : SECTION[s.fragment];
          out.push(row(type ?? -1, null, { text: section.label, wrap: section.wrap ?? false }));
          rows(section.statements, out, at);
        });
        out.push(row(END[s.fragment] ?? -1));
        break;
    }
  }
}

export function sequenceV13Snapshot(parity: SequenceParity): SequenceSnapshot {
  const model: SequenceModel = parity.result.model;
  const out: SequenceRowSnapshot[] = [];
  const index = new Map<string, number>();
  rows(model.statements, out, index);
  return {
    participants: model.participants.map((p) => ({
      id: p.id,
      label: p.label,
      kind: p.kind,
      wrap: p.wrap ?? false,
      box: p.box ?? null,
      links: { ...p.links },
      properties: { ...p.properties },
    })),
    boxes: model.boxes.map((b) => ({
      label: b.label,
      color: b.color ?? 'transparent',
      wrap: b.wrap ?? false,
      members: [...b.participants],
    })),
    rows: out,
    created: model.participants
      .filter((p) => p.createAst !== undefined)
      .map((p) => [p.id, p.createdBy === undefined ? null : (index.get(p.createdBy) ?? null)]),
    destroyed: model.participants
      .filter((p) => p.destroyAst !== undefined)
      .map((p) => [p.id, p.destroyedBy === undefined ? null : (index.get(p.destroyedBy) ?? null)]),
    // The oracle applies no front matter when it parses (as for `wrap`): see the parse below.
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/** v13 parse for parity: the result, or a throw carrying the first error diagnostic. */
export function parseSequenceForParity(text: string): SequenceParity {
  const pre = preprocess(text);
  // The oracle applies no front matter when it parses, so the parse leaves out the front-matter
  // title that v13 draws when the text has none (D652).
  const fm = pre.frontMatter && (({ title: _, ...rest }) => rest)(pre.frontMatter);
  const result = parseSequence(text, { preprocessed: fm ? { ...pre, frontMatter: fm } : pre });
  const error = [...pre.diagnostics, ...result.diagnostics].find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return { result };
}

export const sequenceAdapter: DiagramAdapter<SequenceParity> = {
  id: 'sequence',
  v12Types: SEQUENCE_V12_TYPES,
  detect: (text) => detectSequence(text),
  parse: parseSequenceForParity,
  normaliseV13: sequenceV13Snapshot,
  normaliseV12: (db) => sequenceV12Snapshot(db),
};
