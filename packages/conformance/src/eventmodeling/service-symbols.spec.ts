import { describe, expect, it } from 'vitest';
import {
  detectEventModeling,
  eventModelingLanguage,
  parseEventModel,
} from '@mermaid-js/diagram-eventmodeling/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { eventModelingCorpus } from './corpus.ts';
import { eventModelingV12Snapshot } from './v12.ts';
import { eventModelingV13Snapshot, parseEventModelForParity } from './v13.ts';

/**
 * The oracle expectations re-run through the language service for event modeling (language.md
 * step 8, D99 suite 2, R-LANG-1, D528, #609), checked against the mermaid v12 DB over the event
 * modeling corpus, on every source v12 accepts that the service reads with no error:
 * - each v12 frame id is one `frame` definition, at its frame; each `->>` id naming a frame,
 *   each `note` and `gwt` frame id resolves to it, and its references are exactly those;
 * - each `[[name]]` v12 shows a data block for resolves to the first `data` block of that name;
 * - hover on each frame names v12's relations into it as its sources (explicit or inferred)
 *   and v12's lane label, where the lanes equal v12's (D522 merges repeated namespace lanes,
 *   which moves an inferred source: the listed divergences);
 * - each v12 data block and note has a fold of its kind (a block runs over lines);
 * - renaming a frame id to a fresh id, v12 reads the new text as the same model with the id
 *   changed and nothing else.
 *
 * The service gets the facet as an eager row, as a host bundling it would, until event
 * modeling's manifest has its `language` entry (#611); the last test then fails: drop the row.
 */
const service = createLanguageService({
  facets: [
    {
      type: 'eventmodeling',
      id: 'eventmodeling',
      detector: (t) => detectEventModeling(t),
      facet: eventModelingLanguage,
    },
  ],
});

const FRESH = '987';
const key = (r: Range | undefined) => (r ? `${r.start}:${r.end}` : 'none');

function apply(text: string, edits: readonly { range: Range; newText: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

/** `value` with every string equal to `from` written as `to`. */
function swap(value: unknown, from: string, to: string): unknown {
  if (value === from) return to;
  if (Array.isArray(value)) return value.map((v) => swap(v, from, to));
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swap(v, from, to)]));
  return value;
}

