// What the C4 text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per feature
// kind, naming the AST ids of the drawn items it dropped it for, in model order. Config colours
// and fonts are ignored without one (D459); the diagram's own are not: `UpdateElementStyle`'s and
// `UpdateRelStyle`'s colours, `UpdateRelStyle`'s label offsets (the label stays at the middle of
// its line), a relation's description (the SVG's tooltip), and `accTitle` / `accDescr`.
import type { C4Layout } from '../layout/index.ts';
import type { C4Model } from '../model.ts';
import type { C4BetaModel } from '../beta/model.ts';
import { asciiDropped } from '@mermaid-js/shared/ascii';
import type { AsciiDroppedWarning as SharedAsciiDroppedWarning } from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'offset' | 'tooltip' | 'accessibility' | 'legend';

/** One feature kind text output dropped (D82). */
export type AsciiDroppedWarning = SharedAsciiDroppedWarning<AsciiDroppedFeature>;

export type AsciiWarning = AsciiDroppedWarning;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'colours ($bgColor, $fontColor, $borderColor, $textColor, $lineColor)',
  offset: 'label offsets ($offsetX, $offsetY)',
  tooltip: 'relation descriptions (the SVG tooltip)',
  accessibility: 'accTitle and accDescr',
  legend: 'legend (its swatches key colours)',
};

const COLOUR_KEYS: ReadonlySet<string> = new Set(['fill', 'stroke', 'color', 'line']);

const given = (...values: (string | undefined)[]): boolean =>
  values.some((v) => v !== undefined && v.trim() !== '');

/** The warnings for one drawing of `model`: only items the layout drew count. */
export function asciiWarnings(model: C4Model, layout: C4Layout): AsciiWarning[] {
  const found: Record<Exclude<AsciiDroppedFeature, 'legend'>, string[]> = {
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

/**
 * c4-beta's: `style` statements whose colours or line apply to something the layout drew (the
 * `shape:cylinder` entry is drawn, as caps), `accTitle` and `accDescr`, and the legend the layout
 * left out (`C4Layout.legendDropped`). A relation's description is its label, so no tooltip.
 */
export function asciiWarningsBeta(model: C4BetaModel, layout: C4Layout): AsciiWarning[] {
  const drawn = [
    ...layout.elements.map((e) => model.elements[e.index]!),
    ...layout.boundaries.map((b) => model.elements.filter((e) => e.boundary)[b.index]!),
    ...layout.relations.map((r) => model.relations[r.index]!),
  ];
  const styled = model.styles.filter(
    (st) =>
      st.entries.some((e) => COLOUR_KEYS.has(e.key)) &&
      drawn.some((d) => ('kind' in d && d.kind === st.target) || d.tags.includes(st.target))
  );
  const out: AsciiWarning[] = [];
  const add = (feature: AsciiDroppedFeature, astIds: readonly string[]): void =>
    void out.push(asciiDropped(feature, astIds, WHAT[feature]));
  if (styled.length > 0)
    add(
      'style',
      styled.map((st) => st.ast)
    );
  if (layout.legendDropped) add('legend', []);
  if (given(model.accTitle, model.accDescr)) add('accessibility', []);
  return out;
}
