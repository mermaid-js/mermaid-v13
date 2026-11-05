import { describe, expect, it } from 'vitest';
import { journeyLanguage } from '@mermaid-js/diagram-journey/language';
import type { Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { journeyGateCorpus } from './corpus.ts';
import { journeyV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for user journeys (language.md
 * step 8, D99 suite 2, R-LANG-1, #331), as `pie/service-symbols.spec.ts` does for pie:
 * definition, references and folding asked at the places the facet's parse records, checked
 * against the mermaid v12 DB over the journey gate corpus:
 * - every v12 actor, section name and task name (blanks off both ends: v12 kept them, the
 *   symbol does not) resolves to exactly one definition, its first occurrence, and references
 *   from any of its occurrences give the same list, every occurrence in it;
 * - a section's definition is on a `section` line;
 * - every symbol is a v12 name of its kind;
 * - each v12 task with a section has a reference inside a `section` fold range of that name.
 *
 * A name whose source text is not its name is no service occurrence, so a rename could not keep
 * it: a name written with an entity (`#lt;b#gt;`, read `&lt;b&gt;`), a tag quote v12 turned
 * (`style="c"`), or a comment or directive cut out of it. Those are counted in {@link ESCAPED}.
 */

/** v12 names written otherwise than their name in the corpus (skipped above). */
const ESCAPED = 35;
/** Longer sources (the 200 000-character stress cases) are left to the parity specs. */
const MAX_LENGTH = 20_000;

const service = createLanguageService();
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);
const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;

describe('journey definition, references and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    await service.preload({ types: ['journey'] });
    const problems: string[] = [];
    let checked = 0;
    let names = 0;
    let escaped = 0;
    let members = 0;
    for (const item of await journeyGateCorpus()) {
      if (item.source.length > MAX_LENGTH) continue;
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'journey') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'journey') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const model = journeyV12Snapshot(v12.db);
      const { symbols, ast } = journeyLanguage.parse(item.source, { keepTokens: true });
      const sectionLines = ast.children.filter((n) => n.type === 'Section');
      const expected: Record<string, Set<string>> = {
        actor: new Set(model.actors),
        section: new Set(model.sections.map((s) => s.trim())),
        task: new Set(model.tasks.map((t) => t.name.trim())),
      };
      const at = (kind: string, name: string): SymbolOccurrence[] =>
        symbols.filter((s) => s.kind === kind && s.name === name && text(doc, s.range) === name);

      for (const [kind, set] of Object.entries(expected)) {
        for (const name of set) {
          // The service has no symbol for an empty name (`T: 5:`, an all-blank section).
          if (name === '') continue;
          names++;
          const list = at(kind, name);
          if (list.length === 0) {
            if (symbols.some((s) => s.kind === kind && s.name === name)) escaped++;
            else fail(`${kind} ${JSON.stringify(name)} has no occurrence`);
            continue;
          }
          const first = list[0]!.range.start;
          const lists = new Set<string>();
          for (const o of list) {
            const d = doc.definition(o.range.start);
            if (!d || d.start !== first || text(doc, d) !== name)
              fail(
                `${kind} ${name}: definition ${d && JSON.stringify(text(doc, d))} at ${d?.start}`
              );
            lists.add(JSON.stringify(doc.references(o.range.start)));
          }
          if (lists.size !== 1) fail(`${kind} ${name}: references differ by occurrence`);
          const refs = doc.references(first);
          if (refs.length !== list.length || !refs.some((r) => r.start === first))
            fail(`${kind} ${name}: ${refs.length} references for ${list.length} occurrences`);
          if (kind === 'section' && !sectionLines.some((n) => inside(list[0]!.range, n.range)))
            fail(`section ${name}: definition is not in a section line`);
        }
      }
      for (const s of symbols) {
        if (!expected[s.kind]?.has(s.name)) fail(`${s.kind} ${s.name} is no v12 ${s.kind}`);
      }

      const folds = doc.foldingRanges().filter((f) => f.kind === 'section');
      const sectionOf = (f: Range) =>
        sectionLines.find((n) => n.range.start === f.start)?.name.trim();
      for (const t of model.tasks) {
        const name = t.name.trim();
        const section = t.section.trim();
        if (name === '' || section === '' || at('task', name).length === 0) continue;
        members++;
        const refs = doc.references(at('task', name)[0]!.range.start);
        const ok = folds.some(
          (f) => sectionOf(f.range) === section && refs.some((r) => inside(r, f.range))
        );
        if (!ok) fail(`task ${name} of ${section} has no reference in its fold range`);
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(names).toBeGreaterThan(500);
    expect(members).toBeGreaterThan(300);
    expect(escaped).toBe(ESCAPED);
    expect(problems).toEqual([]);
  }, 300_000);
});
