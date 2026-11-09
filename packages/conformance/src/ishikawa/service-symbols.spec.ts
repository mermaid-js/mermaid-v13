import { describe, expect, it } from 'vitest';
import {
  detectIshikawa,
  ishikawaLanguage,
  parseIshikawa,
} from '@mermaid-js/diagram-ishikawa/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { ishikawaGateCorpus } from './corpus.ts';
import { ishikawaV12Snapshot } from './v12.ts';
import { ishikawaV13Snapshot } from './v13.ts';

/**
 * The oracle expectations re-run through the language service for ishikawa (language.md
 * step 8, D99 suite 2, R-LANG-1, D497, #584), checked against the mermaid v12 DB over the
 * ishikawa gate corpus, on every source v12 accepts and whose model v13 reads as v12 does:
 * - every v12 cause (each node under the effect, in pre-order) has exactly one `cause`
 *   occurrence, its text as written; its definition is that occurrence and its references are
 *   that occurrence alone, also when another cause has the same label; the effect is no symbol;
 * - folding per subtree: every v12 cause with a cause under it on a later line has a `cause`
 *   fold starting at it that holds its whole subtree and no cause after it;
 * - renaming a cause to a fresh label, v12 reads the new text with that cause's label changed
 *   and nothing else; a rename to a label with a line break or a leading keyword is refused.
 *
 * The service gets the facet as an eager row, as a host bundling it would, until ishikawa's
 * manifest has its `language` entry (#585); the last test then fails: drop the row.
 */
const service = createLanguageService({
  facets: [
    {
      type: 'ishikawa',
      id: 'ishikawa',
      detector: (t) => detectIshikawa(t),
      facet: ishikawaLanguage,
    },
  ],
});

const FRESH = 'Renamed cause Zq7';
const key = (r: Range | undefined) => (r ? `${r.start}:${r.end}` : 'none');
const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;

function apply(text: string, edits: readonly { range: Range; newText: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

describe('ishikawa symbols, folding and rename through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    const n = { sources: 0, causes: 0, repeats: 0, folds: 0, renamed: 0, refused: 0 };
    for (const item of await ishikawaGateCorpus()) {
      const text = item.source;
      if (text.includes(FRESH)) continue;
      const v12 = await oracle.parse(text);
      if (!v12.accepted || v12.diagramType !== 'ishikawa') continue;
      const want = ishikawaV12Snapshot(v12.db);
      const doc = service.update(`corpus:///${item.id}`, text);
      if (doc.facet?.id !== 'ishikawa') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      const parsed = parseIshikawa(text);
      if (JSON.stringify(ishikawaV13Snapshot(parsed.model)) !== JSON.stringify(want)) continue;
      n.sources++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);

      // Pre-order is source order: the AST's cause lines are v12's nodes after the effect.
      const lines = parsed.ast.children.filter((c) => c.type === 'Cause');
      const causes = want.nodes.slice(1);
      if (lines.length !== causes.length) {
        fail(`${lines.length} cause lines, v12 ${causes.length}`);
        continue;
      }
      const symbols = parsed.symbols.filter((s) => s.kind === 'cause');
      if (parsed.symbols.length !== symbols.length) fail('a symbol that is not a cause');
      const seen = new Map<string, number>();
      lines.forEach((line, k) => {
        const mine = symbols.filter((s) => inside(s.range, line.range));
        if (mine.length !== 1) return fail(`cause ${k + 1}: ${mine.length} occurrences`);
        const at = mine[0]!.range;
        n.causes++;
        if (doc.text.slice(at.start, at.end) !== mine[0]!.name) return;
        const label = mine[0]!.name;
        if ((seen.get(label) ?? 0) > 0) n.repeats++;
        seen.set(label, (seen.get(label) ?? 0) + 1);
        const d = doc.definition(at.start);
        if (!d || key(d) !== key(at)) fail(`cause ${label}: definition ${key(d)}`);
        const refs = doc.references(at.start).map(key);
        if (refs.length !== 1 || refs[0] !== key(at))
          fail(`cause ${label}: references ${refs.join(' ')}`);
        if (doc.references(at.start, false).length > 0) fail(`cause ${label}: has references`);
      });
      const effect = parsed.model.effect;
      if (effect && doc.definition(effect.range.start)) fail('the effect has a definition');

      // Folds: v12's subtree of cause k runs over the later nodes deeper than it.
      const ranges = doc.foldingRanges().filter((f) => f.kind === 'cause');
      const lineOf = (o: number) => text.slice(0, o).split(/\r\n?|\n/).length;
      causes.forEach(([depth], k) => {
        let last = k;
        while (last + 1 < causes.length && causes[last + 1]![0] > depth) last++;
        const start = lines[k]!.range;
        if (last === k || lineOf(lines[last]!.range.end) === lineOf(start.start)) return;
        n.folds++;
        const f = ranges.find((x) => x.range.start === start.start);
        if (!f) return fail(`cause ${k + 1} has no fold`);
        for (let j = k + 1; j <= last; j++)
          if (!inside(lines[j]!.range, f.range)) fail(`cause ${k + 1}: cause ${j + 1} outside`);
        const next = lines[last + 1];
        if (next && next.range.start < f.range.end)
          fail(`cause ${k + 1}: fold holds a later cause`);
      });

      // Renames, read back by v12.
      for (const [k, line] of lines.entries()) {
        const s = symbols.find((x) => inside(x.range, line.range));
        if (!s || doc.text.slice(s.range.start, s.range.end) !== s.name) continue;
        const renamed = doc.rename(s.range.start, FRESH);
        if ('refused' in renamed) {
          fail(`cause ${k + 1}: rename refused: ${renamed.refused}`);
          continue;
        }
        const after = await oracle.parse(apply(text, renamed.edits));
        const expected = want.nodes.map(([d, t], j) => [d, j === k + 1 ? FRESH : t]);
        if (!after.accepted) fail(`cause ${k + 1}: v12 rejects the renamed text`);
        else if (JSON.stringify(ishikawaV12Snapshot(after.db).nodes) !== JSON.stringify(expected))
          fail(`cause ${k + 1}: the rename changes more than its label`);
        else n.renamed++;
        for (const bad of ['two\nlines', 'Ishikawa review', 'ishikawa-beta']) {
          if ('refused' in doc.rename(s.range.start, bad)) n.refused++;
          else fail(`cause ${k + 1}: renamed to ${JSON.stringify(bad)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    // 621 sources, 2,184 causes (5 repeated labels), 573 folds, 1,847 renames read back.
    expect(n.sources).toBeGreaterThan(500);
    expect(n.causes).toBeGreaterThan(2000);
    expect(n.repeats).toBeGreaterThan(0);
    expect(n.folds).toBeGreaterThan(500);
    expect(n.renamed).toBeGreaterThan(1500);
    process.stdout.write(`ishikawa service symbols: ${JSON.stringify(n)}\n`);
  }, 600_000);

  it('the facet is not in the generated registry yet (#585: drop the eager row then)', () => {
    expect(firstPartyFacets.find((e) => e.type === 'ishikawa')?.load).toBeUndefined();
  });
});
