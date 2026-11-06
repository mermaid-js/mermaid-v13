import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { layoutPacket, packet, parsePacket } from '@mermaid-js/diagram-packet';
import { packetLayoutViolations } from '@mermaid-js/diagram-packet/testing';
import type { CorpusItem } from '../types.ts';
import { packetGateCorpus } from './corpus.ts';
import { packetSection } from './v13.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #456): every source of the packet
 * gate corpus (e2e fixtures, v12 spec strings, the cases, each also with CRLF and comment
 * lines) parsed by the v13 parser with its own `packet` config, rejected sources included (the
 * model of what parsed), laid out with that config and with each override below, gives no
 * `packetLayoutViolations`. The row split is the model's, so no override sets `bitsPerRow`.
 */
const OVERRIDES = [
  {},
  { bitOrder: 'descending' },
  { showBits: false },
  { bitOrder: 'descending', showBits: false },
  { rowHeight: 1, bitWidth: 1, paddingX: 0, paddingY: 0 },
  { paddingX: 40, paddingY: 0, bitWidth: 7.5 },
];

let spec: ThemeSpec;
let corpus: CorpusItem[];
beforeAll(async () => {
  spec = await loadTheme('default');
  corpus = await packetGateCorpus();
});

describe('packet layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus, in both bit orders and every option set', () => {
    const theme = createTheme(spec, { diagram: packet.theme });
    const failures: string[] = [];
    let pieces = 0;
    let split = 0;
    let truncated = 0;
    for (const item of corpus) {
      const section = packetSection(item.source);
      const { model } = parsePacket(item.source, { config: section });
      pieces += model.rows.reduce((n, r) => n + r.length, 0);
      if (model.rows.some((r) => r.some((p) => model.fields[p.field]!.end !== p.end))) split++;
      if (model.warnings.some((w) => w.code === 'PACKET_TRUNCATED')) truncated++;
      for (const o of OVERRIDES) {
        const layout = layoutPacket(model, {
          config: { packet: { ...section, ...o } } as unknown as ResolvedConfig,
          measurer: tableMeasurer,
          theme,
        });
        const v = packetLayoutViolations(model, layout);
        if (v.length > 0)
          failures.push(`${item.id} ${JSON.stringify(o)}: ${v.slice(0, 3).join('; ')}`);
      }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(6);
    expect(split).toBeGreaterThan(10);
    expect(truncated).toBeGreaterThan(0);
    expect(pieces).toBeGreaterThan(10_000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 240_000);
});
