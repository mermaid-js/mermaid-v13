import { describe, expect, it } from 'vitest';
import { createMermaid, type InitializeConfig } from 'mermaid';
import { parseSvg, type SvgElement, type SvgView } from './svg-tree.ts';

/**
 * Node padding from theme variables (#83, D151, D152), through the public `render()`. A fixed
 * measurer makes every label box known: 10px per character, one 20px line. The expected
 * sizes are v12's shape formulas at fa796a943 (`rendering-elements/shapes/*.ts`): neo values
 * in the redux family, classic values (from `flowchart.padding`) in the classic family.
 * Circles keep v13's redux values and hexagon axes are corrected (D151).
 */
const CHAR = 10;
const LINE = 20;
const LABEL = 'abcdefghij';
const TW = LABEL.length * CHAR; // 100
const TH = LINE; // 20
const PAD = 15; // flowchart.padding default
const DIAG = Math.hypot(TW, TH);

async function draw(text: string, config: InitializeConfig = {}): Promise<SvgView> {
  const m = createMermaid();
  m.initialize({
    measurer: {
      id: 'fixed-10',
      width: (t) => t.length * CHAR,
      metrics: () => ({ ascent: 15, descent: 5, lineHeight: LINE }),
    },
    ...config,
    flowchart: { minNodeWidth: 0, wrappingWidth: 1000, ...config.flowchart },
  } as InitializeConfig);
  return parseSvg((await m.render('m', text)).svg);
}

/** The first rect, polygon or circle under an element, depth first. */
function firstShape(tree: SvgView, node: SvgElement): SvgElement | undefined {
  for (const c of tree.children(node)) {
    if (['rect', 'polygon', 'circle'].includes(tree.tag(c) ?? '')) return c;
    const hit = firstShape(tree, c);
    if (hit) return hit;
  }
  return undefined;
}

/** The width and height of a cylinder body path `M x0,top A rx,ry … L x,bottom A …`. */
function cylinderBox(d: string): { w: number; h: number } {
  const n = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const [x0, top, rx, ry] = n as [number, number, number, number];
  const bottom = n[10]!;
  return { w: 2 * Math.abs(x0) || 2 * rx, h: bottom - top + 2 * ry };
}

