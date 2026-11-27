/**
 * Hand-built `PacketModel` fixtures for the layout specs, written as v12 would parse the packet
 * source above each one, with the `packet` config they are laid out with.
 */
import type { PacketDiagramConfig } from '@mermaid-js/core/config';
import type { PacketField, PacketModel, PacketPiece } from '../model.ts';

/** A field `[start, end, label]`. */
export type FieldSpec = readonly [number, number, string];

export interface Fixture {
  readonly model: PacketModel;
  readonly config?: Readonly<PacketDiagramConfig>;
}

const field = ([start, end, label]: FieldSpec): PacketField => ({
  start,
  end,
  bits: end - start + 1,
  label,
  astId: `field:${start}-${end}`,
});

/**
 * A model of contiguous fields from bit 0, split at every row end as v12 does; `maxRows` cuts
 * the rows as the 10,000-row cap does (a cut field keeps its written end, a dropped one goes).
 */
export function model(
  fields: readonly FieldSpec[],
  extra: Partial<PacketModel> & { readonly maxRows?: number } = {}
): PacketModel {
  const { maxRows = Infinity, ...rest } = extra;
  const bitsPerRow = rest.bitsPerRow ?? 32;
  const rows: PacketPiece[][] = [];
  const kept: PacketField[] = [];
  for (const f of fields) {
    for (let start = f[0]; start <= f[1]; ) {
      const row = Math.floor(start / bitsPerRow);
      if (row >= maxRows) break;
      if (start === f[0]) kept.push(field(f));
      const end = Math.min(f[1], (row + 1) * bitsPerRow - 1);
      (rows[row] ??= []).push({ field: kept.length - 1, start, end });
      start = end + 1;
    }
  }
  return {
    fields: kept,
    rows,
    bitsPerRow,
    accTitle: '',
    accDescr: '',
    warnings: [],
    ...rest,
  };
}

const TCP: readonly FieldSpec[] = [
  [0, 15, 'Source Port'],
  [16, 31, 'Destination Port'],
  [32, 63, 'Sequence Number'],
  [64, 95, 'Acknowledgment Number'],
  [96, 99, 'Data Offset'],
  [100, 105, 'Reserved'],
  [106, 106, 'URG'],
  [107, 107, 'ACK'],
  [108, 108, 'PSH'],
  [109, 109, 'RST'],
  [110, 110, 'SYN'],
  [111, 111, 'FIN'],
  [112, 127, 'Window'],
  [128, 143, 'Checksum'],
  [144, 159, 'Urgent Pointer'],
  [160, 191, '(Options and Padding)'],
  [192, 223, 'data'],
];

export const REGISTER: readonly FieldSpec[] = [
  [0, 7, 'DATA'],
  [8, 11, 'TYPE'],
  [12, 12, 'EN'],
  [13, 15, 'RESERVED'],
];

const SPLIT: readonly FieldSpec[] = [
  [0, 10, 'test'],
  [11, 90, 'multiple'],
];

export const FIXTURES: Readonly<Record<string, Fixture>> = {
  // e2e should-render-a-complex-packet-diagram.mmd
  tcp: { model: model(TCP) },
  // the e2e TCP header with `showBits: false`: a front-matter title, no bit numbers.
  tcpNoBits: { model: model(TCP, { title: 'Packet Diagram' }), config: { showBits: false } },
  // …-with-descending-bit-order.mmd
  register: {
    model: model(REGISTER, { bitsPerRow: 16, title: 'Status Register' }),
    config: { showBits: true, bitOrder: 'descending', bitsPerRow: 16 },
  },
  // packet-beta / title Hello world / 0-10: "hello"
  hello: { model: model([[0, 10, 'hello']], { title: 'Hello world' }) },
  // packet / 0: "h" / 1: "i"
  single: {
    model: model([
      [0, 0, 'h'],
      [1, 1, 'i'],
    ]),
  },
  // v12 packet.spec: 0-10 "test", 11-90 "multiple" splits over three rows.
  split: { model: model(SPLIT) },
  // The same, descending: the part-filled last row is flush right.
  splitDescending: { model: model(SPLIT), config: { bitOrder: 'descending' } },
  // v12 packet.spec: cut at an exact row end.
  splitExact: {
    model: model([
      [0, 16, 'test'],
      [17, 63, 'multiple'],
    ]),
  },
  // A long label in a one-bit field shrinks to the bit-number size, then overflows (D343).
  longLabel: {
    model: model([
      [0, 0, 'A label far wider than one bit'],
      [1, 31, 'Rest'],
    ]),
  },
  // Labels and title through core's label layout (D343): `<br>` breaks, an entity decodes.
  breaks: {
    model: model(
      [
        [0, 15, 'First<br>line'],
        [16, 31, 'Tom &amp; Jerry'],
      ],
      { title: 'Two<br/>lines' }
    ),
  },
  // A label of four lines grows its row; the rows below and the title move down (D740, #1267).
  tallLabel: {
    model: model(
      [
        [0, 15, 'one<br>two<br>three<br>four'],
        [16, 31, 'ok'],
        [32, 47, 'a<br>b<br>c'],
        [48, 63, 'd'],
      ],
      { title: 'Grown rows' }
    ),
  },
  // e2e nightly-check bit-numbers-crowded.mmd (#1268): 3-digit numbers in 2-bit fields at
  // bitWidth 12 meet the next number, so their end numbers are dropped (D747).
  crowded: {
    model: model(
      [
        [0, 95, 'Filler'],
        [96, 97, 'a'],
        [98, 99, 'b'],
        [100, 101, 'c'],
        [102, 103, 'd'],
        [104, 104, 'e'],
        [105, 105, 'f'],
        [106, 111, 'g'],
      ],
      { bitsPerRow: 16 }
    ),
    config: { bitWidth: 12, bitsPerRow: 16 },
  },
  // A title far wider than the canvas (D344).
  wideTitle: {
    model: model([[0, 3, 'a']], {
      bitsPerRow: 4,
      title: 'A title far wider than four bits of thirty-two px',
    }),
    config: { bitsPerRow: 4 },
  },
  // packet / title Empty; and nothing at all.
  titleOnly: { model: model([], { title: 'Empty' }) },
  empty: { model: model([]) },
  // paddingX wider than a bit: one-bit pieces are 0 wide, never negative (D342).
  widePadding: {
    model: model([
      [0, 0, 'a'],
      [1, 7, 'b'],
    ]),
    config: { paddingX: 40 },
  },
  // Small geometry: 1 px rows and bits, no padding, no bit numbers.
  tiny: {
    model: model(
      [
        [0, 2, 'a'],
        [3, 9, 'b'],
      ],
      { bitsPerRow: 4, title: 't' }
    ),
    config: { rowHeight: 1, bitWidth: 1, paddingX: 0, paddingY: 0, showBits: false, bitsPerRow: 4 },
  },
  // Config the parser rejected (D342): the layout falls back to the defaults, with no warning.
  invalidConfig: {
    model: model([[0, 31, 'a']]),
    config: { rowHeight: 0, bitWidth: -3, paddingX: -1, paddingY: Number.NaN },
  },
  // The 10,000-row cap cuts a field part-way: it keeps its written end (D342).
  truncated: {
    model: model([[0, 99_999, 'huge']], {
      bitsPerRow: 1,
      maxRows: 10_000,
      warnings: [
        {
          severity: 'warning',
          code: 'PACKET_TRUNCATED',
          message: 'truncated',
          range: { start: 0, end: 0 },
        },
      ],
    }),
    config: { bitsPerRow: 1 },
  },
};
