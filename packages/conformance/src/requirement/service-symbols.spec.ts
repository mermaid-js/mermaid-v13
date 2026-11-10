import { describe, expect, it } from 'vitest';
import { detectRequirement, parseRequirement } from '@mermaid-js/diagram-requirement';
import type { RelationNode } from '@mermaid-js/diagram-requirement';
import { language } from '@mermaid-js/diagram-requirement/language';
import type { Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { resolveCorpus } from '../corpus.ts';
import { PARITY_SUITES } from '../registry.ts';
import { requirementV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for requirement (language.md
 * step 8, D99 suite 2, R-LANG-1, D437), as `er/service-symbols.spec.ts` does for ER:
 * definition, references and folding ranges asked at the places the parse output records,
 * checked against the mermaid v12 model over the requirement parity corpus:
 * - every v12 requirement and element name resolves to exactly one definition, holding its
 *   name, on the first box of that name; references from any of its occurrences give the same
 *   list, with that definition in it; a name written quoted resolves like one written bare
 *   (#199, D191);
 * - every v12 class (`classDef`) resolves to one definition on its first `classDef`;
 * - a name resolving to a `def` in the box namespace is a v12 requirement or element;
 * - each end of a v12 relation that names a box has a reference inside its relation statement;
 * - each multi-line box is a `requirement` or `element` fold range from its keyword to its `}`.
 *
 * The manifest (#587) is not there yet, so the facet is given to the service as a row of its
 * own; once it is, the row only replaces the generated one.
 */

/**
 * Names whose source text is not the name (an entity v12 decodes, a CR it reads as LF, a
 * directive cut out of the middle): the parser records them, but the service takes only an
 * occurrence that reads as its name (D191), so they have no definition or references.
 */
const NOT_AS_WRITTEN = [
  'requirement-cases/string-entity-quoted: a &#9829; b',
  'requirement-cases/cr-in-quoted: a\nb',
  'requirement-cases/directive-mid-name: ab',
];

/** Names written quoted in the corpus that resolve (#199); a change means coverage moved. */
const QUOTED_RESOLVED = 39;

const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);
const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;
const BOX = ['requirement', 'element'];

describe('requirement definition, references and folding through the service match v12', () => {
  it('over the parity corpus', async () => {
    const oracle = await loadOracle();
    const service = createLanguageService({
      facets: [
        {
          type: 'requirement',
          id: 'requirement',
          detector: (src) => detectRequirement(src),
          facet: language,
        },
      ],
    });
    await service.preload({ types: ['requirement'] });
    const problems: string[] = [];
    let checked = 0;
    let quotedResolved = 0;
    const notAsWritten: string[] = [];
    for await (const item of resolveCorpus({}, PARITY_SUITES)) {
      if (!detectRequirement(item.source)) continue;
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'requirement') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'requirement') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      // Where to put the cursor on an occurrence: inside the quotes of a quoted one.
      const probe = (r: Range) => (doc.text.charAt(r.start) === '"' ? r.start + 1 : r.start);
      const fail = (what: string): undefined => {
        problems.push(`${item.id}: ${what}`);
      };
      const model = requirementV12Snapshot(v12.db);
      const parsed = parseRequirement(item.source);
      const occurrences = (name: string, kinds: readonly string[]): SymbolOccurrence[] =>
        parsed.symbols.filter(
          (s) =>
            s.name === name &&
            kinds.includes(s.kind) &&
            [name, `"${name}"`].includes(text(doc, s.range))
        );

      /** The single definition of `name`, asked at each occurrence; it must be at `want`. */
      const resolve = (name: string, kinds: readonly string[], want: Range | undefined) => {
        const at = occurrences(name, kinds);
        if (at.length === 0 && parsed.symbols.some((s) => s.name === name)) {
          notAsWritten.push(`${item.id}: ${name}`);
          return undefined;
        }
        if (at.length === 0) return fail(`${kinds[0]} ${name} has no occurrence`);
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
        if (want && def && !inside(def, want)) fail(`${name}: definition is not on its first box`);
        if (at.some((o) => text(doc, o.range) !== name)) quotedResolved++;
        return undefined;
      };

      // The first box (or classDef) of each name, from the AST in source order.
      const firstBox = new Map<string, Range>();
      const firstClassDef = new Map<string, Range>();
      for (const c of parsed.ast.children) {
        if ((c.type === 'Requirement' || c.type === 'Element') && !firstBox.has(c.name.text))
          firstBox.set(c.name.text, c.name.range);
        if (c.type === 'ClassDef')
          for (const n of c.classNames ?? [])
            if (!firstClassDef.has(n.text)) firstClassDef.set(n.text, n.range);
      }
      const boxes = new Set([...model.requirements, ...model.elements].map((b) => b.name));
      for (const b of boxes) resolve(b, BOX, firstBox.get(b));
      for (const c of model.classes) {
        if (c.id !== 'default') resolve(c.id, ['class'], firstClassDef.get(c.id));
      }
      const defStarts = new Set(
        parsed.symbols.filter((x) => x.role === 'def').map((x) => probe(x.range))
      );
      for (const s of parsed.symbols.filter((x) => BOX.includes(x.kind))) {
        if (boxes.has(s.name)) continue;
        const d = doc.definition(probe(s.range));
        if (d && defStarts.has(probe(d))) fail(`${s.name} is defined but is no v12 box`);
      }

      const relations = parsed.ast.children.filter((c): c is RelationNode => c.type === 'Relation');
      for (const [i, r] of model.relations.entries()) {
        const node = relations[i];
        if (!node || node.src.text !== r.src || node.dst.text !== r.dst) {
          fail(`relation ${i} ${r.src}->${r.dst} has no AST node`);
          continue;
        }
        for (const end of [r.src, r.dst]) {
          if (!boxes.has(end)) continue;
          const at = occurrences(end, BOX)[0];
          const refs = at ? doc.references(probe(at.range)) : [];
          if (!refs.some((x) => inside(x, node.range)))
            fail(`relation ${r.src}->${r.dst}: no reference to ${end} in it`);
        }
      }

      const folds = doc.foldingRanges();
      for (const c of parsed.ast.children) {
        if (c.type !== 'Requirement' && c.type !== 'Element') continue;
        if (!/[\r\n]/.test(text(doc, c.range))) continue;
        const kind = c.type === 'Requirement' ? 'requirement' : 'element';
        const f = folds.find((x) => x.kind === kind && x.range.start === c.range.start);
        if (!f || text(doc, f.range).trimEnd() !== text(doc, c.range).trimEnd())
          fail(`${kind} ${c.name.text} has no fold range over its box`);
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(quotedResolved).toBe(QUOTED_RESOLVED);
    expect(notAsWritten).toEqual(NOT_AS_WRITTEN);
    expect(problems).toEqual([]);
  }, 180_000);
});
