import { describe, expect, it } from 'vitest';
import { parseEr } from '@mermaid-js/diagram-er';
import type { ErSubgraphNode } from '@mermaid-js/diagram-er';
import type { AstNode, Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { resolveCorpus } from '../corpus.ts';
import { PARITY_SUITES } from '../registry.ts';
import { erV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for ER (language.md step 8,
 * D99 suite 2, R-LANG-1), as `flowchart/service-symbols.spec.ts` does for the flowchart:
 * definition, references and folding ranges asked at the places the parse output records,
 * checked against the mermaid v12 model over the ER parity corpus:
 * - every v12 entity and class resolves to exactly one definition, holding its name, and references from any of its occurrences give
 *   the same list, with that definition in it; a name written quoted (`"Customer Domain"`)
 *   resolves like one written bare, its definition the text between the quotes (#199);
 * - a name resolving to a `def` in the entity namespace is a v12 entity or subgraph;
 * - every v12 subgraph's definition is on one of its own `subgraph` lines;
 * - each multi-line v12 subgraph body is a `subgraph` fold range, and each member entity has a
 *   reference inside one of its bodies.
 */

/** Names written quoted (`"Customer Domain"`) in the corpus that resolve (#199). */
const QUOTED_RESOLVED = 315;

const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);
const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;

function subgraphBodies(nodes: readonly AstNode[], into = new Map<string, Range[]>()) {
  for (const n of nodes) {
    if (n.type === 'Subgraph') {
      const sg = n as ErSubgraphNode;
      into.set(sg.name, [...(into.get(sg.name) ?? []), sg.range]);
    }
    if (n.children) subgraphBodies(n.children, into);
  }
  return into;
}

describe('ER definition, references and folding through the service match v12', () => {
  it('over the parity corpus', async () => {
    const oracle = await loadOracle();
    const service = createLanguageService();
    await service.preload({ types: ['er'] });
    const problems: string[] = [];
    let checked = 0;
    let quotedResolved = 0;
    for await (const item of resolveCorpus({}, PARITY_SUITES)) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'er') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'er') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      // Where to put the cursor on an occurrence: inside the quotes of a quoted one.
      const probe = (r: Range) => (/^["`]/.test(doc.text.charAt(r.start)) ? r.start + 1 : r.start);
      const fail = (what: string): undefined => {
        problems.push(`${item.id}: ${what}`);
      };
      const model = erV12Snapshot(v12.db);
      const parsed = parseEr(item.source);
      // Occurrences written bare or quoted: the parser gives a quoted one the quotes' range.
      const occurrences = (name: string, kinds: readonly string[]): SymbolOccurrence[] =>
        parsed.symbols.filter(
          (s) =>
            s.name === name &&
            kinds.includes(s.kind) &&
            [name, `"${name}"`].includes(text(doc, s.range))
        );

      /** The single definition and the references of `name`, asked at each occurrence. */
      const resolve = (name: string, kinds: readonly string[]): Range | undefined => {
        const at = occurrences(name, kinds);
        if (at.length === 0) return (fail(`${kinds[0]} ${name} has no occurrence`), undefined);
        const defs = new Set<string>();
        const refLists = new Set<string>();
        let def: Range | undefined;
        for (const o of at) {
          const d = doc.definition(probe(o.range));
          if (!d || text(doc, d) !== name) return fail(`${name}: definition ${d && text(doc, d)}`);
          defs.add(`${d.start}:${d.end}`);
          def = d;
          const refs = doc.references(probe(o.range));
          if (refs.some((r) => text(doc, r) !== name)) fail(`${name}: a reference is not ${name}`);
          refLists.add(JSON.stringify(refs));
        }
        if (defs.size !== 1) fail(`${name}: ${defs.size} definitions`);
        if (refLists.size !== 1) fail(`${name}: references differ by occurrence`);
        const refs = doc.references(probe(at[0]!.range));
        if (!refs.some((r) => r.start === def!.start)) fail(`${name}: definition not referenced`);
        if (at.some((o) => text(doc, o.range) !== name)) quotedResolved++;
        return def;
      };

      const ENTITY = ['entity', 'subgraph'];
      const entities = new Set(model.entities.map((e) => e.name));
      const subgraphIds = new Set(model.subgraphs.map((s) => s.name));
      for (const e of entities) resolve(e, ENTITY);
      for (const c of model.classes) resolve(c.name, ['class']);
      const defStarts = new Set(
        parsed.symbols.filter((x) => x.role === 'def').map((x) => probe(x.range))
      );
      for (const s of parsed.symbols.filter((x) => ENTITY.includes(x.kind))) {
        if (entities.has(s.name) || subgraphIds.has(s.name)) continue;
        const d = doc.definition(probe(s.range));
        if (d && defStarts.has(d.start)) fail(`${s.name} is defined but is no v12 entity`);
      }

      const bodies = subgraphBodies(parsed.ast.children);
      const folds = doc.foldingRanges().filter((f) => f.kind === 'subgraph');
      for (const s of model.subgraphs) {
        const mine = bodies.get(s.name) ?? [];
        if (mine.length === 0) {
          fail(`subgraph ${s.name} has no AST node`);
          continue;
        }
        const def = resolve(s.name, ['subgraph', 'entity']);
        if (
          def &&
          !mine.some((b) => inside(def, b) && !/[\r\n]/.test(doc.text.slice(b.start, def.start)))
        )
          fail(`subgraph ${s.name}: definition is not on its subgraph line`);
        const regions = mine.map((b) => {
          if (!/[\r\n]/.test(doc.text.slice(b.start, b.end).trimEnd())) return b;
          const f = folds.find(
            (x) => x.range.start === b.start && doc.text.slice(x.range.end, b.end).trim() === ''
          );
          if (!f) fail(`subgraph ${s.name} has no fold range`);
          return f?.range ?? b;
        });
        for (const member of s.members) {
          if (!entities.has(member)) continue;
          const at = occurrences(member, ENTITY)[0];
          const refs = at ? doc.references(probe(at.range)) : [];
          if (!refs.some((r) => regions.some((g) => inside(r, g))))
            fail(`member ${member} of ${s.name} has no reference in its fold range`);
        }
      }
    }
    expect(checked).toBeGreaterThan(600);
    // Names written quoted somewhere that resolved above (#199); a change means coverage moved.
    expect(quotedResolved).toBe(QUOTED_RESOLVED);
    expect(problems).toEqual([]);
  }, 180_000);
});
