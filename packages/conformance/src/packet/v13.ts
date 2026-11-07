/**
 * The v13 side of packet parity: the packet parser and the normaliser from its `PacketModel` to
 * the {@link PacketSnapshot} that `v12.ts` takes from mermaid\@12's packet DB.
 */
import {
  detectPacket,
  isWholeField,
  packetSectionOf,
  parsePacket,
} from '@mermaid-js/diagram-packet';
import type { PacketModel } from '@mermaid-js/diagram-packet';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { PACKET_V12_TYPES, packetV12Snapshot } from './v12.ts';
import type { PacketPieceSnapshot, PacketSnapshot } from './v12.ts';

export function packetV13Snapshot(model: PacketModel): PacketSnapshot {
  return {
    rows: model.rows.map((row) =>
      row.map((p): PacketPieceSnapshot => {
        const f = model.fields[p.field];
        const label = f?.label ?? '';
        const whole = f !== undefined && isWholeField(f, p);
        return whole ? [p.start, p.end, label, f.bits] : [p.start, p.end, label];
      })
    ),
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/**
 * The `packet` config a source sets (`packetSectionOf`: front matter, then each `%%{init}%%`).
 * The oracle applies neither (it reads the text without v12's config preprocessing), so parity
 * passes it to both sides.
 */
export const packetSection = (text: string): Record<string, unknown> | undefined =>
  packetSectionOf(preprocess(text));

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`); the
 * D218 fallback has its own specs in the packet package.
 */
export function parsePacketForParity(text: string): PacketModel {
  const pre = preprocess(text);
  const fm = pre.frontMatter && { ...pre.frontMatter, title: undefined };
  const result = parsePacket(text, {
    preprocessed: { ...pre, frontMatter: fm },
    config: packetSection(text),
  });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const packetAdapter: DiagramAdapter<PacketModel> = {
  id: 'packet',
  v12Types: PACKET_V12_TYPES,
  detect: (text) => detectPacket(text),
  parse: parsePacketForParity,
  normaliseV13: packetV13Snapshot,
  v12ConfigFor: (text) => {
    const packet = packetSection(text);
    return packet && { packet };
  },
  normaliseV12: packetV12Snapshot,
};
