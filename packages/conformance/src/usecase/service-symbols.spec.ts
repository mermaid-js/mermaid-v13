import { describe, expect, it } from 'vitest';
import { language } from '@mermaid-js/diagram-usecase/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { usecaseCases, usecaseCorpus } from './corpus.ts';
import { USECASE_V12_TYPES, usecaseV12Snapshot } from './v12.ts';
import type { UsecaseSnapshot } from './v12.ts';
import { parseUsecaseForParity, usecaseV13Snapshot } from './v13.ts';

/**
 * The oracle expectations re-run through the language service for usecase (language.md step 8,
 * D99 suite 2, R-LANG-1, D477, #568), checked against the mermaid v12 DB over the usecase corpus
 * and cases, on every source v12 accepts and whose model v13 reads as v12 does:
 * - every v12 actor, use case, system boundary, JSON table and explicit relation id resolves,
 *   from each of its occurrences, to one definition, its first occurrence by offset, and
 *   references from any occurrence give the same list, all of them. A quoted element is named
 *   by its label and a bare mention of its id is the same symbol (D191, #563);
 * - every definition the service gives is a v12 element or relation id;
 * - each v12 boundary folds over the members declared in it;
 * - renaming each element to a fresh id, v12 reads the new text with that id (and a quoted
 *   element's label) changed and nothing else; renaming one to another element's id is refused.
 *
 * The service loads the facet through the generated registry row (usecase's manifest
 * `language` entry, #567).
 */
const FRESH = 'renamedZq7';
const key = (r: Range | undefined) => (r ? `${r.start}:${r.end}` : 'none');
const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;
const generatedId = (label: string) => label.replace(/\W/g, '_');

