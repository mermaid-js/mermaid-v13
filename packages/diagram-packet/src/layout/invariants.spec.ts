import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { FIXTURES, type Fixture } from './fixtures.ts';
import { layoutPacket, packetLayoutViolations, type PacketLayout } from './index.ts';

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

const lay = ({ model, config = {} }: Fixture, packet = {}): PacketLayout =>
  layoutPacket(model, {
    config: { packet: { ...config, ...packet } } as unknown as ResolvedConfig,
    measurer: tableMeasurer,
    theme: createTheme(spec),
  });

const ORDERS = [{}, { bitOrder: 'descending' }, { showBits: false }] as const;

describe('packet layout invariants (R-LAYOUT-3)', () => {
  it.each(Object.keys(FIXTURES))('%s holds them in both orders, with and without bits', (name) => {
    const f = FIXTURES[name]!;
    for (const o of ORDERS) expect(packetLayoutViolations(f.model, lay(f, o))).toEqual([]);
  });

  // Each rule finds the break it is there for.
  const tcp = FIXTURES.tcp!;
  const broken = (edit: (l: PacketLayout) => unknown, f: Fixture = tcp): string[] => {
    const l = JSON.parse(JSON.stringify(lay(f))) as PacketLayout;
    edit(l);
    return packetLayoutViolations(f.model, l);
  };
  type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
  const w = (l: PacketLayout) => l as Mutable<PacketLayout>;

  it.each([
    ['a NaN', (l: PacketLayout) => (w(l).rows[0]!.pieces[0]!.box.x = Number.NaN), /is NaN/],
    ['overlapping pieces', (l: PacketLayout) => (w(l).rows[0]!.pieces[1]!.box.x -= 10), /overlap/],
    [
      'a piece past the canvas',
      (l: PacketLayout) => (w(l).rows[0]!.pieces[1]!.box.x += 20),
      /outside \[1, /,
    ],
    ['a wrong width', (l: PacketLayout) => (w(l).rows[0]!.pieces[0]!.box.width += 1), /wide, not/],
    ['a lost piece', (l: PacketLayout) => w(l).rows[1]!.pieces.pop(), /pieces/],
    [
      'a row over bitsPerRow',
      (l: PacketLayout) => (w(l).rows[0]!.pieces[1]!.end += 1),
      /bits|cover/,
    ],
    ['a title over the rows', (l: PacketLayout) => (w(l).title!.y -= 60), /title/],
    [
      'content outside the bounds',
      (l: PacketLayout) => (w(l).bounds.width -= 5),
      /outside the bounds/,
    ],
    [
      'an off-centre label',
      (l: PacketLayout) => (w(l).rows[0]!.pieces[0]!.label.x += 3),
      /centred/,
    ],
    [
      'a misplaced bit number',
      (l: PacketLayout) => (w(l).rows[0]!.pieces[0]!.bitNumbers[0]!.y += 3),
      /bit number/,
    ],
  ] as const)('finds %s', (_, edit, message) => {
    const f = _ === 'a title over the rows' ? FIXTURES.tcpNoBits! : tcp;
    expect(broken(edit, f).join('\n')).toMatch(message);
  });

  it('allows the one field the row cap cuts short, only with PACKET_TRUNCATED', () => {
    const f = FIXTURES.truncated!;
    expect(packetLayoutViolations(f.model, lay(f))).toEqual([]);
    const silent = { ...f, model: { ...f.model, warnings: [] } };
    expect(packetLayoutViolations(silent.model, lay(silent)).join()).toMatch(/cover/);
  });
});
