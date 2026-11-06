/**
 * The v13 side of gantt parity: the gantt parser and the normaliser from its `GanttModel` to the
 * {@link GanttSnapshot} that `v12.ts` takes from mermaid\@12's DB. The v13 parse keeps raw data
 * (D274), so sources whose scheduling throws in v12 (`getTasks()`) are accepted here: listed
 * divergences until T3 (#379) runs `schedule()` in this adapter.
 */
import { detectGantt, parseGantt } from '@mermaid-js/diagram-gantt';
import type { GanttModel } from '@mermaid-js/diagram-gantt';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { GANTT_V12_TYPES, ganttV12Snapshot } from './v12.ts';
import type { GanttSnapshot } from './v12.ts';

export function ganttV13Snapshot(model: GanttModel): GanttSnapshot {
  let order = 0;
  const clicks: unknown[][] = [];
  for (const c of model.clicks) {
    const ids = c.ids.join(',');
    if (c.call) clicks.push(['setClickEvent', ids, c.call.name, c.call.args ?? null]);
    if (c.href !== undefined) clicks.push(['setLink', ids, c.href]);
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
    // v12's DB starts at `sunday`; v13 leaves it to `gantt.weekday` (D279).
    weekday: model.weekday ?? 'sunday',
    weekend: model.weekend,
    sections: model.sections.map((s) => s.text),
    tasks: model.tasks.map((t) => {
      const vert = t.tags.includes('vert');
      return {
        id: t.id,
        text: t.text,
        section: t.section === undefined ? '' : (model.sections[t.section]?.text ?? ''),
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

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseGanttForParity(text: string): GanttModel {
  const pre = preprocess(text);
  const result = parseGantt(text, { preprocessed: pre });
  const error = [...pre.diagnostics, ...result.diagnostics].find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
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
