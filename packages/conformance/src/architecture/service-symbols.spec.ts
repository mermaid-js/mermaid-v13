import { describe, expect, it } from 'vitest';
import { parseArchitecture } from '@mermaid-js/diagram-architecture';
import type {
  ArchitectureAlignmentNode,
  ArchitectureEdgeNode,
} from '@mermaid-js/diagram-architecture';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { architectureGateCorpus } from './corpus.ts';
import { ARCHITECTURE_V12_TYPES, architectureV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for architecture (language.md
 * step 8, D99 suite 2, R-LANG-1, #619), as `wardley/service-symbols.spec.ts` does for wardley:
 * definition, references, rename and folding asked at the places the parse output records,
 * checked against the mermaid v12 DB over the architecture gate corpus (D508):
 * - the `def` symbols are v12's groups, services and junctions, one each, of the kind v12
 *   registered (`getGroups()`, `getServices()`, `getJunctions()`);
 * - every occurrence of an id resolves to that definition, and references from any occurrence
 *   give the same list, every occurrence in it;
 * - each end of each v12 edge and each member of each v12 `align`, asked where the statement
 *   writes it, resolves to the declaration of that id; each `in` to its group's;
 * - renaming an id to another v12 id of the diagram is refused (one namespace), and to a fresh
 *   name is not;
 * - an `accDescr { … }` written over lines is an `accDescr` fold.
 *
 * The service loads the facet through the generated registry row (architecture's manifest
 * `language` entry, #619).
 */
const service = createLanguageService();
await service.preload({ types: ['architecture'] });
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);

describe('architecture definition, references and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let ids = 0;
    let uses = 0;
    let clashes = 0;
    let folds = 0;
    for (const item of await architectureGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || !ARCHITECTURE_V12_TYPES.includes(v12.diagramType)) continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'architecture') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const model = architectureV12Snapshot(v12.db);
      const parsed = parseArchitecture(item.source);
      const kinds = new Map<string, string>([
        ...model.groups.map((g) => [g.id, 'group'] as const),
        ...model.services.map((s) => [s.id, 'service'] as const),
        ...model.junctions.map((j) => [j.id, 'junction'] as const),
      ]);
      const defs = parsed.symbols.filter((s) => s.role === 'def');
      if (defs.length !== kinds.size) fail(`${defs.length} definitions for ${kinds.size} v12 ids`);
      const definitionOf = new Map<string, Range>();
      for (const s of defs) {
        if (kinds.get(s.name) !== s.kind) fail(`${s.name}: ${s.kind}, v12 ${kinds.get(s.name)}`);
        definitionOf.set(s.name, s.range);
      }
      for (const [name, def] of definitionOf) {
        ids++;
        const at = parsed.symbols.filter((s) => s.name === name);
        const lists = new Set<string>();
        for (const o of at) {
          const d = doc.definition(o.range.start);
          if (d?.start !== def.start) fail(`${name}: definition at ${d?.start}, not ${def.start}`);
          lists.add(JSON.stringify(doc.references(o.range.start)));
        }
        if (lists.size !== 1) fail(`${name}: references differ by occurrence`);
        const refs = doc.references(def.start);
        if (refs.length !== at.length) fail(`${name}: ${refs.length} references for ${at.length}`);
        const fresh = doc.rename(def.start, 'renamedZq7');
        if ('refused' in fresh) fail(`${name}: fresh rename refused: ${fresh.refused}`);
        const other = [...kinds.keys()].find((k) => k !== name);
        if (other !== undefined) {
          clashes++;
          if (!('refused' in doc.rename(def.start, other))) fail(`${name} renamed to ${other}`);
        }
      }
      const resolves = (r: Range, id: string, what: string) => {
        uses++;
        const d = doc.definition(r.start);
        const want = definitionOf.get(id);
        if (!d || d.start !== want?.start || text(doc, d) !== id) {
          fail(`${what} ${id}: definition at ${d?.start}, not ${want?.start}`);
        }
      };
      const edges = parsed.ast.children.filter((n): n is ArchitectureEdgeNode => n.type === 'Edge');
      if (edges.length !== model.edges.length) fail('the edges differ from v12 in number');
      edges.forEach((e, i) => {
        const v = model.edges[i];
        if (!v) return;
        resolves(e.lhs.name.range, v.lhsId, `edge ${i} left`);
        resolves(e.rhs.name.range, v.rhsId, `edge ${i} right`);
      });
      const aligns = parsed.ast.children.filter(
        (n): n is ArchitectureAlignmentNode => n.type === 'Alignment'
      );
      aligns.forEach((a, i) => {
        const v = model.alignments[i];
        a.members.forEach((m, k) => {
          const id = v?.members[k];
          if (id === undefined) fail(`align ${i} member ${k}: none in v12`);
          else resolves(m.range, id, `align ${i} member`);
        });
      });
      for (const n of parsed.ast.children) {
        if ('parent' in n && n.parent) {
          const v = [...model.groups, ...model.services, ...model.junctions].find(
            (e) => e.id === n.name.value
          );
          resolves(n.parent.range, v?.in ?? '', `${n.name.value} in`);
        }
      }
      // v12 accepted the source, so each `accDescr { … }` written over lines is v12's block.
      for (const n of parsed.ast.children) {
        if (n.type !== 'AccDescr' || !/[\r\n]/.test(text(doc, n.range))) continue;
        folds++;
        const folded = doc
          .foldingRanges()
          .some((f) => f.kind === 'accDescr' && f.range.start === n.range.start);
        if (!folded) fail(`the accDescr at ${n.range.start} has no fold range`);
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(ids).toBeGreaterThan(1000);
    expect(uses).toBeGreaterThan(1500);
    expect(clashes).toBeGreaterThan(1000);
    expect(folds).toBeGreaterThan(5);
    expect(problems).toEqual([]);
  }, 300_000);

  it('loads the facet from the generated registry', () => {
    const row = firstPartyFacets.find((e) => e.type === 'architecture');
    expect(row?.load).toBeTypeOf('function');
    expect(row?.section).toBe('architecture');
    expect(service.update('x:///a', 'architecture-beta\nservice a\n').facet?.id).toBe(
      'architecture'
    );
  });
});
