import { describe, expect, it } from 'vitest';
import { parseClass } from '@mermaid-js/diagram-class';
import type { ClassStatementNode } from '@mermaid-js/diagram-class';
import { classLanguage } from '@mermaid-js/diagram-class/language';
import type { Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { resolveCorpus } from '../corpus.ts';
import { PARITY_SUITES } from '../registry.ts';
import { CLASS_V12_TYPES, classV12Snapshot } from './v12.ts';
import { classAdapter } from './v13.ts';

/**
 * The class oracle expectations through the language service (D99 suite 2, R-LANG-1, the
 * flowchart pattern of `flowchart/service-symbols.spec.ts`): definition, references and
 * folding ranges asked where the parse output records names, checked against the mermaid
 * v12 `ClassDB` over the parity corpus:
 * - every v12 class and style class written as its plain name resolves to exactly one
 *   definition holding its name, and references from each of its occurrences give the same
 *   list, with that definition in it; a name resolving to a `def` occurrence in the class
 *   name space is a v12 class;
 * - each multi-line `namespace` statement is a `namespace` fold range, and each v12 class of
 *   that namespace has a reference inside one of its folds.
 *
 * The facet is passed to the service directly: classDiagram has no manifest yet (T5, #157).
 */

const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);
const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;

function namespaceBodies(
  nodes: readonly ClassStatementNode[],
  into = new Map<string, Range[]>()
): Map<string, Range[]> {
  for (const n of nodes) {
    if (n.type !== 'Namespace') continue;
    into.set(n.name, [...(into.get(n.name) ?? []), n.range]);
    namespaceBodies(n.children as ClassStatementNode[], into);
  }
  return into;
}

describe('class definition, references and folding through the service match v12', () => {
  it('over the parity corpus', async () => {
    const oracle = await loadOracle();
    const service = createLanguageService({
      facets: [
        {
          type: 'classDiagram',
          id: 'class',
          section: 'class',
          detector: (t) => /^\s*classDiagram/.test(t),
          facet: classLanguage,
        },
      ],
    });
    await service.preload({ types: ['classDiagram'] });
    const suite = PARITY_SUITES.filter((s) => s.adapter === classAdapter);
    const problems: string[] = [];
    let checked = 0;
    let names = 0;
    for await (const item of resolveCorpus({}, suite)) {
      const v12 = await oracle.parse(item.source, classAdapter.v12Config);
      if (!v12.accepted || !CLASS_V12_TYPES.includes(v12.diagramType)) continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'class') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string): undefined => {
        problems.push(`${item.id}: ${what}`);
      };
      const model = classV12Snapshot(v12.db);
      const parsed = parseClass(item.source);
      // Only occurrences written as the plain name: the service keeps no other (`` `A` ``).
      const occurrences = (name: string, kind: string): SymbolOccurrence[] =>
        parsed.symbols.filter(
          (s) => s.name === name && s.kind === kind && text(doc, s.range) === name
        );

      const resolve = (name: string, kind: string): Range | undefined => {
        const at = occurrences(name, kind);
        if (at.length === 0) return undefined;
        names++;
        const defs = new Set<string>();
        const refLists = new Set<string>();
        let def: Range | undefined;
        for (const o of at) {
          const d = doc.definition(o.range.start);
          if (!d || text(doc, d) !== name) return fail(`${name}: definition ${d && text(doc, d)}`);
          defs.add(`${d.start}:${d.end}`);
          def = d;
          const refs = doc.references(o.range.start);
          if (refs.some((r) => text(doc, r) !== name)) fail(`${name}: a reference is not ${name}`);
          refLists.add(JSON.stringify(refs));
        }
        if (defs.size !== 1) fail(`${name}: ${defs.size} definitions`);
        if (refLists.size !== 1) fail(`${name}: references differ by occurrence`);
        const refs = doc.references(at[0]!.range.start);
        if (!refs.some((r) => r.start === def!.start)) fail(`${name}: definition not referenced`);
        return def;
      };

      const classes = new Set(model.classes.map((c) => c.id));
      for (const id of classes) resolve(id, 'class');
      for (const c of model.styleClasses) resolve(c.id, 'cssClass');
      const defStarts = new Set(
        parsed.symbols.filter((x) => x.role === 'def').map((x) => x.range.start)
      );
      for (const s of parsed.symbols.filter((x) => x.kind === 'class')) {
        if (classes.has(s.name)) continue;
        const d = doc.definition(s.range.start);
        if (d && defStarts.has(d.start)) fail(`${s.name} is defined but is no v12 class`);
      }

      const bodies = namespaceBodies(parsed.ast.children);
      const folds = doc.foldingRanges().filter((f) => f.kind === 'namespace');
      for (const ns of model.namespaces) {
        const mine = bodies.get(ns.id) ?? [];
        if (ns.explicit && mine.length === 0) fail(`namespace ${ns.id} has no AST node`);
        const regions = mine.map((b) => {
          const f = folds.find(
            (x) => x.range.start === b.start && doc.text.slice(x.range.end, b.end).trim() === ''
          );
          if (!f && /[\r\n]/.test(doc.text.slice(b.start, b.end).trimEnd()))
            fail(`namespace ${ns.id} has no fold range`);
          return f?.range ?? b;
        });
        if (regions.length === 0) continue;
        for (const member of ns.classes) {
          const refs = parsed.symbols.filter((s) => s.kind === 'class' && s.name === member);
          if (!refs.some((r) => regions.some((g) => inside(r.range, g))))
            fail(`class ${member} of namespace ${ns.id} has no mention in its fold range`);
        }
      }
    }
    expect(checked).toBeGreaterThan(550);
    expect(names).toBeGreaterThan(1100);
    expect(problems).toEqual([]);
  }, 180_000);
});
