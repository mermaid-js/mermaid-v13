import { describe, expect, it } from 'vitest';
import { parseTimeline } from '@mermaid-js/diagram-timeline';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { timelineGateCorpus } from './corpus.ts';
import { timelineV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for timeline (language.md
 * step 8, D99 suite 2, R-LANG-1, #318), checked against the mermaid v12 DB over the timeline
 * gate corpus:
 * - no symbols (D259): at every section, period and event, definition is none, references are
 *   empty and rename is refused;
 * - folding by section: every period v12 puts in a section sits in exactly one `section` fold,
 *   the one starting at a `section` v12 gave that name (a repeated name is matched by name);
 *   every period v12 puts before the first section sits in none; section folds never overlap.
 *
 * The service loads the facet through the generated registry row (timeline's manifest
 * `language` entry, #315).
 */
const service = createLanguageService();
await service.preload({ types: ['timeline'] });

describe('timeline symbols and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let inSections = 0;
    for (const item of await timelineGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'timeline') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'timeline') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const model = timelineV12Snapshot(v12.db);
      const parsed = parseTimeline(item.source);
      if (parsed.symbols.length > 0) fail(`${parsed.symbols.length} symbols`);
      for (const node of parsed.ast.children) {
        if (node.type === 'Header') continue;
        const at = node.range.start + 1;
        if (doc.definition(at)) fail(`${node.id}: a definition`);
        if (doc.references(at).length > 0) fail(`${node.id}: references`);
        if (!('refused' in doc.prepareRename(at))) fail(`${node.id}: rename not refused`);
      }
      const folds = doc.foldingRanges().filter((f) => f.kind === 'section');
      for (let k = 1; k < folds.length; k++) {
        if (folds[k]!.range.start < folds[k - 1]!.range.end) fail('section folds overlap');
      }
      const sectionAt = new Map(
        parsed.ast.children
          .filter((n) => n.type === 'Section')
          .map((n, k) => [n.range.start, parsed.model.sections[k]?.text])
      );
      const periods = parsed.ast.children.filter((n) => n.type === 'Period');
      if (periods.length !== model.periods.length) {
        fail(`${periods.length} periods, v12 ${model.periods.length}`);
        continue;
      }
      periods.forEach((node, i) => {
        const want = model.periods[i]!.section;
        const holding = folds.filter(
          (f) => f.range.start <= node.range.start && node.range.end <= f.range.end
        );
        if (want === '') {
          if (holding.length > 0) fail(`${node.id} is in a section fold, v12 has none`);
          return;
        }
        inSections++;
        const name = holding.length === 1 ? sectionAt.get(holding[0]!.range.start) : undefined;
        if (name !== want) fail(`${node.id}: in ${holding.length} folds (${name}), v12 ${want}`);
      });
    }
    expect(checked).toBeGreaterThan(150);
    expect(inSections).toBeGreaterThan(300);
    expect(problems).toEqual([]);
  }, 300_000);

  it('loads the facet from the generated registry (#315)', () => {
    const row = firstPartyFacets.find((e) => e.type === 'timeline');
    expect(row?.load).toBeTypeOf('function');
    expect(service.update('x:///t', 'timeline\n  2002 : a').facet?.id).toBe('timeline');
  });
});
