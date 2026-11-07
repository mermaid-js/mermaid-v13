import { describe, expect, it } from 'vitest';
import { parseCynefin } from '@mermaid-js/diagram-cynefin';
import { CynefinTokenKind as T, cynefinTokens } from '@mermaid-js/diagram-cynefin/testing';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { cynefinGateCorpus } from './corpus.ts';
import { CYNEFIN_V12_TYPES, cynefinV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for cynefin (language.md step 8,
 * D99 suite 2, R-LANG-1, #470), as `pie/service-symbols.spec.ts` does for pie: definition,
 * references, rename and folding asked at the places the parse output records, checked against
 * the mermaid v12 DB over the cynefin gate corpus:
 * - every v12 domain resolves to exactly one definition, the name of its first block (D367:
 *   v12 keeps the first position of a domain, D364), and references from any of its
 *   occurrences (every block, both ends of every transition) give the same list, with that
 *   definition in it;
 * - only a v12 domain has a definition: a domain no block declares (named only by
 *   transitions) has a `def` occurrence nowhere and `definition()` gives nothing at any of its
 *   mentions, while `references()` still lists them all;
 * - rename is refused at every occurrence: the five names are fixed (D367);
 * - the block v12 draws folds over exactly the items v12 keeps, when it spans lines, and a
 *   multi-line v12 `accDescr` is an `accDescr` fold range.
 *
 * The service loads the facet through the generated registry row (cynefin's manifest
 * `language` entry, #469).
 */

const service = createLanguageService();
await service.preload({ types: ['cynefin'] });
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);
const LINE_BREAK = /[\r\n]/;

describe('cynefin definition, references, rename and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let domains = 0;
    let folds = 0;
    let undeclared = 0;
    for (const item of await cynefinGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || !CYNEFIN_V12_TYPES.includes(v12.diagramType)) continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'cynefin') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const model = cynefinV12Snapshot(v12.db);
      const parsed = parseCynefin(item.source);
      const declared = new Set(model.domains.map(([name]) => name));
      const blocks = parsed.ast.children.filter((n) => n.type === 'Domain');
      for (const [name, items] of model.domains) {
        domains++;
        const at = parsed.symbols.filter((s) => s.name === name && text(doc, s.range) === name);
        const mine = blocks.filter((b) => b.name === name);
        const first = mine[0]?.nameRange.start;
        if (at.length === 0 || first === undefined) {
          fail(`domain ${name} has no occurrence or block`);
          continue;
        }
        const lists = new Set<string>();
        for (const o of at) {
          const d = doc.definition(o.range.start);
          if (d?.start !== first) fail(`${name}: definition at ${d?.start}, want ${first}`);
          lists.add(JSON.stringify(doc.references(o.range.start)));
          const r = doc.rename(o.range.start, 'renamed');
          if (!('refused' in r)) fail(`${name}: rename at ${o.range.start} not refused`);
        }
        if (lists.size !== 1) fail(`${name}: references differ by occurrence`);
        const refs = doc.references(first);
        if (refs.length !== at.length || !refs.some((r) => r.start === first))
          fail(`${name}: ${refs.length} references for ${at.length} occurrences`);
        // The drawn block: the last one, holding exactly v12's items.
        const last = mine[mine.length - 1]!;
        const span = { start: last.nameRange.start, end: last.range.end };
        if (!LINE_BREAK.test(text(doc, span))) continue;
        const fold = doc
          .foldingRanges()
          .find((f) => f.kind === 'domain' && f.range.start === span.start);
        if (!fold) {
          fail(`${name}: the drawn block spans lines but has no fold`);
          continue;
        }
        folds++;
        const strings = cynefinTokens(item.source).filter(
          (t) =>
            t.kind === T.String &&
            t.range.start >= fold.range.start &&
            t.range.end <= fold.range.end
        );
        if (strings.length !== items.length)
          fail(`${name}: fold holds ${strings.length} items, v12 ${items.length}`);
      }
      for (const s of parsed.symbols) {
        if (declared.has(s.name)) continue;
        undeclared++;
        if (s.role === 'def') fail(`${s.name} is defined but no v12 domain`);
        const d = doc.definition(s.range.start);
        if (d) fail(`${s.name} at ${s.range.start}: definition at ${d.start}, but no v12 domain`);
        const mentions = parsed.symbols.filter((x) => x.name === s.name).length;
        if (doc.references(s.range.start).length !== mentions)
          fail(`${s.name} at ${s.range.start}: references miss some of its ${mentions} mentions`);
      }
      const multiLine = LINE_BREAK.test(model.accDescr);
      const fold = doc.foldingRanges().some((f) => f.kind === 'accDescr');
      if (multiLine && !fold) fail('a multi-line accDescr has no fold range');
    }
    expect(checked).toBeGreaterThan(300);
    expect(domains).toBeGreaterThan(400);
    expect(folds).toBeGreaterThan(300);
    expect(undeclared).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  }, 300_000);

  it('loads the facet from the generated registry (#469)', () => {
    const row = firstPartyFacets.find((e) => e.type === 'cynefin');
    expect(row?.load).toBeTypeOf('function');
    expect(service.update('x:///c', 'cynefin-beta\n  complex\n').facet?.id).toBe('cynefin');
  });
});
