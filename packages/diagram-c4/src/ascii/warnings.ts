// What the C4 text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per feature
// kind, naming the AST ids of the drawn items it dropped it for, in model order. Config colours
// and fonts are ignored without one (D459); the diagram's own are not: `UpdateElementStyle`'s and
// `UpdateRelStyle`'s colours, `UpdateRelStyle`'s label offsets (the label stays at the middle of
// its line), a relation's description (the SVG's tooltip), and `accTitle` / `accDescr`.
import type { Warning } from '@mermaid-js/core';
import type { C4Layout } from '../layout/index.ts';
import type { C4Model } from '../model.ts';
import { asciiDropped } from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'offset' | 'tooltip' | 'accessibility';

/** One feature kind text output dropped (D82). */
export interface AsciiDroppedWarning extends Warning {
  readonly code: 'ASCII_DROPPED';
  readonly feature: AsciiDroppedFeature;
  readonly astIds: readonly string[];
}

export type AsciiWarning = AsciiDroppedWarning;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'colours ($bgColor, $fontColor, $borderColor, $textColor, $lineColor)',
  offset: 'label offsets ($offsetX, $offsetY)',
  tooltip: 'relation descriptions (the SVG tooltip)',
  accessibility: 'accTitle and accDescr',
};

const given = (...values: (string | undefined)[]): boolean =>
  values.some((v) => v !== undefined && v.trim() !== '');

/** The warnings for one drawing of `model`: only items the layout drew count. */
export function asciiWarnings(model: C4Model, layout: C4Layout): AsciiWarning[] {
  const found: Record<AsciiDroppedFeature, string[]> = {
    style: [],
    offset: [],
    tooltip: [],
    accessibility: [],
  };
  for (const b of layout.boundaries) {
    const { bgColor, fontColor, borderColor, ast } = model.boundaries[b.index]!;
    if (given(bgColor, fontColor, borderColor)) found.style.push(ast);
  }
  for (const e of layout.elements) {
    const { bgColor, fontColor, borderColor, ast } = model.elements[e.index]!;
    if (given(bgColor, fontColor, borderColor)) found.style.push(ast);
  }
  for (const r of layout.relations) {
    const rel = model.relations[r.index]!;
    if (given(rel.textColor, rel.lineColor)) found.style.push(rel.ast);
    if ((rel.offsetX ?? 0) !== 0 || (rel.offsetY ?? 0) !== 0) found.offset.push(rel.ast);
    if (given(rel.descr)) found.tooltip.push(rel.ast);
  }
  const out: AsciiWarning[] = [];
  const add = (feature: AsciiDroppedFeature, astIds: readonly string[]): void =>
    void out.push(asciiDropped(feature, astIds, WHAT[feature]));
  for (const feature of ['style', 'offset', 'tooltip'] as const)
    if (found[feature].length > 0) add(feature, [...new Set(found[feature])]);
  if (given(model.accTitle, model.accDescr)) add('accessibility', []);
  return out;
}
