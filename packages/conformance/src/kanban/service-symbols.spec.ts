import { describe, expect, it } from 'vitest';
import { parseKanban } from '@mermaid-js/diagram-kanban';
import type { KanbanItemNode } from '@mermaid-js/diagram-kanban';
import { kanbanBoardOrder } from '@mermaid-js/diagram-kanban/testing';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { kanbanGateCorpus } from './corpus.ts';
import { kanbanV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for kanban (language.md step 8,
 * D99 suite 2, R-LANG-1, #463), checked against the mermaid v12 DB over the kanban gate corpus:
 * - item ids (as D289): every v12 item written with an id has exactly one `node` occurrence,
 *   its id without the blanks around it; its definition is that occurrence and its references
 *   are that occurrence alone, also when another item has the same id;
 * - classes: every class v12 gives a column has occurrences, those the service keeps (all but a
 *   word a directive cuts) resolving to one definition with the same references from each, and the column's last class line holds them;
 * - assignees: every item v12 gives an `assigned` has one `assignee` occurrence in its data,
 *   named as v12 stored it; those the service keeps read exactly the name and are one symbol;
 *   renaming it to a fresh name, v12 reads the new text with each `assigned` of that name
 *   changed and nothing else; with an occurrence the service could not place, the rename is
 *   refused (GAPS #463);
 * - folding per column: every v12 column with a card on a later line has a `column` fold
 *   starting at it that holds its cards and no later column.
 *
 * Sources whose columns share an id are left out: v12 lists the cards of each under every one
 * of them (D373, a listed divergence), so its items do not line up with the board.
 *
 * The service loads the facet through the generated registry row (kanban's manifest
 * `language` entry, #459).
 */
const service = createLanguageService();
await service.preload({ types: ['kanban'] });

const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;
const key = (r: Range) => `${r.start}:${r.end}`;
const FRESH = 'renamedZq7';

function apply(text: string, edits: readonly { range: Range; newText: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}
const classWords = (text: string) => text.split(/[\t\n\f\r ]+/).filter((w) => w !== '');

describe('kanban symbols and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let repeats = 0;
    let classes = 0;
    let assignees = 0;
    let shared = 0;
    let renames = 0;
    let refusals = 0;
    let folds = 0;
    for (const item of await kanbanGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'kanban') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'kanban') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      const model = kanbanV12Snapshot(v12.db);
      const parsed = parseKanban(item.source);
      const board = kanbanBoardOrder(parsed.model);
      if (board.length !== model.nodes.length) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const itemNodes = parsed.ast.children.filter((n): n is KanbanItemNode => n.type === 'Item');
      const astOf = new Map(itemNodes.map((n) => [n.id, n]));
      const asts = board.map((b) => astOf.get(b.ast)!);
      const nodeSymbols = parsed.symbols.filter((s) => s.kind === 'node');
      const seen = new Map<string, number>();

      model.nodes.forEach((v, k) => {
        const ast = asts[k]!;
        if (ast.nodeId === undefined || ast.nodeId.trim() === '') return;
        const name = v.id.trim();
        const mine = nodeSymbols.filter((s) => inside(s.range, ast.range));
        if (mine.length !== 1 || mine[0]!.name !== name) {
          return fail(`item ${name}: ${mine.length} occurrences`);
        }
        const at = mine[0]!.range;
        if (doc.text.slice(at.start, at.end) !== name) return;
        if ((seen.get(name) ?? 0) > 0) repeats++;
        seen.set(name, (seen.get(name) ?? 0) + 1);
        const d = doc.definition(at.start);
        if (!d || key(d) !== key(at)) fail(`item ${name}: definition ${d && key(d)}`);
        const refs = doc.references(at.start).map(key);
        if (refs.length !== 1 || refs[0] !== key(at))
          fail(`item ${name}: references ${refs.join(' ')}`);
        if (doc.references(at.start, false).length > 0) fail(`item ${name}: has references`);
      });

      const classSymbols = parsed.symbols.filter((s) => s.kind === 'class');
      for (const name of new Set(model.nodes.flatMap((v) => v.classes ?? []))) {
        const all = classSymbols.filter((s) => s.name === name);
        if (all.length === 0) {
          fail(`class ${name} has no occurrence`);
          continue;
        }
        // A word a directive cuts in two keeps the line's range, which the service drops.
        const at = all.filter((s) => doc.text.slice(s.range.start, s.range.end) === name);
        if (at.length === 0) continue;
        classes++;
        const defs = new Set(at.map((s) => doc.definition(s.range.start)).map((d) => d && key(d)));
        if (defs.size !== 1 || defs.has(undefined)) fail(`class ${name}: ${defs.size} definitions`);
        const lists = new Set(at.map((s) => JSON.stringify(doc.references(s.range.start))));
        if (lists.size !== 1) fail(`class ${name}: references differ by occurrence`);
        const refs = doc.references(at[0]!.range.start);
        if (refs.length !== at.length) fail(`class ${name}: ${refs.length} of ${at.length}`);
      }
      model.nodes.forEach((v, k) => {
        if (!v.classes || v.classes.length === 0) return;
        const lines = asts[k]!.decorations.filter((d) => d.type === 'Class');
        const kept = lines[lines.length - 1];
        if (!kept || classWords(kept.text).join(' ') !== v.classes.join(' '))
          fail(`column ${v.id}: v12 classes ${v.classes.join(' ')} are not its last class line`);
      });

      const assigneeSymbols = parsed.symbols.filter((s) => s.kind === 'assignee');
      /** Per name: the items v12 assigns it to, and the occurrences the service keeps. */
      const names = new Map<string, { items: number; kept: Range[] }>();
      model.nodes.forEach((v, k) => {
        const data = asts[k]!.data;
        const mine = data ? assigneeSymbols.filter((s) => inside(s.range, data.range)) : [];
        if (v.assigned === null) {
          if (mine.length > 0) fail(`item ${v.id}: an assignee v12 does not have`);
          return;
        }
        if (mine.length !== 1 || mine[0]!.name !== v.assigned) {
          return fail(`item ${v.id}: ${mine.length} assignee occurrences for ${v.assigned}`);
        }
        assignees++;
        const entry = names.get(v.assigned) ?? { items: 0, kept: [] };
        names.set(v.assigned, entry);
        entry.items++;
        // Past an opening quote; an occurrence the service dropped (a value it cannot place in
        // the source) has no references.
        const refs = doc.references(mine[0]!.range.start + 1);
        const own = refs.find((r) => inside(r, mine[0]!.range));
        if (!own) return;
        if (doc.text.slice(own.start, own.end) !== v.assigned)
          fail(`item ${v.id}: assignee range reads ${doc.text.slice(own.start, own.end)}`);
        entry.kept.push(own);
      });
      for (const [name, { items, kept }] of names) {
        if (kept.length === 0) continue;
        const refs = doc.references(kept[0]!.start);
        if (refs.length !== kept.length) fail(`assignee ${name}: ${refs.length} of ${kept.length}`);
        if (kept.length > 1) shared++;
        // A rename edits each `assigned` value and nothing else, as v12 reads the result; with an
        // occurrence the service cannot place, it is refused.
        const renamed = doc.rename(kept[0]!.start, FRESH);
        if ('refused' in renamed) {
          if (kept.length === items) fail(`assignee ${name}: rename refused: ${renamed.refused}`);
          else refusals++;
          continue;
        }
        if (kept.length < items) {
          fail(`assignee ${name}: renamed with ${items - kept.length} occurrences left out`);
          continue;
        }
        const after = await oracle.parse(apply(item.source, renamed.edits));
        const want = model.nodes.map((v) => ({
          ...v,
          assigned: v.assigned === name ? FRESH : v.assigned,
        }));
        const got = after.accepted ? kanbanV12Snapshot(after.db).nodes : undefined;
        if (JSON.stringify(got) !== JSON.stringify(want))
          fail(`assignee ${name}: rename changes more`);
        else renames++;
      }

      const ranges = doc.foldingRanges().filter((f) => f.kind === 'column');
      const lineOf = (offset: number) => doc.text.slice(0, offset).split('\n').length;
      model.nodes.forEach((v, k) => {
        if (!v.column) return;
        let last = k;
        while (last + 1 < model.nodes.length && !model.nodes[last + 1]!.column) last++;
        const start = asts[k]!.range;
        if (last === k || lineOf(asts[last]!.range.end) === lineOf(start.start)) return;
        folds++;
        const f = ranges.find((x) => x.range.start === start.start);
        if (!f) return fail(`column ${v.id} has no fold`);
        for (let d = k + 1; d <= last; d++) {
          if (!inside(asts[d]!.range, f.range))
            fail(`column ${v.id}: ${model.nodes[d]!.id} outside`);
        }
        const next = asts[last + 1];
        if (next && next.range.start < f.range.end)
          fail(`column ${v.id}: fold holds a later column`);
      });
    }
    expect(checked).toBeGreaterThan(500);
    expect(repeats).toBeGreaterThan(20);
    expect(classes).toBeGreaterThan(30);
    expect(assignees).toBeGreaterThan(150);
    expect(shared).toBeGreaterThan(10);
    expect(renames).toBeGreaterThan(100);
    expect(refusals).toBeLessThan(renames / 4);
    expect(folds).toBeGreaterThan(500);
    expect(problems).toEqual([]);
  }, 300_000);

  it('loads the facet from the generated registry (#459)', () => {
    const row = firstPartyFacets.find((e) => e.type === 'kanban');
    expect(row?.load).toBeTypeOf('function');
    expect(service.update('x:///k', 'kanban\n  todo\n').facet?.id).toBe('kanban');
  });
});
