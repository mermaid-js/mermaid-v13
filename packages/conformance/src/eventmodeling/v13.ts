// cspell:words gwts dedented
/**
 * The v13 side of event modeling parity (#602): the parser, and the normaliser from its
 * `EventModel` (with `eventModelStructure`'s lanes, boxes and relations) to the
 * {@link EventModelSnapshot} that `v12.ts` takes from mermaid\@12.
 */
import {
  detectEventModeling,
  eventModelStructure,
  parseEventModel,
} from '@mermaid-js/diagram-eventmodeling';
import type { EventModel } from '@mermaid-js/diagram-eventmodeling';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { EVENTMODELING_V12_TYPES, eventModelingV12Snapshot, plain } from './v12.ts';
import type { EventModelSnapshot } from './v12.ts';

export function eventModelingV13Snapshot(model: EventModel): EventModelSnapshot {
  const { lanes, boxes, relations } = eventModelStructure(model);
  const { frames } = model;
  const id = (k: number) => frames[k]?.id ?? '';
  return {
    lanes: lanes.map((l) => ({ index: l.index, label: l.label })),
    boxes: boxes.map((b) => ({
      frame: id(b.frame),
      kind: frames[b.frame]?.keyword ?? '',
      lane: lanes[b.lane]?.index ?? -1,
      text: plain(b.data === undefined ? b.name : `${b.name} ${b.data}`),
    })),
    relations: relations.map((r) => ({ source: id(r.source), target: id(r.target) })),
    frames: frames.map((f) => ({
      id: f.id,
      reset: f.reset,
      kind: f.keyword,
      name: f.name,
      sources: [...f.sources],
      dataRef: f.dataRef,
      data: f.data?.text,
      dataType: f.data?.type,
    })),
    entities: model.entities.map((e) => e.name),
    dataBlocks: model.dataBlocks.map((b) => ({
      name: b.name,
      type: b.data.type,
      text: b.data.text,
    })),
    notes: model.notes.map((n) => ({ frame: n.frame, type: n.data.type, text: n.data.text })),
    gwts: model.gwts.map((g) => ({
      frame: g.frame,
      given: g.given.map((s) => s.name),
      when: g.when.map((s) => s.name),
      then: g.then.map((s) => s.name),
    })),
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`); the
 * D218 fallback has its own specs (`parser.spec.ts`).
 */
export function parseEventModelForParity(text: string): EventModel {
  const pre = preprocess(text);
  const fm = pre.frontMatter && { ...pre.frontMatter, title: undefined };
  const result = parseEventModel(text, { preprocessed: { ...pre, frontMatter: fm } });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const eventModelingAdapter: DiagramAdapter<EventModel> = {
  id: 'eventmodeling',
  v12Types: EVENTMODELING_V12_TYPES,
  detect: (text) => detectEventModeling(text),
  parse: parseEventModelForParity,
  normaliseV13: eventModelingV13Snapshot,
  normaliseV12: eventModelingV12Snapshot,
};
