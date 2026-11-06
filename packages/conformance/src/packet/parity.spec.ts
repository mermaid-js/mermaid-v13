import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadDivergences } from '../divergences.ts';
import { loadOracle } from '../oracle.ts';
import { DIVERGENCES_FILE } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { packetGateCorpus } from './corpus.ts';
import { wholeV12 } from './v12.ts';
import type { PacketBlockV12 } from './v12.ts';
import { packetAdapter } from './v13.ts';

/**
 * Oracle parity for packet (R-COMPAT-2…4, #454) over the lexer gate's whole set: the e2e
 * fixtures and v12 spec strings (also in the main parity run), the cases and the line-separator
 * cases, each also with CRLF line breaks and with comment lines added. Accept/reject and the
 * normalised model (`v12.ts`, `v13.ts`) must agree, except listed divergences. Both sides parse
 * with the source's own `packet` config (`packetSection`), since rows depend on `bitsPerRow`.
 *
 * Excluded ({@link EXCLUDED}), with the reason the lexer gate gives: `unclosed-directive…`.
 * Core's preprocess ends an unclosed `%%{` at its line end and reports `UNCLOSED_DIRECTIVE`, so
 * v13 rejects what v12 accepted with the rest of the line (or the text) removed. That is core's
 * directive reading, shared by every type; the test below checks it still holds.
 *
 * Listed divergence of the model, kept out of the snapshot (`v12.ts`): v12's split pieces carry
 * `bits` one short; the last test pins it.
 */
const EXCLUDED = 'packet-cases/unclosed-directive';

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

describe('packet oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const items = (await packetGateCorpus()).filter((i) => !i.id.startsWith(EXCLUDED));
    const report = await runParity({
      adapters: [packetAdapter],
      corpus: each(items),
      divergences: loadDivergences(fileURLToPath(DIVERGENCES_FILE)),
    });
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `packet parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both)\n`
    );
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
    expect(agree.length).toBeGreaterThan(400);
    expect(rejected).toBeGreaterThan(100);
  }, 300_000);

  it('still differs on unclosed directives, in core (the exclusion above)', async () => {
    const items = (await packetGateCorpus()).filter((i) => i.id.startsWith(EXCLUDED));
    const report = await runParity({ adapters: [packetAdapter], corpus: each(items) });
    expect(items.length).toBeGreaterThan(0);
    for (const r of report.results) {
      expect(r.divergence?.kind, r.id).toBe('reject');
      expect(r.divergence?.detail, r.id).toMatch(/^UNCLOSED_DIRECTIVE/);
    }
  }, 60_000);

  it('v12 gives split pieces `bits` one short (the listed divergence)', async () => {
    const v12 = await (await loadOracle()).parse('packet\n0-10: "a"\n11-90: "b"');
    if (!v12.accepted) throw new Error(v12.error);
    const rows = (v12.db as { getPacket(): PacketBlockV12[][] }).getPacket();
    expect(rows.flat().map((b) => [b.start, b.end, b.bits, wholeV12(b)])).toEqual([
      [0, 10, 11, true],
      [11, 31, 20, false],
      [32, 63, 31, false],
      [64, 90, 26, false],
    ]);
  });
});