/** The width and height of node A's outline. */
function outline(tree: SvgView): { w: number; h: number } {
  const node = tree.find((n, t) => t.getAttr(n, 'data-ast') === 'n:A')[0]!;
  const shape = firstShape(tree, node);
  if (!shape) {
    const body = tree.children(node).find((c) => tree.tag(c) === 'path')!;
    return cylinderBox(tree.getAttr(body, 'd')!);
  }
  const attr = (name: string) => Number(tree.getAttr(shape, name));
  switch (tree.tag(shape)) {
    case 'rect':
      return { w: attr('width'), h: attr('height') };
    case 'circle':
      return { w: 2 * attr('r'), h: 2 * attr('r') };
    case undefined:
      throw new Error('node A has no outline element');
    default: {
      const nums = tree
        .getAttr(shape, 'points')!
        .split(/[\s,]+/)
        .map(Number);
      const xs = nums.filter((_, i) => i % 2 === 0);
      const ys = nums.filter((_, i) => i % 2 === 1);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
  }
}

const sizeOf = async (shape: string, config: InitializeConfig = {}) =>
  outline(await draw(`flowchart TD\n  A${shape}`, config));

const close = (got: { w: number; h: number }, want: { w: number; h: number }) => {
  expect(got.w).toBeCloseTo(want.w, 1);
  expect(got.h).toBeCloseTo(want.h, 1);
};

const REDUX = { theme: 'redux-color' } as InitializeConfig;
const CLASSIC = { theme: 'default' } as InitializeConfig;

describe('flowchart node padding (#83)', () => {
  it('pads a rectangle 16 / 12 per side in redux-color, 2 × padding / padding in default', async () => {
    expect(await sizeOf(`[${LABEL}]`, REDUX)).toEqual({ w: TW + 32, h: TH + 24 });
    expect(await sizeOf(`[${LABEL}]`, CLASSIC)).toEqual({ w: TW + 4 * PAD, h: TH + 2 * PAD });
  });

  it.each([REDUX, CLASSIC])(
    'draws a diamond as a square, side = label width + height + 2 × padding (%o)',
    async (config) => {
      const s = TW + TH + 2 * PAD;
      close(await sizeOf(`{${LABEL}}`, config), { w: s, h: s });
    }
  );

  it('sizes a hexagon from its padding and slant: 70 / 32 and 3.5 in redux, padding and 4 in classic', async () => {
    const hex = (px: number, py: number, f: number) => {
      const h = TH + py;
      return { w: TW + (2 * h) / f + px, h };
    };
    close(await sizeOf(`{{${LABEL}}}`, REDUX), hex(70, 32, 3.5));
    close(await sizeOf(`{{${LABEL}}}`, CLASSIC), hex(PAD, PAD, 4));
  });

  it('applies hexagon X padding to the width and Y padding to the height (D151)', async () => {
    const base = await sizeOf(`{{${LABEL}}}`, REDUX);
    const wider = await sizeOf(`{{${LABEL}}}`, {
      ...REDUX,
      themeVariables: { hexagonPaddingX: 100 },
    });
    expect(wider.h).toBe(base.h);
    expect(wider.w - base.w).toBeCloseTo(30, 5);
    const taller = await sizeOf(`{{${LABEL}}}`, {
      ...REDUX,
      themeVariables: { hexagonPaddingY: 42 },
    });
    expect(taller.h - base.h).toBeCloseTo(10, 5);
  });

  it('sizes a stadium from its total padding: 40 / 24 in redux, padding in classic', async () => {
    const stadium = (px: number, py: number) => {
      const h = TH + py;
      const cap = Math.sqrt(h * h - TH * TH);
      return { w: Math.max(TW + h / 4 + px, 1.5 * h, TW + px + h - cap), h };
    };
    close(await sizeOf(`([${LABEL}])`, REDUX), stadium(40, 24));
    close(await sizeOf(`([${LABEL}])`, CLASSIC), stadium(PAD, PAD));
  });

  it('sizes a double circle from ring gap and label padding: 12 / 16 in redux, 5 / padding in classic', async () => {
    const d = (gap: number, pad: number) => DIAG + 2 * (pad + gap);
    close(await sizeOf(`(((${LABEL})))`, REDUX), { w: d(12, 16), h: d(12, 16) });
    close(await sizeOf(`(((${LABEL})))`, CLASSIC), { w: d(5, PAD), h: d(5, PAD) });
  });

  it('keeps the v13 circle in redux-color (diagonal + 16, at least 44); classic adds padding', async () => {
    close(await sizeOf(`((${LABEL}))`, REDUX), { w: DIAG + 16, h: DIAG + 16 });
    close(await sizeOf('((a))', REDUX), { w: 44, h: 44 });
    close(await sizeOf(`((${LABEL}))`, CLASSIC), { w: DIAG + PAD, h: DIAG + PAD });
  });

  // #89 side-by-side: these shapes have their own v12 padding, not the rectangle's.
  it('pads a rounded rectangle by padding per side in every theme (v12 roundedRect)', async () => {
    for (const config of [REDUX, CLASSIC])
      expect(await sizeOf(`(${LABEL})`, config)).toEqual({ w: TW + 2 * PAD, h: TH + 2 * PAD });
  });

  it('pads a subroutine 28 / 12 in redux, padding in classic (totals), inside its 8px frames', async () => {
    expect(await sizeOf(`[[${LABEL}]]`, REDUX)).toEqual({ w: TW + 28 + 16, h: TH + 12 });
    expect(await sizeOf(`[[${LABEL}]]`, CLASSIC)).toEqual({ w: TW + PAD + 16, h: TH + PAD });
  });

  it('pads a cylinder 24 in redux, padding in classic (totals), plus three cap heights', async () => {
    const cyl = (pad: number) => {
      const w = TW + pad;
      const ry = Math.min(12, Math.max(6, w / 14));
      return { w, h: TH + pad + 3 * ry };
    };
    close(await sizeOf(`[(${LABEL})]`, REDUX), cyl(24));
    close(await sizeOf(`[(${LABEL})]`, CLASSIC), cyl(PAD));
  });

  it('pads a parallelogram and trapezoid 2 × padding / padding in redux, padding in classic (totals)', async () => {
    const lean = (px: number, py: number) => {
      const h = TH + py;
      return { w: TW + px + h / 2, h };
    };
    for (const shape of [`[/${LABEL}/]`, `[\\${LABEL}\\]`, `[/${LABEL}\\]`]) {
      close(await sizeOf(shape, REDUX), lean(2 * PAD, PAD));
      close(await sizeOf(shape, CLASSIC), lean(PAD, PAD));
    }
  });

  it('pads the inverted trapezoid on each side, as v12 inv_trapezoid', async () => {
    const h = TH + 2 * PAD;
    close(await sizeOf(`[\\${LABEL}/]`, REDUX), { w: TW + 4 * PAD + h / 2, h });
    close(await sizeOf(`[\\${LABEL}/]`, CLASSIC), { w: TW + 2 * PAD + h / 2, h });
  });

  it('pads the asymmetric shape 42 / 24 in redux, padding in classic (totals)', async () => {
    const odd = (px: number, py: number) => {
      const h = TH + py;
      return { w: TW + px + h / 4, h };
    };
    close(await sizeOf(`>${LABEL}]`, REDUX), odd(42, 24));
    close(await sizeOf(`>${LABEL}]`, CLASSIC), odd(PAD, PAD));
  });

  it('takes the per-shape padding from themeVariables', async () => {
    const got = await sizeOf(`[[${LABEL}]]`, {
      ...REDUX,
      themeVariables: { subroutinePaddingX: 0, subroutinePaddingY: '2 * padding' },
    });
    expect(got).toEqual({ w: TW + 16, h: TH + 2 * PAD });
  });

  it('follows flowchart.padding in classic themes, not in redux themes', async () => {
    const flowchart = { padding: 20 };
    expect(await sizeOf(`[${LABEL}]`, { ...CLASSIC, flowchart })).toEqual({
      w: TW + 80,
      h: TH + 40,
    });
    expect(await sizeOf(`[${LABEL}]`, { ...REDUX, flowchart })).toEqual({
      w: TW + 32,
      h: TH + 24,
    });
  });

  it('takes nodePaddingX and nodePaddingY from themeVariables, as px or a multiple of padding', async () => {
    const px = await sizeOf(`[${LABEL}]`, { ...REDUX, themeVariables: { nodePaddingX: 30 } });
    expect(px).toEqual({ w: TW + 60, h: TH + 24 });
    const rel = await sizeOf(`[${LABEL}]`, {
      ...REDUX,
      themeVariables: { nodePaddingX: '2 * padding', nodePaddingY: 'padding' },
    });
    expect(rel).toEqual({ w: TW + 4 * PAD, h: TH + 2 * PAD });
  });
});
