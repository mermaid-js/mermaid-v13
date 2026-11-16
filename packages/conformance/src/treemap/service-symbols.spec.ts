import { describe, expect, it } from 'vitest';
import { parseTreemap } from '@mermaid-js/diagram-treemap';
import type { TreemapRowNode } from '@mermaid-js/diagram-treemap';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { fileURLToPath } from 'node:url';
import { modelDivergenceIds } from '../divergences.ts';
import { loadOracle } from '../oracle.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
import { treemapGateCorpus } from './corpus.ts';
import { treemapV12Snapshot } from './v12.ts';
import type { TreemapNodeSnapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for treemap (language.md step 8,
 * D99 suite 2, R-LANG-1, #511), as `radar/service-symbols.spec.ts` does for radar: definition,
 * references and folding asked at the places the parse output records, checked against the
 * mermaid v12 DB over the treemap gate corpus (D408):
 * - v12's rows, depth first, are the parser's `node` definitions in source order, by name, and
 *   each resolves to itself alone: its definition is its own name, its only reference itself
 *   (names repeat, and each row is a node of its own);
 * - every v12 class resolves, from each of its occurrences (its `classDef`s and every
 *   `:::name`), to one definition, its first `classDef`; references from any occurrence give
 *   the same list, with that definition in it; a `:::name` v12 has no class for has no
 *   definition, and every class `def` is a v12 class;
 * - each v12 section with rows written over several lines has a `section` fold from its name to
 *   the end of its last row, and a multi-line v12 `accDescr` an `accDescr` fold.
 *
 * The service loads the facet through the generated registry row (treemap's manifest
 * `language` entry, #514).
 *
 * Sources with a listed model divergence (`divergences/`: a `#name;` kept as written, D561) are
 * left out: their names differ from v12's by design.
 */
const DIVERGENT = modelDivergenceIds(fileURLToPath(DIVERGENCES_DIR));
const service = createLanguageService();
await service.preload({ types: ['treemap'] });
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);

/** v12's rows depth first (source order), each with its last row (itself, or a descendant). */
function depthFirst(nodes: readonly TreemapNodeSnapshot[]): TreemapNodeSnapshot[] {
  return nodes.flatMap((n) => [n, ...depthFirst(n.children ?? [])]);
}
const size = (n: TreemapNodeSnapshot): number =>
  1 + (n.children ?? []).reduce((sum, c) => sum + size(c), 0);

describe('treemap definition, references and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let rows = 0;
    let classes = 0;
    let folds = 0;
    let unnamed = 0;
    for (const item of await treemapGateCorpus()) {
      if (DIVERGENT.has(item.id)) continue;
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'treemap') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'treemap') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const model = treemapV12Snapshot(v12.db);
      const parsed = parseTreemap(item.source);
      const order = depthFirst(model.roots);
      const defs = parsed.symbols.filter((s) => s.kind === 'node');
      const astRows = parsed.ast.children.filter(
        (n): n is TreemapRowNode => n.type === 'Section' || n.type === 'Leaf'
      );
      if (defs.length !== order.length || astRows.length !== order.length) {
        fail(`${order.length} v12 rows, ${defs.length} node symbols, ${astRows.length} rows`);
        continue;
      }
      const folding = doc.foldingRanges();
      order.forEach((n, i) => {
        rows++;
        const s = defs[i]!;
        if (s.name !== n.name || s.role !== 'def')
          fail(`row ${i}: ${s.role} ${s.name} for ${n.name}`);
        // Inside the quotes: the occurrence is the text between them (D191). A name not written
        // as v12 reads it (an entity placeholder, a tag quote) or empty is no occurrence at all.
        const own = doc.definition(s.range.start + 1);
        if (n.name === '' || text(doc, s.range).slice(1, -1) !== n.name) {
          unnamed++;
          if (own) fail(`row ${n.name}: written otherwise, but it has a definition`);
        } else {
          if (!own || text(doc, own) !== n.name)
            fail(`row ${n.name}: definition ${JSON.stringify(own)}`);
          const refs = doc.references(s.range.start + 1);
          if (refs.length !== 1 || refs[0]?.start !== own?.start)
            fail(`row ${n.name}: ${refs.length} references`);
        }
        if (!n.children?.length) return;
        const first = astRows[i]!;
        const last = astRows[i + size(n) - 1]!;
        const range = { start: first.range.start, end: last.range.end };
        if (!/[\r\n]/.test(text(doc, range))) return;
        folds++;
        if (
          !folding.some(
            (f) =>
              f.kind === 'section' && f.range.start === range.start && f.range.end === range.end
          )
        )
          fail(`the section ${n.name} has no fold over its rows`);
      });
      const known = new Set(model.classes.map((c) => c.id));
      for (const name of known) {
        classes++;
        const at = parsed.symbols.filter((s) => s.kind === 'class' && s.name === name);
        const first = at.find((s) => s.role === 'def');
        if (!first) {
          fail(`class ${name} has no definition`);
          continue;
        }
        const lists = new Set<string>();
        for (const o of at) {
          const d = doc.definition(o.range.start);
          if (!d || d.start !== first.range.start || text(doc, d) !== name)
            fail(`class ${name}: definition ${d && JSON.stringify(text(doc, d))} at ${d?.start}`);
          lists.add(JSON.stringify(doc.references(o.range.start)));
        }
        if (lists.size !== 1) fail(`class ${name}: references differ by occurrence`);
        const refs = doc.references(first.range.start);
        if (refs.length !== at.length || !refs.some((r) => r.start === first.range.start))
          fail(`class ${name}: ${refs.length} references for ${at.length} occurrences`);
      }
      for (const s of parsed.symbols) {
        if (s.kind !== 'class') continue;
        if (s.role === 'def' && !known.has(s.name))
          fail(`class ${s.name} is defined but is no v12 class`);
        if (!known.has(s.name) && doc.definition(s.range.start))
          fail(`:::${s.name} names no v12 class but has a definition`);
      }
      if (/[\r\n]/.test(model.accDescr) && !folding.some((f) => f.kind === 'accDescr'))
        fail('a multi-line accDescr has no fold range');
    }
    expect(checked).toBeGreaterThan(500);
    expect(rows).toBeGreaterThan(1500);
    expect(classes).toBeGreaterThan(150);
    expect(folds).toBeGreaterThan(400);
    // Entity placeholders, tag quotes and empty names, each also CRLF and commented.
    expect(unnamed).toBeLessThan(60);
    expect(problems).toEqual([]);
  }, 300_000);

  it('loads the facet from the generated registry (#514)', () => {
    const row = firstPartyFacets.find((e) => e.type === 'treemap');
    expect(row?.load).toBeTypeOf('function');
    expect(service.update('x:///t', 'treemap\n"a": 1\n').facet?.id).toBe('treemap');
  });
});
