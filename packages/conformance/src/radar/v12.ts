/**
 * The v12 side of radar parity: a plain-data snapshot of mermaid\@12's radar DB (`getAxes()`,
 * `getCurves()` with the entries reordered, `getOptions()`, the title and accessibility), in the
 * shape of v13's `RadarModel` without AST ids and warnings.
 *
 * Normalisation, chosen so the snapshot holds what v12 drew and nothing else:
 * - text has v12's `encodeEntities` placeholders decoded back to what the author wrote;
 * - the title is the in-text one: the oracle never passes the front matter on, so
 *   `getDiagramTitle()` holds no front-matter title (the v13 side leaves it out too).
 */
import { v12DecodeEntities as d } from '../v12-entities.ts';

/** `diagram.type` values mermaid\@12 reports for radar sources. */
export const RADAR_V12_TYPES = ['radar'];

export interface RadarSnapshot {
  axes: { name: string; label: string }[];
  curves: { name: string; label: string; entries: number[] }[];
  options: {
    showLegend: boolean;
    ticks: number;
    max: number | null;
    min: number;
    graticule: string;
  };
  title: string;
  accTitle: string;
  accDescr: string;
}

interface RadarDbV12 {
  getAxes(): { name: string; label: string }[];
  getCurves(): { name: string; label: string; entries: number[] }[];
  getOptions(): RadarSnapshot['options'];
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

export function radarV12Snapshot(dbValue: unknown): RadarSnapshot {
  const db = dbValue as RadarDbV12;
  const o = db.getOptions();
  return {
    axes: db.getAxes().map((a) => ({ name: a.name, label: d(a.label) })),
    curves: db.getCurves().map((c) => ({
      name: c.name,
      label: d(c.label),
      entries: [...c.entries],
    })),
    options: {
      showLegend: o.showLegend,
      ticks: o.ticks,
      max: o.max,
      min: o.min,
      graticule: o.graticule,
    },
    title: d(db.getDiagramTitle()),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
  };
}
