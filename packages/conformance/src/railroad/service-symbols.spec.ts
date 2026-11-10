import { describe, expect, it } from 'vitest';
import type { Range } from '@mermaid-js/core/parser-kit';
import { language } from '@mermaid-js/diagram-railroad/language';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { railroadGateCorpus } from './corpus.ts';
import type { RailroadNodeSnapshot } from './v12.ts';
import { railroadV12Snapshot } from './v12.ts';

const V12_TYPES = ['railroad', 'railroadEbnf', 'railroadAbnf', 'railroadPeg'];
const LINE_BREAK = /[\r\n]/;

/**
 * Every nonterminal name in a v12 definition tree, and each PEG predicate's label (`&name`,
 * `!name`, `&(...)`): v12 drew a predicate as a special and dropped its operand, which the parser
 * still records as references (#610).
 */
function references(n: RailroadNodeSnapshot, out: Set<string>): Set<string> {
  if (n.type === 'nonterminal') out.add(n.name);
  else if (n.type === 'special' && /^[&!]/.test(n.text)) out.add(n.text);
  else if (n.type === 'sequence') for (const e of n.elements) references(e, out);
  else if (n.type === 'choice') for (const e of n.alternatives) references(e, out);
  else if (n.type === 'optional' || n.type === 'repetition') references(n.element, out);
  return out;
}

/**
 * The oracle expectations re-run through the language service for railroad (language.md step 8,
 * D99 suite 2, R-LANG-1, #616), as `cynefin/service-symbols.spec.ts` does: definition,
 * references, rename and folding asked at the places the parse output records, checked against
 * the mermaid v12 DB over the railroad gate corpus, in the four notations (D517):
 * - every v12 rule name resolves, from each of its occurrences (its rules and the nonterminals
 *   naming it, as written), to one definition, the name of its first rule (v12 draws a
 *   duplicate too); references from any occurrence give the same list, with that definition;
 * - a nonterminal naming no v12 rule (or a PEG predicate's operand, which v12 drops) has no
 *   definition, and each of its mentions has the `RAILROAD_UNDEFINED_RULE` warning; every `def`
 *   the parser records is a v12 rule;
 * - renaming a rule and renaming it back gives the text back;
 * - every v12 rule written over lines is a `rule` fold.
 *
 * The service loads the facet through the generated registry rows (railroad's manifest
 * `language` entry, #615).
 */
const service = createLanguageService();
await service.preload({ types: V12_TYPES });
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);

describe('railroad definition, references, rename and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    const checked = new Map<string, number>();
    let names = 0;
    let undefinedNames = 0;
    let folds = 0;
    for (const item of await railroadGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || !V12_TYPES.includes(v12.diagramType)) continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'railroad') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked.set(v12.diagramType, (checked.get(v12.diagramType) ?? 0) + 1);
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const model = railroadV12Snapshot(v12.db);
      const parsed = language.parse(item.source, { keepTokens: true });
      const ruleNames = new Set(model.rules.map((r) => r.name));
      for (const name of ruleNames) {
        names++;
        const at = parsed.symbols.filter((s) => s.name === name && text(doc, s.range) === name);
        const first = at.find((s) => s.role === 'def');
        if (!first) {
          fail(`rule ${name} has no definition`);
          continue;
        }
        const lists = new Set<string>();
        for (const o of at) {
          const d = doc.definition(o.range.start);
          if (d?.start !== first.range.start) fail(`${name}: definition at ${d?.start}`);
          lists.add(JSON.stringify(doc.references(o.range.start)));
        }
        if (lists.size !== 1) fail(`${name}: references differ by occurrence`);
        const refs = doc.references(first.range.start);
        if (refs.length !== at.length || !refs.some((r) => r.start === first.range.start))
          fail(`${name}: ${refs.length} references for ${at.length} occurrences`);
        const renamed = doc.rename(first.range.start, 'renamedZq7');
        if ('refused' in renamed) {
          fail(`${name}: rename refused: ${renamed.refused}`);
          continue;
        }
        const next = service.update(`corpus:///${item.id}#renamed`, apply(doc.text, renamed.edits));
        const back = next.rename(renamed.edits[0]!.range.start, name);
        if ('refused' in back) fail(`${name}: back refused: ${back.refused}`);
        else if (apply(next.text, back.edits) !== doc.text) fail(`${name}: back differs`);
      }
      const named = new Set<string>();
      for (const r of model.rules) references(r.definition, named);
      const warned = doc.diagnostics().filter((d) => d.code === 'RAILROAD_UNDEFINED_RULE');
      for (const s of parsed.symbols) {
        if (ruleNames.has(s.name)) continue;
        undefinedNames++;
        if (s.role === 'def') fail(`${s.name} is defined but no v12 rule`);
        const predicate = [...named].some(
          (x) => x === `&${s.name}` || x === `!${s.name}` || x.endsWith('(...)')
        );
        if (!named.has(s.name) && !predicate) fail(`${s.name} is no v12 nonterminal`);
        if (doc.definition(s.range.start)) fail(`${s.name} at ${s.range.start} has a definition`);
        if (!warned.some((d) => d.range.start === s.range.start))
          fail(`${s.name} at ${s.range.start} has no undefined-rule warning`);
      }
      for (const n of parsed.ast.children) {
        if (n.type !== 'Rule' || !LINE_BREAK.test(text(doc, n.range))) continue;
        folds++;
        if (!doc.foldingRanges().some((f) => f.kind === 'rule' && f.range.start === n.range.start))
          fail(`the multi-line rule at ${n.range.start} has no fold`);
      }
    }
    for (const t of V12_TYPES) expect(checked.get(t) ?? 0, t).toBeGreaterThan(50);
    expect(names).toBeGreaterThan(500);
    expect(undefinedNames).toBeGreaterThan(20);
    expect(folds).toBeGreaterThan(20);
    expect(problems).toEqual([]);
  }, 300_000);
});

function apply(source: string, edits: readonly { range: Range; newText: string }[]): string {
  let out = source;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}
