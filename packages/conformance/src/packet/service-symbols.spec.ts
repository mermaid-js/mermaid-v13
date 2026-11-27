import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePacket } from '@mermaid-js/diagram-packet/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { inputHash, loadDivergences } from '../divergences.ts';
import { loadOracle } from '../oracle.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
import { packetGateCorpus } from './corpus.ts';
import type { PacketPieceSnapshot } from './v12.ts';
import { packetV12Snapshot } from './v12.ts';
import { packetAdapter } from './v13.ts';

/**
 * The oracle expectations re-run through the language service for packet (language.md step 8,
 * D99 suite 2, R-LANG-1, #458), as `pie/service-symbols.spec.ts` does for pie: definition,
 * references and folding asked at the places the parse output records, checked against the
 * mermaid v12 DB over the packet gate corpus (each source with its own `packet` config, since
 * rows depend on `bitsPerRow`):
 * - v12's fields, in order, are the field symbols, one each: a split field once, a repeated
 *   label once per field (D346);
 * - each is its own definition, the text between its quotes, with no references, though other
 *   fields have the same label;
 * - a multi-line v12 `accDescr` is an `accDescr` fold range.
 *
 * A label whose text between the quotes is not its name is not a service occurrence, so a
 * rename could not keep it: an escape (`"a\"b"`), an entity (`#amp;`), a quote v12 turned
 * inside a tag, a comment line or CRLF inside the label (counted in {@link ESCAPED}).
 *
 * Sources whose model is a listed parity divergence (D342's `bitsPerRow` 0 and -4, where v12
 * drew garbage or nothing) are skipped: v12's fields are not the written ones there.
 *
 * The service loads the facet through the generated registry row (packet's manifest
 * `language` entry, #462).
 */

/** v12 field labels written otherwise than their name in the corpus (skipped above). The six
 * newest are `"field one\ntwo"` in `label-syntax.mmd` and its compatibility twin (#1397), each
 * plain, with CRLF and commented. */
const ESCAPED = 55;

const service = createLanguageService();
await service.preload({ types: ['packet'] });
/** `id` and source hash of each listed model divergence. */
const DIVERGENT = new Set(
  loadDivergences(fileURLToPath(DIVERGENCES_DIR))
    .filter((d) => d.kind === 'model')
    .map((d) => `${d.id} ${d.inputHash}`)
);
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);

/**
 * v12's field labels in order. A piece v12 kept whole (it has `bits`) is a field; the pieces of
 * a split field run from row to row, each the last of its row but the final one.
 */
function v12Fields(rows: PacketPieceSnapshot[][]): string[] {
  const out: string[] = [];
  let open: string | undefined;
  for (const row of rows) {
    row.forEach((piece, i) => {
      const label = piece[2];
      const whole = piece.length === 4;
      const continues = !whole && i === 0 && open === label;
      if (!continues) out.push(label);
      open = !whole && i === row.length - 1 ? label : undefined;
    });
  }
  return out;
}

describe('packet definition, references and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let fields = 0;
    let escaped = 0;
    for (const item of await packetGateCorpus()) {
      if (DIVERGENT.has(`${item.id} ${inputHash(item.source)}`)) continue;
      const v12 = await oracle.parse(item.source, packetAdapter.v12ConfigFor?.(item.source));
      if (!v12.accepted || v12.diagramType !== 'packet') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'packet') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const model = packetV12Snapshot(v12.db);
      const parsed = parsePacket(item.source);
      const labels = v12Fields(model.rows);
      const truncated = parsed.diagnostics.some((d) => d.code === 'PACKET_TRUNCATED');
      // The row cap leaves later fields out of v12's rows; their symbols are still written.
      if (
        truncated ? parsed.symbols.length < labels.length : parsed.symbols.length !== labels.length
      )
        fail(`${parsed.symbols.length} field symbols for ${labels.length} v12 fields`);
      labels.forEach((label, i) => {
        const s = parsed.symbols[i];
        if (!s) return;
        if (s.name !== label) fail(`field ${i}: symbol ${JSON.stringify(s.name)}, v12 ${label}`);
        // The service has no symbol for an empty name (`0: ""`), for any type.
        if (label === '') return;
        fields++;
        const quoted = [`"${label}"`, `'${label}'`].includes(text(doc, s.range));
        if (!quoted) {
          escaped++;
          return;
        }
        const own = { start: s.range.start + 1, end: s.range.end - 1 };
        const cursor = own.start;
        const d = doc.definition(cursor);
        if (!d || d.start !== own.start || d.end !== own.end)
          fail(`${label}: definition ${d && JSON.stringify(text(doc, d))} at ${d?.start}`);
        const refs = doc.references(cursor);
        if (refs.length !== 1 || refs[0]?.start !== own.start)
          fail(`${label}: ${refs.length} references, not the field alone`);
        if (doc.references(cursor, false).length !== 0) fail(`${label}: references besides itself`);
      });
      const multiLine = /[\r\n]/.test(model.accDescr);
      const fold = doc.foldingRanges().some((f) => f.kind === 'accDescr');
      if (multiLine && !fold) fail('a multi-line accDescr has no fold range');
    }
    expect(checked).toBeGreaterThan(250);
    expect(fields).toBeGreaterThan(600);
    expect(escaped).toBe(ESCAPED);
    expect(problems).toEqual([]);
  }, 300_000);

  it('loads the facet from the generated registry (#462)', () => {
    const row = firstPartyFacets.find((e) => e.type === 'packet');
    expect(row?.load).toBeTypeOf('function');
    expect(service.update('x:///p', 'packet\n0-7: "a"\n').facet?.id).toBe('packet');
  });
});
