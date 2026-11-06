import { describe, expect, it } from 'vitest';
import { parseRadar } from '@mermaid-js/diagram-radar';
import type { RadarCurveNode } from '@mermaid-js/diagram-radar';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { radarGateCorpus } from './corpus.ts';
import { radarV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for radar (language.md step 8,
 * D99 suite 2, R-LANG-1, #450), as `pie/service-symbols.spec.ts` does for pie: definition,
 * references and folding asked at the places the parse output records, checked against the
 * mermaid v12 DB over the radar gate corpus (D358):
 * - every v12 axis name resolves, from each of its occurrences (its `axis` statements and the
 *   detailed entries naming it), to one definition, its first `axis`; references from any
 *   occurrence give the same list, with that definition in it;
 * - every v12 curve name resolves to its first curve, in a namespace of its own (an axis and a
 *   curve may share a name);
 * - every `def` the parser records is a v12 axis or curve, so an entry naming no axis is no
 *   definition (an unresolved reference);
 * - a multi-line v12 `accDescr` is an `accDescr` fold, and a curve written over lines is
 *   inside a `curve` fold.
 *
 * The service loads the facet through the generated registry row (radar's manifest `language`
 * entry, #449).
 */
const service = createLanguageService();
await service.preload({ types: ['radar'] });
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);

describe('radar definition, references and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let names = 0;
    let folds = 0;
    for (const item of await radarGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'radar') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'radar') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const model = radarV12Snapshot(v12.db);
      const parsed = parseRadar(item.source);
      const groups: [kind: string, names: string[]][] = [
        ['axis', model.axes.map((a) => a.name)],
        ['curve', model.curves.map((c) => c.name)],
      ];
      for (const [kind, list] of groups) {
        for (const name of new Set(list)) {
          names++;
          const at = parsed.symbols.filter((s) => s.kind === kind && s.name === name);
          const first = at.find((s) => s.role === 'def');
          if (!first) {
            fail(`${kind} ${name} has no definition`);
            continue;
          }
          const lists = new Set<string>();
          for (const o of at) {
            const d = doc.definition(o.range.start);
            if (!d || d.start !== first.range.start || text(doc, d) !== name)
              fail(
                `${kind} ${name}: definition ${d && JSON.stringify(text(doc, d))} at ${d?.start}`
              );
            lists.add(JSON.stringify(doc.references(o.range.start)));
          }
          if (lists.size !== 1) fail(`${kind} ${name}: references differ by occurrence`);
          const refs = doc.references(first.range.start);
          if (refs.length !== at.length || !refs.some((r) => r.start === first.range.start))
            fail(`${kind} ${name}: ${refs.length} references for ${at.length} occurrences`);
        }
      }
      for (const s of parsed.symbols) {
        const known = groups.find(([k]) => k === s.kind)?.[1] ?? [];
        if (s.role === 'def' && !known.includes(s.name))
          fail(`${s.kind} ${s.name} is defined but is no v12 ${s.kind}`);
      }
      const fold = (kind: string, r: Range) =>
        doc
          .foldingRanges()
          .some((f) => f.kind === kind && f.range.start <= r.start && r.end <= f.range.end);
      const multiLine = (r: Range) => /[\r\n]/.test(text(doc, r));
      if (/[\r\n]/.test(model.accDescr) && !doc.foldingRanges().some((f) => f.kind === 'accDescr'))
        fail('a multi-line accDescr has no fold range');
      for (const c of parsed.ast.children.filter((n): n is RadarCurveNode => n.type === 'Curve')) {
        if (!multiLine(c.range)) continue;
        folds++;
        if (!fold('curve', c.range)) fail(`the multi-line curve ${c.name} is in no curve fold`);
      }
    }
    expect(checked).toBeGreaterThan(400);
    expect(names).toBeGreaterThan(800);
    expect(folds).toBeGreaterThan(20);
    expect(problems).toEqual([]);
  }, 300_000);

  it('loads the facet from the registry row of the manifest `language` entry', () => {
    const row = firstPartyFacets.find((e) => e.type === 'radar');
    expect(row?.load).toBeTypeOf('function');
    expect(service.update('x:///r', 'radar-beta\naxis A').facet?.id).toBe('radar');
  });
});
