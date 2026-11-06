import { describe, expect, it } from 'vitest';
import { packetLanguage, parsePacket } from '@mermaid-js/diagram-packet/language';
import { packetGateCorpus } from './corpus.ts';

/**
 * Completion's next start bit (#458) against the parser: at every line start of the packet
 * gate corpus where completion offers a bit, it is the start a `+1` field written there gets
 * when the whole text above is parsed. Completion parses only the lines since the last field
 * node, behind a stand-in field; this pins that shortcut to the parser's own count (v12's
 * `lastBit`), broken fields, reversed ranges, `+0` and statements in between included.
 */
describe('packet completion offers the bit the parser would start a field at', () => {
  it('over the gate corpus', async () => {
    const problems: string[] = [];
    let checked = 0;
    for (const { id, source } of await packetGateCorpus()) {
      // The cap cases are long and add nothing a short source does not.
      if (source.length > 20_000) continue;
      for (let at = 0; at <= source.length; at++) {
        if (at > 0 && source[at - 1] !== '\n') continue;
        const result = packetLanguage.parse(source, { keepTokens: true, probe: at });
        const items = packetLanguage.completions(result.probe!, { text: source, result });
        const bit = items.find((i) => /^\d+$/.test(i.label));
        if (!bit) continue;
        checked++;
        const { children } = parsePacket(`${source.slice(0, bit.range.start)}+1: ""`).ast;
        const last = children[children.length - 1];
        const want = last?.type === 'Field' ? String(last.start) : '0';
        if (bit.label !== want) problems.push(`${id} @${at}: ${bit.label}, the parser ${want}`);
      }
    }
    expect(checked).toBeGreaterThan(5000);
    expect(problems).toEqual([]);
  }, 120_000);
});
