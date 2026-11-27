import { describe, expect, it } from 'vitest';
import { parsePie } from '@mermaid-js/diagram-pie';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { pieGateCorpus } from './corpus.ts';
import { pieV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for pie (language.md step 8,
 * D99 suite 2, R-LANG-1, #307), as `er/service-symbols.spec.ts` does for ER: definition,
 * references and folding asked at the places the parse output records, checked against the
 * mermaid v12 DB over the pie gate corpus:
 * - every v12 section label resolves to exactly one definition, the text between the quotes
 *   of its first occurrence (D226: the first value wins), and references from any of its
 *   occurrences give the same list, with that definition in it (D229);
 * - every definition is a v12 section label: as many as v12 has sections, less the negative
 *   ones v13 leaves out (v12 rejects those texts, so none is checked here);
 * - a multi-line v12 `accDescr` is an `accDescr` fold range.
 *
 * A label whose text between the quotes is not its name is not a service occurrence, so a
 * rename could not keep it: an escape (`"a\"b"`), an entity (`#amp;`), a quote v12 turned
 * inside a tag, a comment line or CRLF inside the label (counted in {@link ESCAPED}).
 *
 * The service loads the facet through the generated registry row (pie's manifest `language`
 * entry, #325).
 */

/**
 * v12 section labels written otherwise than their name in the corpus (skipped above); #1368's
 * two label-syntax fixtures added six.
 */
const ESCAPED = 53;

const service = createLanguageService();
await service.preload({ types: ['pie'] });
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);

describe('pie definition, references and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let labels = 0;
    let escaped = 0;
    for (const item of await pieGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'pie') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'pie') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const model = pieV12Snapshot(v12.db);
      const parsed = parsePie(item.source);
      const defs = new Set<number>();
      for (const [label] of model.sections) {
        // The service has no symbol for an empty name (`"" : 1`), for any type.
        if (label === '') continue;
        labels++;
        const at = parsed.symbols.filter(
          (s) => s.name === label && [`"${label}"`, `'${label}'`].includes(text(doc, s.range))
        );
        if (at.length === 0) {
          if (parsed.symbols.some((s) => s.name === label)) escaped++;
          else fail(`section ${JSON.stringify(label)} has no occurrence`);
          continue;
        }
        const first = at[0]!.range.start + 1;
        const lists = new Set<string>();
        for (const o of at) {
          const cursor = o.range.start + 1;
          const d = doc.definition(cursor);
          if (!d || d.start !== first || text(doc, d) !== label)
            fail(`${label}: definition ${d && JSON.stringify(text(doc, d))} at ${d?.start}`);
          lists.add(JSON.stringify(doc.references(cursor)));
        }
        if (lists.size !== 1) fail(`${label}: references differ by occurrence`);
        const refs = doc.references(first);
        if (refs.length !== at.length || !refs.some((r) => r.start === first))
          fail(`${label}: ${refs.length} references for ${at.length} occurrences`);
        defs.add(first);
      }
      for (const s of parsed.symbols) {
        const d = doc.definition(s.range.start + 1);
        if (d && !defs.has(d.start) && !model.sections.some(([l]) => l === s.name))
          fail(`${s.name} is defined but is no v12 section`);
      }
      const multiLine = /[\r\n]/.test(model.accDescr);
      const fold = doc.foldingRanges().some((f) => f.kind === 'accDescr');
      if (multiLine && !fold) fail('a multi-line accDescr has no fold range');
    }
    expect(checked).toBeGreaterThan(300);
    expect(labels).toBeGreaterThan(500);
    expect(escaped).toBe(ESCAPED);
    expect(problems).toEqual([]);
  }, 300_000);

  it('loads the facet from the generated registry (#325)', () => {
    const row = firstPartyFacets.find((e) => e.type === 'pie');
    expect(row?.load).toBeTypeOf('function');
    expect(service.update('x:///p', 'pie\n"a": 1').facet?.id).toBe('pie');
  });
});
