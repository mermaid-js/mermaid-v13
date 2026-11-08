import { describe, expect, it } from 'vitest';
import { detectXyChart, parseXyChart } from '@mermaid-js/diagram-xychart';
import type { XyChartAxisNode } from '@mermaid-js/diagram-xychart';
import { xyChartLanguage } from '@mermaid-js/diagram-xychart/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot, TextEdit } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { xyChartGateCorpus } from './corpus.ts';
import { xyChartV12Snapshot } from './v12.ts';
import type { XyChartSnapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for xychart (language.md step 8,
 * D99 suite 2, R-LANG-1, #512), checked against the mermaid v12 DB over the XY chart gate
 * corpus (D389):
 * - categories: the last `x-axis` with categories has one `category` definition per category
 *   v12 keeps, in order and with v12's names; each one the service keeps is a symbol of its own
 *   (its definition and its only reference), also when another category has the same name;
 * - plots: the named plots, in order and with v12's names, are `plot` definitions; each one the
 *   service keeps is a symbol of its own, also when another plot has the same name (v12 keeps
 *   both: two colours, two legend rows);
 * - rename read back by v12: the first category and the first plot the service can rename,
 *   renamed to a name with a blank (so a bare one gains quotes), change only that category or
 *   that plot's name in v12's DB;
 * - folding: a multi-line v12 `accDescr` is an `accDescr` fold.
 *
 * The service gets the facet as an eager row, as a host bundling it would, until xychart's
 * manifest has its `language` entry (#513); the last test then fails: drop the row.
 */
const service = createLanguageService({
  facets: [
    { type: 'xychart', id: 'xychart', detector: (t) => detectXyChart(t), facet: xyChartLanguage },
  ],
});
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);
const NEW_NAME = 'Renamed Zq7';

function apply(source: string, edits: readonly TextEdit[]): string {
  let out = source;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

describe('xychart symbols and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const v12 = async (source: string): Promise<XyChartSnapshot | undefined> => {
      const r = await oracle.parse(source);
      return r.accepted && r.diagramType === 'xychart' ? xyChartV12Snapshot(r.db) : undefined;
    };
    const problems: string[] = [];
    let checked = 0;
    let categories = 0;
    let plots = 0;
    let renames = 0;
    let folds = 0;
    for (const item of await xyChartGateCorpus()) {
      const model = await v12(item.source);
      if (!model) continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'xychart') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const parsed = parseXyChart(item.source);
      const symbols = parsed.symbols;

      // Categories: those of the last band `x-axis`, each a symbol of its own.
      const bands = parsed.ast.children.filter(
        (n): n is XyChartAxisNode => n.type === 'Axis' && n.categories !== undefined
      );
      const band = bands[bands.length - 1];
      if (model.xAxis.type === 'band' && band) {
        const own = symbols.filter(
          (s) =>
            s.kind === 'category' &&
            band.range.start <= s.range.start &&
            s.range.end <= band.range.end
        );
        if (JSON.stringify(own.map((s) => s.name)) !== JSON.stringify(model.xAxis.categories))
          fail(`categories ${JSON.stringify(own.map((s) => s.name))} are not v12's`);
        for (const s of own) {
          const ref = doc.references(s.range.start);
          if (ref.length === 0) continue;
          categories++;
          const d = doc.definition(s.range.start);
          if (ref.length !== 1 || !d || d.start !== ref[0]!.start || text(doc, d) !== s.name)
            fail(`category ${s.name} at ${s.range.start} is not a symbol of its own`);
        }
      }

      // Plots: the named ones, in order, each a symbol of its own.
      const named = model.plots.map((p) => p.title).filter((t) => t !== '');
      const plotSymbols = symbols.filter((s) => s.kind === 'plot');
      if (JSON.stringify(plotSymbols.map((s) => s.name)) !== JSON.stringify(named))
        fail(`plots ${JSON.stringify(plotSymbols.map((s) => s.name))} are not v12's named plots`);
      for (const s of plotSymbols) {
        const ref = doc.references(s.range.start);
        if (ref.length === 0) continue;
        plots++;
        const d = doc.definition(s.range.start);
        if (ref.length !== 1 || !d || d.start !== ref[0]!.start || text(doc, d) !== s.name)
          fail(`plot ${s.name} at ${s.range.start} is not a symbol of its own`);
      }

      // Rename, read back by v12.
      const category = symbols.find(
        (s) => s.kind === 'category' && doc.references(s.range.start).length > 0
      );
      const lastBand = band && category && band.range.start <= category.range.start;
      if (category && lastBand && model.xAxis.type === 'band') {
        const at = band.categories!.findIndex((c) => c.range.start === category.range.start);
        const r = doc.rename(category.range.start + 1, NEW_NAME);
        if ('refused' in r) fail(`category ${category.name}: ${r.refused}`);
        else {
          renames++;
          const after = await v12(apply(item.source, r.edits));
          const want = model.xAxis.categories.map((c, i) => (i === at ? NEW_NAME : c));
          if (
            after?.xAxis.type !== 'band' ||
            JSON.stringify(after.xAxis.categories) !== JSON.stringify(want)
          )
            fail(`category ${category.name}: v12 reads ${JSON.stringify(after?.xAxis)}`);
        }
      }
      const plot = plotSymbols.find((s) => doc.references(s.range.start).length > 0);
      if (plot) {
        const r = doc.rename(plot.range.start + 1, NEW_NAME);
        if ('refused' in r) fail(`plot ${plot.name}: ${r.refused}`);
        else {
          renames++;
          const after = await v12(apply(item.source, r.edits));
          const at = plotSymbols.indexOf(plot);
          let nth = -1;
          const want = model.plots.map((p) =>
            p.title !== '' && ++nth === at ? NEW_NAME : p.title
          );
          if (JSON.stringify(after?.plots.map((p) => p.title)) !== JSON.stringify(want))
            fail(
              `plot ${plot.name}: v12 reads ${JSON.stringify(after?.plots.map((p) => p.title))}`
            );
        }
      }

      if (/[\r\n]/.test(model.accDescr)) {
        folds++;
        if (!doc.foldingRanges().some((f) => f.kind === 'accDescr'))
          fail('a multi-line accDescr has no fold range');
      }
    }
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(300);
    expect(categories).toBeGreaterThan(500);
    expect(plots).toBeGreaterThan(50);
    expect(renames).toBeGreaterThan(200);
    expect(folds).toBeGreaterThan(5);
  }, 600_000);

  it('gets the facet from the eager row until the manifest has `language` (#513)', () => {
    expect(firstPartyFacets.find((e) => e.type === 'xychart')?.load).toBeUndefined();
    expect(service.update('x:///c', 'xychart\n  bar [1]').facet?.id).toBe('xychart');
  });
});
