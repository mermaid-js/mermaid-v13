/**
 * The v13 side of timeline parity: the timeline parser and the normaliser from its
 * `TimelineModel` to the {@link TimelineSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 * The model's title is compared as it is: v13 draws a front-matter title (D218), v12's DB had
 * no `setDiagramTitle` and dropped it, a listed divergence.
 */
import { detectTimeline, parseTimeline } from '@mermaid-js/diagram-timeline';
import type { TimelineModel } from '@mermaid-js/diagram-timeline';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { TIMELINE_V12_TYPES, timelineV12Snapshot } from './v12.ts';
import type { TimelineSnapshot } from './v12.ts';

export function timelineV13Snapshot(model: TimelineModel): TimelineSnapshot {
  return {
    direction: model.direction,
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
    sections: model.sections.map((s) => s.text),
    periods: model.periods.map((p) => ({
      text: p.text,
      section: p.section === undefined ? '' : (model.sections[p.section]?.text ?? ''),
      events: p.events.map((e) => e.text),
    })),
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseTimelineForParity(text: string): TimelineModel {
  const pre = preprocess(text);
  const result = parseTimeline(text, { preprocessed: pre });
  const error = [...pre.diagnostics, ...result.diagnostics].find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const timelineAdapter: DiagramAdapter<TimelineModel> = {
  id: 'timeline',
  v12Types: TIMELINE_V12_TYPES,
  detect: (text) => detectTimeline(text),
  parse: parseTimelineForParity,
  normaliseV13: timelineV13Snapshot,
  normaliseV12: timelineV12Snapshot,
};
