/**
 * The v12 side of packet parity: a plain-data snapshot of mermaid\@12's packet DB, in the shape
 * `v13.ts` builds from v13's `PacketModel`.
 *
 * Normalisation, chosen so the snapshot holds what v12 drew and nothing else:
 * - text has v12's `encodeEntities` placeholders decoded back to what the author wrote;
 * - rows are `getPacket()`'s, each piece `[start, end, label]`, plus `bits` for a piece that is
 *   a whole field. v12 gives a split field's pieces `bits` one short (`rowEnd - start`, so
 *   `11-90` has 20, 31, 26); its renderer never reads it, and v13's model has no per-piece
 *   `bits`. That off-by-one is the one listed divergence of the model, kept out of the
 *   comparison here and pinned by `parity.spec.ts`;
 * - the title is the in-text one: the oracle never passes the front matter on, so
 *   `getDiagramTitle()` holds no front-matter title (the v13 side leaves it out too).
 */
import { v12DecodeEntities as d } from '../v12-entities.ts';

/** `diagram.type` values mermaid\@12 reports for packet sources. */
export const PACKET_V12_TYPES = ['packet'];

export type PacketPieceSnapshot =
  | [start: number, end: number, label: string]
  | [start: number, end: number, label: string, bits: number];

export interface PacketSnapshot {
  rows: PacketPieceSnapshot[][];
  title: string;
  accTitle: string;
  accDescr: string;
}

export interface PacketBlockV12 {
  start: number;
  end: number;
  bits: number;
  label: string;
}

interface PacketDbV12 {
  getPacket(): PacketBlockV12[][];
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

/** Whether v12 kept this piece as a whole field: a split piece's `bits` is one short. */
export const wholeV12 = (b: PacketBlockV12): boolean => b.bits === b.end - b.start + 1;

export function packetV12Snapshot(dbValue: unknown): PacketSnapshot {
  const db = dbValue as PacketDbV12;
  return {
    rows: db
      .getPacket()
      .map((row) =>
        row.map(
          (b): PacketPieceSnapshot =>
            wholeV12(b) ? [b.start, b.end, d(b.label), b.bits] : [b.start, b.end, d(b.label)]
        )
      ),
    title: d(db.getDiagramTitle()),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
  };
}