function apply(text: string, edits: readonly { range: Range; newText: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

/** `snap` with element `from` renamed `to`: its id everywhere, and a quoted one's label. */
function renamed(snap: UsecaseSnapshot, from: string, to: string, quoted: boolean) {
  const id = (v: string) => (v === from ? to : v);
  const opt = (v: string | undefined) => (v === undefined ? v : id(v));
  // A quoted element's label is its name; a bare id keeps its label (its id, or one written).
  const label = (e: { id: string; label: string }) => (quoted && e.id === from ? to : e.label);
  return {
    ...snap,
    actors: snap.actors.map((a) => ({
      ...a,
      id: id(a.id),
      label: label(a),
      parentId: opt(a.parentId),
    })),
    useCases: snap.useCases.map((u) => ({
      ...u,
      id: id(u.id),
      label: label(u),
      parentId: opt(u.parentId),
    })),
    boundaries: snap.boundaries.map((b) => ({
      ...b,
      id: id(b.id),
      label: label(b),
      members: b.members.map(id),
    })),
    relationships: snap.relationships.map((r) => ({
      ...r,
      id: id(r.id),
      source: id(r.source),
      target: id(r.target),
    })),
    notes: snap.notes.map((n) => ({ ...n, target: id(n.target) })),
    jsonNodes: snap.jsonNodes.map((j) => ({ ...j, id: id(j.id) })),
  };
}

describe('usecase symbols, folding and rename through the service match v12', () => {
  it('over the corpus and cases', async () => {
    const oracle = await loadOracle();
    const service = createLanguageService();
    await service.preload({ types: ['usecase'] });
    const problems: string[] = [];
    const n = { checked: 0, names: 0, quoted: 0, folds: 0, renamed: 0, clashes: 0 };
    for (const item of [...(await usecaseCorpus()), ...usecaseCases()]) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || !USECASE_V12_TYPES.includes(v12.diagramType)) continue;
      const snap = usecaseV12Snapshot(v12.db);
      try {
        const mine = usecaseV13Snapshot(parseUsecaseForParity(item.source));
        if (JSON.stringify(mine) !== JSON.stringify(snap)) continue;
      } catch {
        continue;
      }
      const doc: DocumentSnapshot = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'usecase') continue;
      n.checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const text = doc.text;
      const symbols = language.parse(text, { keepTokens: true }).symbols;
      // Every v12 id, with the symbol name the service knows it by.
      const elements = [
        ...snap.actors.map((e) => ({ id: e.id, label: e.label })),
        ...snap.useCases.map((e) => ({ id: e.id, label: e.label })),
        ...snap.boundaries.map((e) => ({ id: e.id, label: e.label })),
        ...snap.jsonNodes.map((e) => ({ id: e.id, label: e.id })),
        ...snap.relationships.filter((r) => r.explicitId).map((r) => ({ id: r.id, label: r.id })),
      ];
      const ids = new Set(elements.map((e) => e.id));
      for (const e of elements) {
        const quoted = e.label !== e.id && generatedId(e.label) === e.id;
        const name = quoted ? e.label : e.id;
        // The occurrences the service reads: the name, the name in quotes, a quoted one's id.
        const at = symbols
          .filter((s) => s.name === name)
          .map((s) => {
            const t = text.slice(s.range.start, s.range.end);
            if (t === name || t === e.id) return s.range;
            const q = /^"`|^["']/.exec(t)?.[0].length ?? 0;
            const inner = { start: s.range.start + q, end: s.range.end - q };
            return q > 0 && text.slice(inner.start, inner.end) === name ? inner : undefined;
          })
          .filter((r): r is Range => r !== undefined)
          .sort((a, b) => a.start - b.start);
        // Not written as its name (an entity code in a label): the service drops it.
        if (at.length === 0) continue;
        n.names++;
        if (quoted) n.quoted++;
        const def = at[0];
        for (const o of at) {
          const d = doc.definition(o.start);
          if (key(d) !== key(def)) fail(`${e.id}: definition ${key(d)}, want ${key(def)}`);
        }
        const lists = new Set(at.map((o) => doc.references(o.start).map(key).join(' ')));
        if (lists.size !== 1) fail(`${e.id}: references differ by occurrence`);
        const refs = doc.references(at[0]!.start);
        if (refs.length !== at.length) fail(`${e.id}: ${refs.length} references of ${at.length}`);

        // Rename to a fresh id, and to another element's id.
        if (text.includes(FRESH) || e.id === FRESH) continue;
        const result = doc.rename(at[0]!.start, FRESH);
        if ('refused' in result) {
          // A bare id renamed reads back; a refusal here is a missed occurrence.
          fail(`${e.id}: rename refused: ${result.refused}`);
        } else {
          const after = await oracle.parse(apply(text, result.edits));
          if (!after.accepted) fail(`${e.id}: v12 rejects the renamed text`);
          else {
            const read = usecaseV12Snapshot(after.db);
            // A bare id that is its own label (no label written) takes the new name as label.
            for (const x of [...read.actors, ...read.useCases, ...read.boundaries]) {
              if (!quoted && x.id === FRESH && x.label === FRESH && e.label === e.id)
                x.label = e.id;
            }
            const got = JSON.stringify(read);
            const want = JSON.stringify(renamed(snap, e.id, FRESH, quoted));
            if (got !== want) fail(`${e.id}: v12 reads the renamed text differently`);
            else n.renamed++;
          }
        }
        const other = elements.find((x) => x.id !== e.id && x.label === x.id);
        if (other) {
          const clash = doc.rename(at[0]!.start, other.id);
          if (!('refused' in clash)) fail(`${e.id}: renamed to the existing id ${other.id}`);
          else n.clashes++;
        }
      }
      // Every definition is a v12 id (or, for a quoted element, its label's id).
      for (const s of symbols) {
        if (s.role !== 'def') continue;
        if (!ids.has(s.name) && !ids.has(generatedId(s.name))) fail(`${s.name}: no v12 element`);
      }
      // Each boundary folds over the members declared in it.
      const folds = doc.foldingRanges().filter((f) => f.kind === 'boundary');
      for (const b of snap.boundaries) {
        if (b.members.length === 0) continue;
        // The fold whose header names the boundary: `systemBoundary <name>`.
        const fold = folds.find((f) =>
          symbols.some(
            (s) =>
              s.kind === 'boundary' &&
              (s.name === b.id || generatedId(s.name) === b.id) &&
              /^systemBoundary[\t ]+$/.test(text.slice(f.range.start, s.range.start))
          )
        );
        if (!fold) {
          fail(`boundary ${b.id}: no fold`);
          continue;
        }
        n.folds++;
        for (const m of b.members) {
          const mentioned = symbols.some(
            (s) => (s.name === m || generatedId(s.name) === m) && inside(s.range, fold.range)
          );
          if (!mentioned) fail(`boundary ${b.id}: member ${m} outside its fold`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(n.checked).toBeGreaterThan(100);
    expect(n.names).toBeGreaterThan(300);
    expect(n.quoted).toBeGreaterThan(10);
    expect(n.folds).toBeGreaterThan(10);
    expect(n.renamed).toBeGreaterThan(300);
    expect(n.clashes).toBeGreaterThan(100);
  }, 300_000);

  it('loads the facet from the generated registry (#567)', async () => {
    expect(firstPartyFacets.find((e) => e.type === 'usecase')?.load).toBeTypeOf('function');
    const service = createLanguageService();
    await service.preload({ types: ['usecase'] });
    expect(service.update('x:///u', 'usecase-beta\n  actor A\n').facet?.id).toBe('usecase');
  });
});
