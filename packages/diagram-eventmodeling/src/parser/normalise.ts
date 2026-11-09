// cspell:words gwts dedented
/**
 * The model from the statements read (R-ARCH-7: source order), the language symbols (D528) and
 * D525's warnings for what v12 dropped silently. v12 kept Langium's AST as its model; the
 * frames, entities, data blocks, notes and `gwt` specifications here are that AST's lists, in
 * the order v12 kept them.
 */
import type { ParseState, Range, RelatedInfo } from '@mermaid-js/core/parser-kit';
import {
  EVENTMODELING_INVALID_SOURCE,
  EVENTMODELING_UNKNOWN_DATA,
  EVENTMODELING_UNKNOWN_FRAME,
  EVENTMODELING_UNKNOWN_SOURCE,
} from '../codes.ts';
import type {
  EventModel,
  EventModelData,
  EventModelDataBlock,
  EventModelEntity,
  EventModelFrame,
  EventModelGwt,
  EventModelGwtStep,
  EventModelKind,
  EventModelNote,
} from '../model.ts';
import type { EventModelDataNode, EventModelGwtStepNode, EventModelText } from './ast.ts';
import type { Parsed } from './parser.ts';

/**
 * v12's validator (`event-modeling-validator.ts`), which its render never ran: the kinds a
 * frame of each kind may take input from, and how its message names them.
 */
const ALLOWED: Readonly<Record<EventModelKind, readonly [EventModelKind[], string, string]>> = {
  cmd: [['ui', 'pcr'], 'command', 'ui or processor'],
  evt: [['cmd'], 'event', 'command'],
  rmo: [['evt'], 'read model', 'event'],
  pcr: [['rmo'], 'processor', 'read model'],
  ui: [['rmo'], 'ui', 'read model'],
};

/** v12's validator message for a `target` frame taking input from a `source` keyword. */
export function invalidSourceMessage(target: EventModelKind, source: string): string {
  const [, label, expected] = ALLOWED[target];
  return `A ${label} can only receive input from a ${expected}, not from '${source}'.`;
}

/** Whether v12's validator allows a `target` frame to take input from a `source` frame. */
export function allowsSource(target: EventModelKind, source: EventModelKind): boolean {
  return ALLOWED[target][0].includes(source);
}

/** One D525 warning kind: every case, reported once at the first (D226). */
class Cases {
  private readonly list: RelatedInfo[] = [];
  add(message: string, range: Range): void {
    this.list.push({ message, range });
  }
  report(st: ParseState, code: string): void {
    const [first, ...rest] = this.list;
    if (!first) return;
    st.diagnostics.warning(code, first.message, first.range, rest.length ? { related: rest } : {});
  }
}

function data(node: EventModelDataNode): EventModelData {
  return node.type ? { text: node.text, type: node.type.value } : { text: node.text };
}

export function normalise(
  parsed: Parsed,
  st: ParseState,
  frontMatterTitle: string | undefined
): EventModel {
  const frames: EventModelFrame[] = [];
  const entities: EventModelEntity[] = [];
  const dataBlocks: EventModelDataBlock[] = [];
  const notes: EventModelNote[] = [];
  const gwts: EventModelGwt[] = [];
  /** Each frame id's first frame: its index in `frames`. */
  const frameAt = new Map<string, number>();
  const dataNames = new Set<string>();
  const entityNames = new Set<string>();
  for (const { node, kind } of parsed.frames) {
    if (!frameAt.has(node.frame.value)) frameAt.set(node.frame.value, frames.length);
    const frame: EventModelFrame = {
      id: node.frame.value,
      reset: node.reset,
      kind,
      keyword: node.kind.value,
      name: node.name.value,
      sources: node.children.map((s) => s.frame.value),
      ...(node.dataRef && { dataRef: node.dataRef.value }),
      ...(node.data && { data: data(node.data) }),
      astId: node.id,
    };
    frames.push(frame);
  }
  for (const node of parsed.children) {
    if (node.type === 'Entity') {
      entityNames.add(node.name.value);
      entities.push({ name: node.name.value, astId: node.id });
    } else if (node.type === 'Data') {
      dataNames.add(node.name.value);
      dataBlocks.push({ name: node.name.value, data: data(node.data), astId: node.id });
    } else if (node.type === 'Note') {
      notes.push({ frame: node.frame.value, data: data(node.data), astId: node.id });
    } else if (node.type === 'Gwt') {
      const steps = (list: EventModelGwtStepNode[]): EventModelGwtStep[] =>
        list.map((s) => ({
          kind: parsed.stepKinds.get(s) ?? 'evt',
          keyword: s.kind.value,
          name: s.name.value,
        }));
      gwts.push({
        frame: node.frame.value,
        given: steps(node.given),
        when: steps(node.when),
        then: steps(node.then),
        astId: node.id,
      });
    }
  }
  symbols(parsed, st, frameAt, dataNames, entityNames);
  warnings(parsed, st, frames, frameAt, dataNames);

  const inText = parsed.title?.text ?? '';
  const model: EventModel = {
    frames,
    entities,
    dataBlocks,
    notes,
    gwts,
    ...titleOf(inText, parsed.title?.id, frontMatterTitle),
    accTitle: parsed.accTitle?.text ?? '',
    accDescr: parsed.accDescr?.text ?? '',
    warnings: st.diagnostics.list.filter(
      (d) => d.severity === 'warning' && d.code.startsWith('EVENTMODELING_')
    ),
  };
  return model;
}

