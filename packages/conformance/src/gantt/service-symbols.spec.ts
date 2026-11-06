import { describe, expect, it } from 'vitest';
import { parseGantt } from '@mermaid-js/diagram-gantt';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { Range } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { ganttGateCorpus } from './corpus.ts';
import { ganttV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for gantt (language.md step 8,
 * D99 suite 2, R-LANG-1, #382), checked against the mermaid v12 DB over the gantt gate corpus:
 * - task ids: at every id a task is written with, and at every id v12 reads from a task's
 *   `after …` start or `until …` end (its own regex over v12's raw start and end), the
 *   definition is in the data of the last task v12 gave that id (`taskDb` is last-wins), and
 *   references from it find the occurrence. Names v12 also gives a task without an id
 *   (`task<n>`) have no symbol (renaming them would leave that task behind), nor does a name
 *   a removed span cuts; neither is checked;
 * - folding by section: every task v12 adds after a section sits in exactly one `section` fold,
 *   the one starting at that `section`; a task before the first section in none.
 *
 * The service loads the facet through the generated registry row (gantt's manifest
 * `language` entry, #385).
 */
const service = createLanguageService();
await service.preload({ types: ['gantt'] });

const AFTER = /^after\s+(?<ids>[\d\w- ]+)/;
const UNTIL = /^until\s+(?<ids>[\d\w- ]+)/;
const AUTO = /^task\d+$/;
const within = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;

/** The ids v12's `getStartDate`/`getEndDate` read from a raw start or end. */
function readIds(raw: string | null, re: RegExp): string[] {
  const m = raw === null ? null : re.exec(raw.trim());
  return (m?.groups?.ids ?? '').split(' ').filter((id) => id !== '');
}

describe('gantt symbols and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let ids = 0;
    let refs = 0;
    let inSections = 0;
    for (const item of await ganttGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'gantt') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'gantt') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      const model = ganttV12Snapshot(v12.db);
      const parsed = parseGantt(item.source);
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      if (parsed.model.tasks.length !== model.tasks.length) {
        fail(`${parsed.model.tasks.length} tasks, v12 ${model.tasks.length}`);
        continue;
      }
      checked++;
      const data = parsed.model.tasks.map((t) => t.dataRange);
      const lastWith = (id: string) => model.tasks.map((t) => t.id).lastIndexOf(id);
      /** The symbol named `name` in task `i`'s data, its definition and references. */
      const check = (i: number, name: string, role: string) => {
        const range = data[i]!;
        const at = parsed.symbols.find((s) => s.name === name && within(s.range, range));
        if (!at) return; // cut by a removed span: no symbol
        const def = doc.definition(at.range.start);
        const want = lastWith(name);
        if (want < 0) {
          if (def && !within(def, at.range))
            fail(`${role} ${name} in task ${i}: unknown, yet defined`);
          return;
        }
        if (!def || !within(def, data[want]!)) {
          fail(`${role} ${name} in task ${i}: definition not in task ${want}`);
        }
        const found = doc.references(at.range.start, true);
        if (!found.some((r) => r.start === at.range.start)) fail(`${role} ${name}: not referenced`);
      };
      const auto = new Set(model.tasks.filter((t) => AUTO.test(t.id)).map((t) => t.id));
      model.tasks.forEach((t, i) => {
        if (!auto.has(t.id) && t.id !== '' && !AUTO.test(t.id)) {
          ids++;
          check(i, t.id, 'id');
        }
        for (const id of [...readIds(t.start, AFTER), ...readIds(t.end, UNTIL)]) {
          if (auto.has(id)) continue;
          refs++;
          check(i, id, 'reference');
        }
      });
      // No symbol for an auto id, nor one v12 does not read.
      for (const s of parsed.symbols) if (auto.has(s.name)) fail(`symbol for auto id ${s.name}`);

      const folds = doc.foldingRanges().filter((f) => f.kind === 'section');
      for (let k = 1; k < folds.length; k++) {
        if (folds[k]!.range.start < folds[k - 1]!.range.end) fail('section folds overlap');
      }
      // The k-th `section` statement starts the fold of v12's k-th section.
      const sectionStarts = parsed.ast.children
        .filter((n) => n.type === 'Section')
        .map((n) => n.range.start);
      parsed.model.tasks.forEach((task, i) => {
        const want = model.tasks[i]!.section;
        const holding = folds.filter((f) => within(task.range, f.range));
        if (want === null) {
          if (holding.length > 0) fail(`${task.ast} is in a section fold, v12 has none`);
          return;
        }
        inSections++;
        const k = holding.length === 1 ? sectionStarts.indexOf(holding[0]!.range.start) : -1;
        if (k !== want) fail(`${task.ast}: in ${holding.length} folds (section ${k}), v12 ${want}`);
      });
    }
    expect(checked).toBeGreaterThan(500);
    expect(ids).toBeGreaterThan(800);
    expect(refs).toBeGreaterThan(400);
    expect(inSections).toBeGreaterThan(1200);
    expect(problems).toEqual([]);
  }, 300_000);

  it('loads the facet from the generated registry (#385)', () => {
    const row = firstPartyFacets.find((e) => e.type === 'gantt');
    expect(row?.load).toBeTypeOf('function');
    expect(service.update('x:///g', 'gantt\n  a :a1, 2024-01-01, 1d').facet?.id).toBe('gantt');
  });
});
