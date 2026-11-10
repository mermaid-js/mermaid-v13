import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseWardley } from '@mermaid-js/diagram-wardley';
import type { WardleyLinkNode, WardleyPipelineNode } from '@mermaid-js/diagram-wardley';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadDivergences } from '../divergences.ts';
import { loadOracle } from '../oracle.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
import { wardleyGateCorpus } from './corpus.ts';
import { wardleyV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for wardley (language.md step 8,
 * D99 suite 2, R-LANG-1, #500), as `radar/service-symbols.spec.ts` does for radar: definition,
 * references and folding asked at the places the parse output records, checked against the
 * mermaid v12 DB over the wardley gate corpus (D427):
 * - every v12 node label (anchors, components, pipeline components) resolves, from each of its
 *   occurrences, to one definition, its first `anchor` or `component`; references from any
 *   occurrence give the same list, with that definition in it;
 * - every `def` the parser records is a v12 node label, or a pipeline component whose node a
 *   later one of the same id took over (v12 keeps the later label), so a name nothing declares
 *   is no definition;
 * - each end of a v12 link that names a node, asked where the link writes it, resolves to the
 *   declaration of that node's label (a link to a pipeline component by its label included);
 * - a multi-line v12 `accDescr` is an `accDescr` fold, and a pipeline written over lines is a
 *   `pipeline` fold.
 *
 * Sources with a listed model divergence (`divergences/`: an entity name core's table
 * lacks) are left out: their labels differ from v12's by design.
 *
 * The service loads the facet through the generated registry row (wardley's manifest
 * `language` entry, #497).
 */
const service = createLanguageService();
await service.preload({ types: ['wardley'] });
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);
const DIVERGENT = new Set(
  loadDivergences(fileURLToPath(DIVERGENCES_DIR))
    .filter((d) => d.kind === 'model')
    .map((d) => d.id)
);

describe('wardley definition, references and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let names = 0;
    let ends = 0;
    let folds = 0;
    for (const item of await wardleyGateCorpus()) {
      if (DIVERGENT.has(item.id)) continue;
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'wardley') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'wardley') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const model = wardleyV12Snapshot(v12.db);
      const parsed = parseWardley(item.source);
      const labels = new Set(model.nodes.map((n) => n.label));
      const definitionOf = new Map<string, Range>();
      for (const name of labels) {
        const at = parsed.symbols.filter((s) => s.name === name);
        const first = at.find((s) => s.role === 'def');
        // A label written with an escape or an entity code has no occurrence (D191).
        if (!first || 'refused' in doc.prepareRename(first.range.start + 1)) continue;
        names++;
        const lists = new Set<string>();
        for (const o of at) {
          const d = doc.definition(o.range.start + 1);
          if (!d || text(doc, d) !== name) {
            fail(`${name}: definition ${d && JSON.stringify(text(doc, d))} at ${d?.start}`);
            continue;
          }
          definitionOf.set(name, d);
          lists.add(JSON.stringify(doc.references(o.range.start + 1)));
        }
        if (lists.size !== 1) fail(`${name}: references differ by occurrence`);
        const def = definitionOf.get(name);
        const refs = doc.references(first.range.start + 1);
        if (refs.length !== at.length || !refs.some((r) => r.start === def?.start))
          fail(`${name}: ${refs.length} references for ${at.length} occurrences`);
      }
      const ids = new Set(model.nodes.map((n) => n.id));
      const merged = new Set(
        parsed.ast.children.flatMap((n) =>
          n.type === 'Pipeline'
            ? n.children
                .filter((c) => ids.has(`${n.parent.value}_${c.name.value}`))
                .map((c) => c.name.value)
            : []
        )
      );
      for (const s of parsed.symbols) {
        if (s.role === 'def' && !labels.has(s.name) && !merged.has(s.name))
          fail(`${s.name} is defined but no v12 node`);
      }
      // Each link end v12 resolved to a node: where the link writes it, its definition is that
      // node's label's. An end written as the node id of a pipeline component (`Kettle_Gas`)
      // is two names, its parent's and its own (the round-trip spec renames them).
      const links = parsed.ast.children.filter((n): n is WardleyLinkNode => n.type === 'Link');
      if (links.length !== model.links.length) fail('the links differ from v12 in number');
      const byId = new Map(model.nodes.map((n) => [n.id, n.label]));
      links.forEach((link, i) => {
        const v = model.links[i];
        if (!v) return;
        for (const [end, id] of [
          [link.from, v.source],
          [link.to, v.target],
        ] as const) {
          const label = byId.get(id);
          const want = label === undefined ? undefined : definitionOf.get(label);
          if (!want || end.value !== label) continue;
          ends++;
          const d = doc.definition(end.range.start + 1);
          if (d?.start !== want.start)
            fail(`link ${i} end ${end.value}: definition at ${d?.start}, not ${want.start}`);
        }
      });
      const fold = (kind: string, r: Range) =>
        doc
          .foldingRanges()
          .some((f) => f.kind === kind && f.range.start <= r.start && r.end <= f.range.end);
      if (/[\r\n]/.test(model.accDescr) && !doc.foldingRanges().some((f) => f.kind === 'accDescr'))
        fail('a multi-line accDescr has no fold range');
      const pipelines = parsed.ast.children.filter(
        (n): n is WardleyPipelineNode => n.type === 'Pipeline'
      );
      for (const p of pipelines) {
        if (!/[\r\n]/.test(text(doc, p.range))) continue;
        folds++;
        if (!fold('pipeline', p.range)) fail(`pipeline ${p.parent.value} is in no pipeline fold`);
      }
    }
    expect(checked).toBeGreaterThan(400);
    expect(names).toBeGreaterThan(1000);
    expect(ends).toBeGreaterThan(1000);
    expect(folds).toBeGreaterThan(60);
    expect(problems).toEqual([]);
  }, 300_000);

  it('loads the facet from the generated registry, with the wardley-beta section (#497, D421)', () => {
    const row = firstPartyFacets.find((e) => e.type === 'wardley');
    expect(row?.load).toBeTypeOf('function');
    expect(row?.section).toBe('wardley-beta');
    expect(service.update('x:///w', 'wardley-beta\ncomponent A [0.5, 0.5]\n').facet?.id).toBe(
      'wardley'
    );
  });
});