/** D218: the in-text title if non-empty, else the front matter's. */
function titleOf(
  inText: string,
  astId: string | undefined,
  frontMatter: string | undefined
): { title?: string; titleAstId?: string } {
  if (inText) return { title: inText, titleAstId: astId };
  return frontMatter ? { title: frontMatter } : {};
}

/**
 * D528: frame ids, data names and entity names, defined at their first declaration (a repeat is
 * a reference to it) and referenced from `->>`, `note`, `gwt` and `[[ ]]`. A reference to a
 * name nothing declares is left out (radar's D358).
 */
function symbols(
  parsed: Parsed,
  st: ParseState,
  frameAt: ReadonlyMap<string, number>,
  dataNames: ReadonlySet<string>,
  entityNames: ReadonlySet<string>
): void {
  const seen = new Set<string>();
  const declare = (kind: string, name: EventModelText) => {
    const key = `${kind}:${name.value}`;
    st.symbol(name.value, kind, name.range, seen.has(key) ? 'ref' : 'def');
    seen.add(key);
  };
  const refer = (kind: string, name: EventModelText, known: boolean) => {
    if (known) st.symbol(name.value, kind, name.range, 'ref');
  };
  for (const node of parsed.children) {
    if (node.type === 'Frame') {
      declare('frame', node.frame);
      for (const s of node.children) refer('frame', s.frame, frameAt.has(s.frame.value));
      if (node.dataRef) refer('data', node.dataRef, dataNames.has(node.dataRef.value));
    } else if (node.type === 'Entity') {
      declare('entity', node.name);
    } else if (node.type === 'Data') {
      declare('data', node.name);
    } else if (node.type === 'Note') {
      refer('frame', node.frame, frameAt.has(node.frame.value));
    } else if (node.type === 'Gwt') {
      refer('frame', node.frame, frameAt.has(node.frame.value));
      for (const s of [...node.given, ...node.when, ...node.then]) {
        refer('entity', s.name, entityNames.has(s.name.value));
      }
    }
  }
}

/** D525: one warning per kind, at its first case, the others in `related`. */
function warnings(
  parsed: Parsed,
  st: ParseState,
  frames: readonly EventModelFrame[],
  frameAt: ReadonlyMap<string, number>,
  dataNames: ReadonlySet<string>
): void {
  const invalid = new Cases();
  const unknownSource = new Cases();
  const unknownData = new Cases();
  const unknownFrame = new Cases();
  parsed.frames.forEach(({ node, kind }, index) => {
    for (const s of node.children) {
      const id = s.frame.value;
      const at = frameAt.get(id);
      const source = at === undefined ? undefined : frames[at];
      if (source && !allowsSource(kind, source.kind)) {
        invalid.add(invalidSourceMessage(kind, source.keyword), s.frame.range);
      }
      if (at === undefined) {
        unknownSource.add(
          `Frame ${node.frame.value} names the source frame ${id}, which no frame has, so no relation is drawn from it.`,
          s.frame.range
        );
      } else if (at > index) {
        unknownSource.add(
          `Frame ${node.frame.value} names the source frame ${id}, which comes after it, so no relation is drawn from it: a source must come first.`,
          s.frame.range
        );
      }
    }
    if (node.dataRef && !dataNames.has(node.dataRef.value)) {
      unknownData.add(
        `Frame ${node.frame.value} refers to the data \`${node.dataRef.value}\`, which no \`data\` block defines, so it shows no data from it.`,
        node.dataRef.range
      );
    }
  });
  for (const node of parsed.children) {
    if ((node.type === 'Note' || node.type === 'Gwt') && !frameAt.has(node.frame.value)) {
      const what = node.type === 'Note' ? 'This note' : 'This `gwt`';
      unknownFrame.add(
        `${what} is on frame ${node.frame.value}, which no frame has.`,
        node.frame.range
      );
    }
  }
  invalid.report(st, EVENTMODELING_INVALID_SOURCE);
  unknownSource.report(st, EVENTMODELING_UNKNOWN_SOURCE);
  unknownData.report(st, EVENTMODELING_UNKNOWN_DATA);
  unknownFrame.report(st, EVENTMODELING_UNKNOWN_FRAME);
}
