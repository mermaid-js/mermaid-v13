import { describe, expect, it } from 'vitest';
import { parseQuadrant } from '@mermaid-js/diagram-quadrant';
import { quadrantLanguage } from '@mermaid-js/diagram-quadrant/language';
import type { Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { resolveCorpus } from '../corpus.ts';
import { PARITY_SUITES } from '../registry.ts';
import { QUADRANT_V12_TYPES, quadrantV12Snapshot } from './v12.ts';
import { quadrantAdapter } from './v13.ts';

/**
 * The quadrant oracle expectations through the language service (D99 suite 2, R-LANG-1, the
 * pattern of `class/service-symbols.spec.ts`): definition, references and folding ranges asked
 * where the parse output records class names, checked against mermaid v12's quadrant DB over
 * the parity corpus:
 * - every v12 class (`classDef`) resolves, from each of its occurrences, to exactly one
 *   definition holding its name, references give the same list from each, with that
 *   definition in it; a name that resolves to a `classDef` occurrence is a v12 class;
 * - every point's class (`:::`) is a reference to that name;
 * - a description v12 stored with a line break in it has an `accDescr` fold range.
 *
 * The facet is passed to the service directly: quadrantChart has no manifest yet (T5, #317).
 */

const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);

describe('quadrant definition, references and folding through the service match v12', () => {
  it('over the parity corpus', async () => {
    const oracle = await loadOracle();
    const service = createLanguageService({
      facets: [
        {
          type: 'quadrantChart',
          id: 'quadrantChart',
          section: 'quadrantChart',
          detector: (t) => /^\s*quadrantChart/.test(t),
          facet: quadrantLanguage,
        },
      ],
    });
    await service.preload({ types: ['quadrantChart'] });
    const suite = PARITY_SUITES.filter((s) => s.adapter === quadrantAdapter);
    const problems: string[] = [];
    let checked = 0;
    let names = 0;
    let folds = 0;
    for await (const item of resolveCorpus({}, suite)) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || !QUADRANT_V12_TYPES.includes(v12.diagramType)) continue;
      // Read now: the snapshot is built from the calls of the oracle's last parse.
      const model = quadrantV12Snapshot(v12.db);
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'quadrantChart') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string): undefined => {
        problems.push(`${item.id}: ${what}`);
      };
      const parsed = parseQuadrant(item.source);
      const occurrences = (name: string): SymbolOccurrence[] =>
        parsed.symbols.filter((s) => s.name === name && s.kind === 'class');

      const classes = new Set(model.classes.map(([name]) => name));
      for (const name of classes) {
        const at = occurrences(name);
        if (at.length === 0) {
          fail(`class ${name} has no occurrence`);
          continue;
        }
        names++;
        const defs = new Set<string>();
        const refLists = new Set<string>();
        let def: Range | undefined;
        for (const o of at) {
          const d = doc.definition(o.range.start);
          if (!d || text(doc, d) !== name) {
            fail(`${name}: definition ${d && text(doc, d)}`);
            continue;
          }
          defs.add(`${d.start}:${d.end}`);
          def = d;
          const refs = doc.references(o.range.start);
          if (refs.some((r) => text(doc, r) !== name)) fail(`${name}: a reference is not ${name}`);
          refLists.add(JSON.stringify(refs));
        }
        if (defs.size !== 1) fail(`${name}: ${defs.size} definitions`);
        if (refLists.size !== 1) fail(`${name}: references differ by occurrence`);
        const refs = doc.references(at[0]!.range.start);
        if (def && !refs.some((r) => r.start === def.start))
          fail(`${name}: definition not referenced`);
      }
      // A `:::` name with no `classDef` resolves to no definition occurrence.
      const defStarts = new Set(
        parsed.symbols.filter((x) => x.role === 'def').map((x) => x.range.start)
      );
      for (const s of parsed.symbols) {
        const d = doc.definition(s.range.start);
        if (d && defStarts.has(d.start) && !classes.has(s.name))
          fail(`${s.name} is defined but is no v12 class`);
      }
      for (const p of model.points) {
        if (p.className === '') continue;
        const refs = occurrences(p.className).filter((s) => s.role === 'ref');
        if (refs.length === 0) fail(`point class ${p.className} has no reference`);
      }

      if (/[\r\n]/.test(model.accDescr)) {
        folds++;
        const fold = doc.foldingRanges().find((f) => f.kind === 'accDescr');
        if (!fold) fail('multi-line accDescr has no fold range');
        else if (!/^accDescr\s*\{/.test(text(doc, fold.range))) fail('accDescr fold range');
      }
    }
    expect(checked).toBeGreaterThan(60);
    expect(names).toBeGreaterThan(10);
    expect(folds).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  }, 180_000);
});
