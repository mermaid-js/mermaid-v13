import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid, type ExtensionPlugin, type InitializeConfig } from 'mermaid';
import { REPO_ROOT } from './index.ts';

// Icon frames have room around the glyph (#1150, D685): square and rounded frames are the
// glyph's square plus half of `flowchart.padding` (v12's `iconSquare` and `iconRounded` add all
// of it), rounded corners 5; the circle is the glyph's diagonal plus half the padding, tighter
// than v12's diagonal + 40. The label sits 8 px from a frame (v12), and edges end on the frame.
const FIXTURE = join(REPO_ROOT, 'e2e/diagrams/flowchart/baseline/icons/default.mmd');
const PAD = 15; // flowchart.padding default
const ROOM = PAD / 4; // on each side of the glyph

/** A glyph that fills the square it is asked for, so where it lands is visible. */
const glyphs: ExtensionPlugin = {
  id: 'square-glyphs',
  glyphs: {
    glyph: (_name, { size }) => ({
      tag: 'rect',
      attrs: { class: 'fixture-glyph', width: size, height: size },
    }),
  },
};

type Pt = readonly [number, number];
const num = (s: string): number[] => s.trim().split(/[ ,]+/).map(Number);
const attr = (tag: string, name: string): number =>
  Number(new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]);

interface Frame {
  readonly kind: 'rect' | 'circle';
  /** Left, top, right, bottom of the frame, in the node's coordinates. */
  readonly box: readonly [number, number, number, number];
  readonly rx?: number;
}
interface IconNode {
  readonly at: Pt;
  readonly frame?: Frame;
  /** Left, top, size of the glyph's square. */
  readonly glyph: readonly [number, number, number];
  /** The label's baseline, when it has one. */
  readonly text?: number;
}

async function draw(config: InitializeConfig = {}): Promise<string> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  await m.registerExternalDiagrams([glyphs]);
  return (await m.render('m', readFileSync(FIXTURE, 'utf8'))).svg;
}

function nodes(svg: string): Map<string, IconNode> {
  const out = new Map<string, IconNode>();
  for (const n of svg.matchAll(
    /<g class="node [^"]*" data-id="([^"]+)"[^>]*transform="translate\(([^)]*)\)">([\s\S]*?)<\/g>(?:<text [^>]*y="([^"]*)")?/g
  )) {
    const [, id, at, body, text] = n;
    const rect = /^<rect [^>]*>/.exec(body!)?.[0];
    const circle = /^<circle [^>]*>/.exec(body!)?.[0];
    let frame: Frame | undefined;
    if (rect) {
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((k) => attr(rect, k));
      frame = { kind: 'rect', box: [x!, y!, x! + w!, y! + h!], rx: attr(rect, 'rx') };
    } else if (circle) {
      const [cy, r] = [attr(circle, 'cy'), attr(circle, 'r')];
      frame = { kind: 'circle', box: [-r, cy - r, r, cy + r] };
    }
    const [gx, gy] = num(/<g transform="translate\(([^)]*)\)">/.exec(body!)![1]!);
    const size = attr(/<rect class="fixture-glyph"[^>]*>/.exec(body!)![0], 'width');
    const [x, y] = num(at!);
    out.set(id!, {
      at: [x!, y!],
      frame,
      glyph: [gx!, gy!, size],
      text: text === undefined ? undefined : Number(text),
    });
  }
  return out;
}

/** The room between the glyph's square and a square frame: left, top, right, bottom. */
function room({ frame, glyph: [gx, gy, size] }: IconNode): number[] {
  const [l, t, r, b] = frame!.box;
  return [gx - l, gy - t, r - (gx + size), b - (gy + size)];
}

describe('flowchart icon frames (#1150)', () => {
  it('pads square and rounded frames by a quarter of flowchart.padding a side, rounded corners 5', async () => {
    const all = nodes(await draw());
    for (const id of ['square', 'rounded', 'aws']) {
      const node = all.get(id)!;
      expect(node.frame?.kind, id).toBe('rect');
      for (const side of room(node)) expect(side, id).toBeCloseTo(ROOM, 6);
    }
    expect(all.get('rounded')!.frame!.rx).toBe(5);
    expect(all.get('square')!.frame!.rx).toBeNaN();
  });

  it('makes the circle the glyph diagonal plus half of flowchart.padding, centred on the glyph', async () => {
    const all = nodes(await draw());
    for (const id of ['circle', 'styled']) {
      const { frame, glyph } = all.get(id)!;
      const [gx, gy, size] = glyph;
      const [l, t, r] = frame!.box;
      const radius = (r - l) / 2;
      expect(2 * radius, id).toBeCloseTo(size * Math.SQRT2 + PAD / 2, 1);
      expect(gx + size / 2, id).toBeCloseTo((l + r) / 2, 6);
      expect(gy + size / 2, id).toBeCloseTo(t + radius, 2);
      // The glyph's corners lie inside the circle, a quarter of the padding to spare.
      expect(radius - (size * Math.SQRT2) / 2, id).toBeCloseTo(ROOM, 1);
    }
  });

  it('follows a custom flowchart.padding', async () => {
    const all = nodes(await draw({ flowchart: { padding: 30 } }));
    for (const side of room(all.get('square')!)) expect(side).toBeCloseTo(7.5, 6);
    const [l, , r] = all.get('circle')!.frame!.box;
    expect(r - l).toBeCloseTo(48 * Math.SQRT2 + 15, 1);
  });

  it('keeps the label 8 px from a frame, 2 px more than from a bare glyph', async () => {
    const all = nodes(await draw());
    const plain = all.get('plain')!;
    const square = all.get('square')!;
    const below = (n: IconNode, bottom: number) => n.text! - bottom;
    expect(plain.frame).toBeUndefined();
    expect(
      below(square, square.frame!.box[3]) - below(plain, plain.glyph[1] + plain.glyph[2])
    ).toBeCloseTo(2, 6);
  });

  it('ends every edge on the frame, not on the glyph or the label box', async () => {
    // No gap before the arrowhead, so a target end is the arrowhead's tip.
    const svg = await draw({ themeVariables: { arrowheadGap: 0 } } as InitializeConfig);
    const all = nodes(svg);
    let checked = 0;
    for (const e of svg.matchAll(
      /<g class="edge [^"]*" data-id="[^"]*" data-ast="e:([^&"]+)&gt;([^"]+)">(.*?)<\/g>/g
    )) {
      const line = /<path d="M([^A-Z]*)/.exec(e[3]!)![1]!;
      const tip = /class="marker" d="M([^LZ]*)/.exec(e[3]!)![1]!;
      for (const [id, p] of [
        [e[1]!, num(line)],
        [e[2]!, num(tip)],
      ] as const) {
        const node = all.get(id)!;
        if (!node.frame) continue;
        const [x, y] = [p[0]! - node.at[0], p[1]! - node.at[1]];
        const [l, t, r, b] = node.frame.box;
        const off =
          node.frame.kind === 'circle'
            ? Math.abs(Math.hypot(x - (l + r) / 2, y - (t + b) / 2) - (r - l) / 2)
            : Math.min(Math.abs(x - l), Math.abs(x - r));
        checked++;
        expect(off, `${e[1]}>${e[2]} at ${id}`).toBeLessThanOrEqual(1);
      }
    }
    // square (2), circle (2), rounded, aws, styled.
    expect(checked).toBe(7);
  });
});
