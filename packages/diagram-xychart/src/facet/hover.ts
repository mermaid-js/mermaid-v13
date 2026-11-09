/**
 * XY chart hover (DESIGN §4.5, D93): a plot (its name, values or brackets) shows its kind, its
 * colour slot in the plot palette and how many values it has, and on a value that value's x; a
 * category its place on the x axis; a keyword the one-line doc of the grammar file
 * (`generated/docs.ts`).
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import type { XyChartModel } from '../model.ts';
import { xychartDocs } from '../generated/docs.ts';
import type { XyChartAxisNode, XyChartDocument, XyChartPlotNode } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { code, plural, trimmed } from './tables.ts';

/** Glue tokens that hover as the keyword they belong to. */
const DOC_KIND: Readonly<Record<number, number>> = {
  [T.AccDescrMultiline]: T.AccDescr,
  [T.AccDescrMultilineEnd]: T.AccDescr,
};

const inside = (r: Range, at: number) => r.start <= at && at <= r.end;

function plotHover(doc: DocumentView<XyChartDocument>, n: XyChartPlotNode, at: number): string {
  const plots = doc.result.ast.children.filter((c): c is XyChartPlotNode => c.type === 'Plot');
  const i = plots.indexOf(n);
  const plot = (doc.result.model as XyChartModel).plots[i];
  const name = n.name ? ` ${code(n.name.text.trim())}` : '';
  const head = `**${n.kind}**${name} (plot ${i + 1}${n.name ? '' : ', unnamed: no legend entry'})`;
  const facts = [
    `Colour ${i + 1} of the plot palette (\`xyChart.plotColorPalette\`; past its end the colours start over)`,
    plural(n.points.length, 'value'),
  ];
  const j = n.points.findIndex((p) => inside(p.range, at));
  const point = n.points[j];
  if (point !== undefined) {
    const x = plot?.data[j]?.x;
    const where =
      x === undefined ? ', not drawn: the x axis has no place for it' : ` at x ${code(x)}`;
    facts.push(`Value ${j + 1}: ${code(point.value)}${where}`);
  }
  return `${head}\n\n${facts.join(' · ')}`;
}

/** The category at `at` (its quotes included), with its axis and place there. */
function categoryHover(doc: DocumentView<XyChartDocument>, at: number): string | undefined {
  const axis = doc.result.ast.children.find(
    (c): c is XyChartAxisNode =>
      c.type === 'Axis' && !!c.categories?.some((k) => inside(k.range, at))
  );
  const list = axis?.categories ?? [];
  const k = list.findIndex((c) => inside(c.range, at));
  const self = list[k];
  if (!axis || !self) return undefined;
  const name = self.text.trim();
  const facts = [`Category ${k + 1} of ${list.length} on the x axis`];
  const same = list.filter((c) => c.text.trim() === name).length;
  if (same > 1) facts.push(`written ${same} times: the repeats share one band`);
  const model = doc.result.model as XyChartModel;
  if (model.xAxis.ast !== axis.id) facts.push('a later `x-axis` replaces these categories');
  return `**category** ${code(name)}\n\n${facts.join(' · ')}`;
}

export function xyChartHover(
  at: HoverTarget,
  doc: DocumentView<XyChartDocument>
): Hover | undefined {
  const { text, result } = doc;
  if (at.symbol?.kind === 'category') {
    const contents = categoryHover(doc, at.symbol.range.start);
    if (contents) return { range: at.symbol.range, contents };
  }
  const t = at.token;
  const keyword = t !== undefined && (t.kind === T.Bar || t.kind === T.Line);
  for (const n of result.ast.children) {
    if (n.type !== 'Plot' || keyword || !inside(n.range, at.offset)) continue;
    const point = n.points.find((p) => inside(p.range, at.offset));
    const name = n.name && inside(n.name.range, at.offset) ? n.name.range : undefined;
    const range = name ?? point?.range ?? n.range;
    return { range, contents: plotHover(doc, n, at.offset) };
  }
  if (!t) return undefined;
  const range = trimmed(text, t.range);
  if (at.offset < range.start || at.offset > range.end || range.start === range.end) {
    return undefined;
  }
  const docText = xychartDocs[DOC_KIND[t.kind] ?? t.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
