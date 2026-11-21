/**
 * The v13 side of radar parity: the radar parser and the normaliser from its `RadarModel` to
 * the {@link RadarSnapshot} that `v12.ts` takes from mermaid\@12's radar DB.
 */
import { detectRadar, parseRadar } from '@mermaid-js/diagram-radar';
import type { RadarModel } from '@mermaid-js/diagram-radar';
import { parseForParity } from '../parity-parse.ts';
import type { DiagramAdapter } from '../types.ts';
import { RADAR_V12_TYPES, radarV12Snapshot } from './v12.ts';
import type { RadarSnapshot } from './v12.ts';

export function radarV13Snapshot(model: RadarModel): RadarSnapshot {
  return {
    axes: model.axes.map((a) => ({ name: a.name, label: a.label })),
    curves: model.curves.map((c) => ({
      name: c.name,
      label: c.label,
      entries: c.entries.map((e) => e.value),
    })),
    options: { ...model.options },
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`); the
 * D218 fallback has its own specs in the radar package.
 */
export const parseRadarForParity = (text: string): RadarModel =>
  parseForParity(text, parseRadar, { withoutTitle: true });

export const radarAdapter: DiagramAdapter<RadarModel> = {
  id: 'radar',
  v12Types: RADAR_V12_TYPES,
  detect: (text) => detectRadar(text),
  parse: parseRadarForParity,
  normaliseV13: radarV13Snapshot,
  normaliseV12: radarV12Snapshot,
};
