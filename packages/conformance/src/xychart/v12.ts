// cspell:words ECECFF
/**
 * The v12 side of XY chart parity (spec #426 T2): mermaid\@12's xychart DB after the oracle's
 * parse, as an {@link XyChartSnapshot}: `getXYChartData()` (axes, plots with their data and
 * point labels, the palette slot of each plot's colour), `getChartConfig().chartOrientation`,
 * `getDiagramTitle()`, `getAccTitle()` and `getAccDescription()`. Texts have their
 * `encodeEntities` placeholders decoded, as v13's tokens do.
 *
 * The oracle sets no config (`getDiagramFromText` applies no directive or front matter), so the
 * orientation is the text's or the default `vertical`, and every plot's colour comes from the
 * default theme's palette: its position there is the plot's palette slot.
 */
import { decodeEntities } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for XY chart sources. */
export const XYCHART_V12_TYPES = ['xychart'];

/** theme-default's `xyChart.plotColorPalette` (12.2.0). */
const DEFAULT_PALETTE =
  '#ECECFF,#8493A6,#FFC3A0,#DCDDE1,#B8E994,#D1A36F,#C3CDE6,#FFB6C1,#496078,#F8F3E3'.split(',');

/** What v12's DB held after a parse, in a shape both sides map to. */
export interface XyChartSnapshot {
  orientation: string;
  /** The in-text title (the oracle skips front matter); `''` without one. */
  title: string;
  accTitle: string;
  accDescr: string;
  xAxis:
    | { type: 'band'; title: string; categories: string[] }
    | { type: 'linear'; title: string; min: number; max: number };
  yAxis: { title: string; min: number; max: number };
  plots: {
    type: 'bar' | 'line';
    title: string;
    /** The palette slot of the plot's colour. */
    slot: number;
    /** `[x, y]`, `y` null where v12 had `undefined`. */
    data: [string, number | null][];
    pointLabels: string[] | null;
  }[];
}

interface V12Axis {
  type: 'band' | 'linear';
  title: string;
  categories?: string[];
  min?: number;
  max?: number;
}

interface V12Plot {
  type: 'bar' | 'line';
  title: string;
  fill?: string;
  strokeFill?: string;
  data: [string, number | undefined][];
  pointLabels?: string[];
}

interface XyChartDb {
  getXYChartData(): { xAxis: V12Axis; yAxis: V12Axis; plots: V12Plot[] };
  getChartConfig(): { chartOrientation: string };
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

/** The snapshot of v12's DB right after the oracle's parse (the parity normaliser). */
export function xyChartV12Snapshot(raw: unknown): XyChartSnapshot {
  const db = raw as XyChartDb;
  const data = db.getXYChartData();
  const x = data.xAxis;
  return {
    orientation: db.getChartConfig().chartOrientation,
    title: decodeEntities(db.getDiagramTitle()),
    accTitle: decodeEntities(db.getAccTitle()),
    accDescr: decodeEntities(db.getAccDescription()),
    xAxis:
      x.type === 'band'
        ? {
            type: 'band',
            title: decodeEntities(x.title),
            categories: (x.categories ?? []).map(decodeEntities),
          }
        : { type: 'linear', title: decodeEntities(x.title), min: x.min ?? 0, max: x.max ?? 0 },
    yAxis: {
      title: decodeEntities(data.yAxis.title),
      min: data.yAxis.min ?? 0,
      max: data.yAxis.max ?? 0,
    },
    plots: data.plots.map((p) => ({
      type: p.type,
      title: decodeEntities(p.title),
      slot: DEFAULT_PALETTE.indexOf(p.fill ?? p.strokeFill ?? ''),
      data: p.data.map(([dx, dy]): [string, number | null] => [decodeEntities(dx), dy ?? null]),
      pointLabels: p.pointLabels ? p.pointLabels.map(decodeEntities) : null,
    })),
  };
}
