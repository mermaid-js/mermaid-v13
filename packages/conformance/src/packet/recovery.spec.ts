import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parsePacket } from '@mermaid-js/diagram-packet';
import { LANGIUM_NAMES } from '@mermaid-js/diagram-packet/testing';
import { packetCases } from './corpus.ts';

/**
 * Recovery set (R-PARSE-4): the `packet-cases/recovery-…` items of `corpus/packet-cases.json`,
 * documents with N independent errors, semantic ones (D341) included, give N error diagnostics,
 * each on the line where it was planted (`errors`: code and 1-based line), and the fields around
 * them still reach the model (`keeps`: labels). No message names a token or a grammar rule
 * (R-ERR-5). mermaid\@12 rejects every one of them (parity, `parity.spec.ts`).
 */
interface RecoveryCase {
  id: string;
  source: string;
  errors: [code: string, line: number][];
  keeps: string[];
}

const CASES = packetCases().filter((c) =>
  c.id.startsWith('packet-cases/recovery-')
) as RecoveryCase[];

/** Token type names (`ACC_TITLE`, …) and grammar rule names, which no message may name. */
const INTERNAL = [
  ...Object.values(LANGIUM_NAMES).filter((n) => /^[A-Z_]{3,}$/.test(n)),
  'PacketBlock',
  'TitleAndAccessibilities',
  'EOL',
];

describe('packet recovery (R-PARSE-4)', () => {
  it('has at least 20 cases, semantic errors among them', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.some(([code]) => code.startsWith('PACKET_')))).not.toEqual(
      []
    );
  });

  for (const c of CASES) {
    it(c.id.slice('packet-cases/recovery-'.length), () => {
      const { model, diagnostics } = parsePacket(c.source);
      const lines = new LineIndex(c.source);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const labels = model.fields.map((f) => f.label);
      for (const k of c.keeps) expect(labels).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL) expect(d.message, d.message).not.toContain(name);
      }
    });
  }
});