/** The frame ids a hover names as the frame's sources (its `Source…` line, not `Source of`). */
function hoverSources(contents: string): string[] {
  const line = contents.split('\n\n').find((l) => /^(?:Source,|Sources \()/.test(l)) ?? '';
  return [...line.matchAll(/`(\d{1,3})` \(/g)].map((m) => m[1] ?? '');
}

describe('event modeling symbols, hover, folding and rename through the service match v12', () => {
  it('over the corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    const n = { sources: 0, frames: 0, refs: 0, data: 0, hovers: 0, lanes: 0, folds: 0 };
    let renamed = 0;
    for (const item of await eventModelingCorpus()) {
      const text = item.source;
      const v12 = await oracle.parse(text);
      if (!v12.accepted || v12.diagramType !== 'eventmodeling') continue;
      const doc: DocumentSnapshot = service.update(`corpus:///${item.id}`, text);
      if (doc.facet?.id !== 'eventmodeling') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      n.sources++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const want = eventModelingV12Snapshot(v12.db);
      const sameLanes =
        JSON.stringify(eventModelingV13Snapshot(parseEventModelForParity(text)).lanes) ===
        JSON.stringify(want.lanes);
      const { symbols } = parseEventModel(text);
      const defs = symbols.filter((s) => s.kind === 'frame' && s.role === 'def');

      for (const f of want.frames) {
        n.frames++;
        const def = defs.filter((s) => s.name === f.id);
        if (def.length !== 1) {
          fail(`frame ${f.id}: ${def.length} definitions`);
          continue;
        }
        const at = def[0]!.range;
        const refs = symbols.filter((s) => s.kind === 'frame' && s.name === f.id);
        const listed = doc.references(at.start, true).map((r) => key(r));
        if (JSON.stringify(listed.sort()) !== JSON.stringify(refs.map((s) => key(s.range)).sort()))
          fail(`frame ${f.id}: references ${listed.join(' ')}`);
        for (const r of refs) {
          n.refs++;
          if (key(doc.definition(r.range.start)) !== key(at))
            fail(`frame ${f.id} @${r.range.start}: definition`);
        }
        // Hover: v12's relations into the frame, and its lane label.
        const hover = doc.hover(at.start);
        n.hovers++;
        const target = want.boxes.findIndex((b) => b.frame === f.id);
        const sources = want.relations.filter((r) => r.target === f.id).map((r) => r.source);
        const shown = hoverSources(hover?.contents ?? '');
        // Where lanes differ (D522, listed divergences), so may the inferred source.
        if (sameLanes && JSON.stringify([...shown].sort()) !== JSON.stringify([...sources].sort()))
          fail(`frame ${f.id}: hover sources ${shown.join(',')}, v12 ${sources.join(',')}`);
        const lane = want.lanes.find((l) => l.index === want.boxes[target]?.lane);
        if (sameLanes && lane) {
          n.lanes++;
          if (!hover?.contents.includes(`In the **${lane.label}** lane.`))
            fail(`frame ${f.id}: hover lane, v12 ${lane.label}`);
        }
      }

      // `[[name]]` with a data block: the first block of that name.
      const firstBlock = new Map<string, Range>();
      for (const s of symbols)
        if (s.kind === 'data' && s.role === 'def') firstBlock.set(s.name, s.range);
      for (const s of symbols) {
        if (s.kind !== 'data' || s.role !== 'ref') continue;
        n.data++;
        if (key(doc.definition(s.range.start)) !== key(firstBlock.get(s.name)))
          fail(`data ${s.name} @${s.range.start}: definition`);
      }
      for (const name of new Set(want.frames.map((f) => f.dataRef))) {
        if (name && want.dataBlocks.some((d) => d.name === name) && !firstBlock.has(name))
          fail(`data ${name}: no definition`);
      }

      // Folds: each data block and note (a block always runs over lines: `{` ends its line).
      const folds = doc.foldingRanges();
      const blocks = (kind: string, count: number) => {
        const got = folds.filter((f) => f.kind === kind).length;
        n.folds += got;
        if (got !== count) fail(`${kind} folds: ${got}, want ${count}`);
      };
      blocks('data', want.dataBlocks.length);
      blocks('note', want.notes.length);

      // Rename each frame id to a fresh id: v12 reads the same model, id aside.
      if (text.includes(FRESH)) continue;
      for (const def of defs) {
        const result = doc.rename(def.range.start, FRESH);
        if ('refused' in result) {
          fail(`rename ${def.name}: refused: ${result.refused}`);
          continue;
        }
        const next = await oracle.parse(apply(text, result.edits));
        renamed++;
        if (!next.accepted) {
          fail(`rename ${def.name}: v12 rejects the new text`);
          continue;
        }
        const got = swap(eventModelingV12Snapshot(next.db), FRESH, def.name);
        if (JSON.stringify(got) !== JSON.stringify(want)) fail(`rename ${def.name}: model`);
      }
    }
    expect(problems).toEqual([]);
    expect(n.sources).toBeGreaterThan(30);
    expect(n.frames).toBeGreaterThan(100);
    expect(n.refs).toBeGreaterThan(n.frames);
    expect(n.data).toBeGreaterThan(5);
    expect(n.lanes).toBeGreaterThan(50);
    expect(n.folds).toBeGreaterThan(5);
    expect(renamed).toBeGreaterThan(100);
  }, 120_000);

  it('is still unlisted (drop the eager row once the manifest has `language`)', () => {
    expect(firstPartyFacets.find((e) => e.type === 'eventmodeling')?.load).toBeUndefined();
  });
});
