/**
 * The v13 side of gantt parity: the gantt parser and the normaliser from its `GanttModel` to the
 * {@link GanttSnapshot} that `v12.ts` takes from mermaid\@12's DB. The v13 parse keeps raw data
 * (D274); the oracle's acceptance runs `getTasks()`, so this adapter also runs `schedule()` at
 * the same instant and rejects what it rejects (T3, #379), as the render would.
 */
import { detectGantt, parseGantt, schedule } from '@mermaid-js/diagram-gantt';
import type { GanttModel } from '@mermaid-js/diagram-gantt';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { GANTT_PARITY_NOW } from './oracle-env.ts';
import { GANTT_V12_TYPES, ganttV12Snapshot } from './v12.ts';
import type { GanttSnapshot } from './v12.ts';

export function ganttV13Snapshot(model: GanttModel): GanttSnapshot {
  let order = 0;
  const clicks: unknown[][] = [];
  for (const c of model.clicks) {
    if (c.call)
      for (const id of c.ids) clicks.push(['setClickEvent', id, c.call.name, c.call.args ?? null]);
    if (c.href !== undefined) for (const id of c.ids) clicks.push(['setLink', id, c.href]);
  }
  return {
    // The oracle never passes the front-matter title on (v12's render did, D218: T4's spec).
    title: model.titleAst === undefined ? '' : (model.title ?? ''),
    accTitle: model.accTitle,
    accDescr: model.accDescr,
    dateFormat: model.dateFormat,
    axisFormat: model.axisFormat,
    tickInterval: model.tickInterval ?? null,
    todayMarker: model.todayMarker,
    includes: [...model.includes],
    excludes: [...model.excludes],
    inclusiveEndDates: model.inclusiveEndDates,
    topAxis: model.topAxis,
    // Raw: unset is `null` (v13 leaves it to `gantt.weekday`, D279).
    weekday: model.weekday ?? null,
    weekend: model.weekend,
    sections: model.sections.map((s) => s.text),
    tasks: model.tasks.map((t) => {
      const vert = t.tags.includes('vert');
      return {
        id: t.id,
        text: t.text,
        section: t.section ?? null,
        tags: {
          active: t.tags.includes('active'),
          done: t.tags.includes('done'),
          crit: t.tags.includes('crit'),
          milestone: t.tags.includes('milestone'),
          vert,
        },
        start: t.start ?? null,
        end: t.end,
        prevId: t.prevId ?? null,
        order: vert ? -1 : order++,
      };
    }),
    clicks,
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic, or the
 * schedule's error at {@link GANTT_PARITY_NOW} (D274: layout rejects it as SEMANTIC).
 */
export function parseGanttForParity(text: string): GanttModel {
  const pre = preprocess(text);
  const result = parseGantt(text, { preprocessed: pre });
  const error = [...pre.diagnostics, ...result.diagnostics].find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  schedule(result.model, { now: GANTT_PARITY_NOW });
  return result.model;
}

export const ganttAdapter: DiagramAdapter<GanttModel> = {
  id: 'gantt',
  v12Types: GANTT_V12_TYPES,
  detect: (text) => detectGantt(text),
  parse: parseGanttForParity,
  normaliseV13: ganttV13Snapshot,
  normaliseV12: ganttV12Snapshot,
};
