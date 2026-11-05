// cspell:words mathjax newcm texvc boldsymbol newcommand mathrm mathbb mathcal mathfrak infty natnums cnums segs Hodgman MLHVCSQTA Zmlhvcsqtaz widehat
/**
 * TeX → SVG paths with MathJax (spike M1 #244, D175). MathJax's TeX input and SVG output run
 * on its lite adaptor (no DOM) with no font cache, and the tree it builds is flattened here
 * into a detached fragment of plain `<path>` elements in px, top-left origin, y down: every
 * transform is applied to the coordinates, rules and strokes become filled outlines, `data-*`
 * is dropped, and anything else (`<use>`, `<defs>`, `<image>`, `<foreignObject>`, links, other
 * `style`) is refused with a `MathError`. The fragment fits core's inline box (D177, #237);
 * M2 #245 wraps this engine in the plugin.
 */
import { liteAdaptor, type LiteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import type { LiteElement } from '@mathjax/src/js/adaptors/lite/Element.js';
import type { LiteText } from '@mathjax/src/js/adaptors/lite/Text.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { Configuration } from '@mathjax/src/js/input/tex/Configuration.js';
import { CommandMap } from '@mathjax/src/js/input/tex/TokenMap.js';
import BaseMethods from '@mathjax/src/js/input/tex/base/BaseMethods.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import '@mathjax/src/js/input/tex/cancel/CancelConfiguration.js';
import '@mathjax/src/js/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/js/input/tex/enclose/EncloseConfiguration.js';
import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/js/svg.js';
import {
  checkColor,
  pathBuilder,
  type AllowedTag,
  type Attrs,
  type Paint,
  type PathBuilder,
} from '@mermaid-js/core/svg';

/**
 * A detached piece of markup: the shape of core's `SvgFragment` (#237), which this branch
 * does not have yet. M2 uses core's type.
 */
export interface MathFragment {
  readonly tag: AllowedTag;
  readonly attrs?: Attrs;
  readonly children?: readonly (MathFragment | string)[];
}

/** A typeset formula: the shape of core's `InlineBox` (#237). Lengths are px. */
export interface MathBox {
  readonly width: number;
  readonly height: number;
  /** Distance from the top of the box to the math baseline. */
  readonly baseline: number;
  /** Drawn with the box's top-left corner at (0,0), y down. */
  readonly node: MathFragment;
}

export interface TypesetOptions {
  /** One ex of the label font, in px. The math's x-height is matched to it, as MathJax does. */
  readonly ex: number;
  /** One em of the label font, in px: the size of characters the TeX font lacks. `2 × ex` by default. */
  readonly em?: number;
}

/** TeX that MathJax cannot parse, or output this engine will not emit. */
export class MathError extends Error {
  override readonly name = 'MathError';
}

/**
 * Names v12's KaTeX knows and MathJax does not: KaTeX's texvc.sty block (MediaWiki's names),
 * `\notni`, `\relax` (MathJax has it only in `newcommand`, left out below), and `\phase`
 * (KaTeX's phasor angle, MathJax's `phasorangle` enclosure).
 */
const KATEX_MACROS: Readonly<Record<string, string | readonly [string, number]>> = {
  darr: '\\downarrow',
  dArr: '\\Downarrow',
  Darr: '\\Downarrow',
  lang: '\\langle',
  rang: '\\rangle',
  uarr: '\\uparrow',
  uArr: '\\Uparrow',
  Uarr: '\\Uparrow',
  N: '\\mathbb{N}',
  R: '\\mathbb{R}',
  Z: '\\mathbb{Z}',
  alef: '\\aleph',
  alefsym: '\\aleph',
  Alpha: '\\mathrm{A}',
  Beta: '\\mathrm{B}',
  bull: '\\bullet',
  Chi: '\\mathrm{X}',
  clubs: '\\clubsuit',
  cnums: '\\mathbb{C}',
  Complex: '\\mathbb{C}',
  Dagger: '\\ddagger',
  diamonds: '\\diamondsuit',
  empty: '\\emptyset',
  Epsilon: '\\mathrm{E}',
  Eta: '\\mathrm{H}',
  exist: '\\exists',
  harr: '\\leftrightarrow',
  hArr: '\\Leftrightarrow',
  Harr: '\\Leftrightarrow',
  hearts: '\\heartsuit',
  image: '\\Im',
  infin: '\\infty',
  Iota: '\\mathrm{I}',
  isin: '\\in',
  Kappa: '\\mathrm{K}',
  larr: '\\leftarrow',
  lArr: '\\Leftarrow',
  Larr: '\\Leftarrow',
  lrarr: '\\leftrightarrow',
  lrArr: '\\Leftrightarrow',
  Lrarr: '\\Leftrightarrow',
  Mu: '\\mathrm{M}',
  natnums: '\\mathbb{N}',
  Nu: '\\mathrm{N}',
  Omicron: '\\mathrm{O}',
  plusmn: '\\pm',
  rarr: '\\rightarrow',
  rArr: '\\Rightarrow',
  Rarr: '\\Rightarrow',
  real: '\\Re',
  reals: '\\mathbb{R}',
  Reals: '\\mathbb{R}',
  Rho: '\\mathrm{P}',
  sdot: '\\cdot',
  sect: '\\S',
  spades: '\\spadesuit',
  sub: '\\subset',
  sube: '\\subseteq',
  supe: '\\supseteq',
  Tau: '\\mathrm{T}',
  thetasym: '\\vartheta',
  weierp: '\\wp',
  Zeta: '\\mathrm{Z}',
  notni: '\\not\\ni',
  relax: '',
  phase: ['\\enclose{phasorangle}{#1}', 1],
};

/**
 * TeX packages, all loaded with this module so typesetting is synchronous. No `newcommand`:
 * MathJax keeps `\def`/`\newcommand` definitions across formulas, which would make one
 * label's output depend on another's (R-ARCH-6).
 */
const PACKAGES = ['base', 'ams', 'boldsymbol', 'cancel', 'color', 'enclose', 'mermaid-katex'];

interface Engine {
  readonly adaptor: LiteAdaptor;
  readonly input: TeX<LiteElement, LiteText, unknown>;
  readonly convert: (tex: string, options: Record<string, unknown>) => LiteElement;
  /** The TeX font's x-height in em. */
  readonly xHeight: number;
}

let engine: Engine | undefined;

function start(): Engine {
  if (engine) return engine;
  const macros: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(KATEX_MACROS)) {
    macros[name] = typeof def === 'string' ? [BaseMethods.Macro, def] : [BaseMethods.Macro, ...def];
  }
  new CommandMap('mermaid-katex-macros', macros as ConstructorParameters<typeof CommandMap>[1]);
  Configuration.create('mermaid-katex', { handler: { macro: ['mermaid-katex-macros'] } });
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const input = new TeX<LiteElement, LiteText, unknown>({
    packages: PACKAGES,
    // v12 renders with KaTeX's throwOnError: bad TeX is an error, never a red merror box.
    formatError: (_jax: unknown, error: { message: string }) => {
      throw new MathError(error.message);
    },
  });
  const output = new SVG<LiteElement, LiteText, unknown>({
    fontCache: 'none',
    fontData: MathJaxTexFont,
    displayOverflow: 'overflow',
    linebreaks: { inline: false },
  });
  const doc = mathjax.document('', { InputJax: input, OutputJax: output });
  const font = output.font as unknown as { params: { x_height: number } };
  engine = {
    adaptor,
    input,
    convert: (tex, options) => doc.convert(tex, options) as LiteElement,
    xHeight: font.params.x_height,
  };
  return engine;
}

/** Affine map `[a, b, c, d, e, f]`: (x, y) → (a·x + c·y + e, b·x + d·y + f). */
type Matrix = readonly [number, number, number, number, number, number];
type Point = readonly [number, number];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const apply = (m: Matrix, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** The scale of `m` when it scales both axes alike (flips allowed), else `undefined`. */
function uniform(m: Matrix): number | undefined {
  if (m[1] !== 0 || m[2] !== 0 || Math.abs(Math.abs(m[0]) - Math.abs(m[3])) > 1e-9) {
    return undefined;
  }
  return Math.abs(m[0]);
}

const RE_TRANSFORM = /\s*(translate|scale|matrix)\(([^)]*)\)\s*/y;

function parseTransform(value: string): Matrix {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  RE_TRANSFORM.lastIndex = 0;
  while (RE_TRANSFORM.lastIndex < value.length) {
    const match = RE_TRANSFORM.exec(value);
    if (!match) throw new MathError(`Refused transform: ${value}`);
    const args = (match[2] ?? '')
      .split(/[\s,]+/)
      .filter((s) => s !== '')
      .map(Number);
    if (args.length === 0 || args.some((n) => !Number.isFinite(n))) {
      throw new MathError(`Refused transform: ${value}`);
    }
    m = multiply(m, step(match[1] ?? '', args));
  }
  return m;
}

function step(name: string, [p = 0, q, r = 0, s = 0, t = 0, u = 0]: readonly number[]): Matrix {
  if (name === 'translate') return [1, 0, 0, 1, p, q ?? 0];
  if (name === 'scale') return [p, 0, 0, q ?? p, 0, 0];
  return [p, q ?? 0, r, s, t, u];
}

/** Absolute segments of path data, in the source coordinates. */
type Segment =
  | { readonly op: 'M' | 'L'; readonly p: Point }
  | { readonly op: 'C'; readonly p: readonly [number, number, number, number, number, number] }
  | { readonly op: 'Q'; readonly p: readonly [number, number, number, number] }
  | {
      readonly op: 'A';
      readonly p: readonly [number, number, number, boolean, boolean, number, number];
    }
  | { readonly op: 'Z' };

const RE_PATH_TOKEN = /[\s,]*([MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/y;
const ARITY: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

function tokens(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  RE_PATH_TOKEN.lastIndex = 0;
  while (RE_PATH_TOKEN.lastIndex < d.length) {
    const at = RE_PATH_TOKEN.lastIndex;
    const match = RE_PATH_TOKEN.exec(d);
    if (!match) {
      if (/^[\s,]*$/.test(d.slice(at))) break;
      throw new MathError('Refused path data');
    }
    const t = match[1] ?? '';
    out.push(/[A-Za-z]/.test(t) ? t : Number(t));
  }
  return out;
}

/** Reads path data one command at a time, tracking the pen as SVG defines it. */
class PathReader {
  readonly out: Segment[] = [];
  private i = 0;
  private cmd = '';
  private prev = '';
  private x = 0;
  private y = 0;
  private startX = 0;
  private startY = 0;
  private ctrlX = 0;
  private ctrlY = 0;
  // Offsets for a relative command (lowercase), else 0.
  private ox = 0;
  private oy = 0;

  constructor(private readonly list: readonly (string | number)[]) {}

  read(): Segment[] {
    while (this.i < this.list.length) {
      const t = this.list[this.i];
      if (typeof t === 'string') {
        this.cmd = t;
        this.i++;
      } else if (this.cmd === '' || this.cmd === 'Z' || this.cmd === 'z') {
        throw new MathError('Refused path data');
      }
      const op = this.cmd.toUpperCase();
      if (ARITY[op] === undefined) throw new MathError('Refused path data');
      const rel = this.cmd !== op;
      this.ox = rel ? this.x : 0;
      this.oy = rel ? this.y : 0;
      this.command(op);
      this.prev = op;
    }
    return this.out;
  }

  private take(n: number): number[] {
    const args = this.list.slice(this.i, this.i + n);
    if (args.length !== n || args.some((a) => typeof a !== 'number')) {
      throw new MathError('Refused path data');
    }
    this.i += n;
    return args as number[];
  }

  private to(dx: number, dy: number): void {
    this.x = this.ox + dx;
    this.y = this.oy + dy;
  }

  private command(op: string): void {
    if (op === 'M' || op === 'L') return this.line(op);
    if (op === 'H') {
      this.to(this.take(1)[0] ?? 0, this.y - this.oy);
      this.out.push({ op: 'L', p: [this.x, this.y] });
    } else if (op === 'V') {
      this.to(this.x - this.ox, this.take(1)[0] ?? 0);
      this.out.push({ op: 'L', p: [this.x, this.y] });
    } else if (op === 'C' || op === 'S') this.cubic(op);
    else if (op === 'Q' || op === 'T') this.quad(op);
    else if (op === 'A') this.arc();
    else {
      this.x = this.startX;
      this.y = this.startY;
      this.out.push({ op: 'Z' });
    }
  }

  private line(op: 'M' | 'L'): void {
    const [a = 0, b = 0] = this.take(2);
    this.to(a, b);
    this.out.push({ op, p: [this.x, this.y] });
    if (op === 'M') {
      this.startX = this.x;
      this.startY = this.y;
      this.cmd = this.cmd === 'M' ? 'L' : 'l'; // further pairs after a move are lines
    }
  }

  private cubic(op: 'C' | 'S'): void {
    let x1 = this.x;
    let y1 = this.y;
    if (op === 'C') {
      const [a = 0, b = 0] = this.take(2);
      x1 = this.ox + a;
      y1 = this.oy + b;
    } else if (this.prev === 'C' || this.prev === 'S') {
      x1 = 2 * this.x - this.ctrlX;
      y1 = 2 * this.y - this.ctrlY;
    }
    const [c = 0, e = 0, f = 0, g = 0] = this.take(4);
    this.ctrlX = this.ox + c;
    this.ctrlY = this.oy + e;
    this.to(f, g);
    this.out.push({ op: 'C', p: [x1, y1, this.ctrlX, this.ctrlY, this.x, this.y] });
  }

  private quad(op: 'Q' | 'T'): void {
    if (op === 'Q') {
      const [a = 0, b = 0] = this.take(2);
      this.ctrlX = this.ox + a;
      this.ctrlY = this.oy + b;
    } else if (this.prev === 'Q' || this.prev === 'T') {
      this.ctrlX = 2 * this.x - this.ctrlX;
      this.ctrlY = 2 * this.y - this.ctrlY;
    } else {
      this.ctrlX = this.x;
      this.ctrlY = this.y;
    }
    const [f = 0, g = 0] = this.take(2);
    this.to(f, g);
    this.out.push({ op: 'Q', p: [this.ctrlX, this.ctrlY, this.x, this.y] });
  }

  private arc(): void {
    const [rx = 0, ry = 0, rot = 0, large = 0, sweep = 0, f = 0, g = 0] = this.take(7);
    this.to(f, g);
    this.out.push({ op: 'A', p: [rx, ry, rot, large !== 0, sweep !== 0, this.x, this.y] });
  }
}

/** Parses SVG path data into absolute M, L, C, Q, A and Z segments. */
const segments = (d: string): Segment[] => new PathReader(tokens(d)).read();

/** Writes `segs` through `m`. */
function drawSegments(b: PathBuilder, segs: readonly Segment[], m: Matrix): void {
  for (const s of segs) {
    switch (s.op) {
      case 'M':
        b.moveTo(...apply(m, s.p[0], s.p[1]));
        break;
      case 'L':
        b.lineTo(...apply(m, s.p[0], s.p[1]));
        break;
      case 'C': {
        const [x1, y1] = apply(m, s.p[0], s.p[1]);
        const [x2, y2] = apply(m, s.p[2], s.p[3]);
        b.curveTo(x1, y1, x2, y2, ...apply(m, s.p[4], s.p[5]));
        break;
      }
      case 'Q': {
        const [x1, y1] = apply(m, s.p[0], s.p[1]);
        b.quadTo(x1, y1, ...apply(m, s.p[2], s.p[3]));
        break;
      }
      case 'A': {
        const k = uniform(m);
        if (k === undefined) throw new MathError('Refused an arc under an uneven transform');
        const flip = m[0] * m[3] < 0;
        const [x, y] = apply(m, s.p[5], s.p[6]);
        b.arcTo(s.p[0] * k, s.p[1] * k, flip ? -s.p[2] : s.p[2], s.p[3], flip !== s.p[4], x, y);
        break;
      }
      case 'Z':
        b.close();
    }
  }
}

/** A closed polygon, wound clockwise on screen, so overlapping pieces add up under nonzero. */
function polygon(b: PathBuilder, points: readonly Point[]): void {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i] as Point;
    const [x1, y1] = points[(i + 1) % points.length] as Point;
    area += x0 * y1 - x1 * y0;
  }
  const ordered = area < 0 ? [...points].reverse() : points;
  ordered.forEach(([x, y], i) => (i === 0 ? b.moveTo(x, y) : b.lineTo(x, y)));
  b.close();
}

/** A full ellipse as two arcs: clockwise on screen, or anticlockwise for a hole. */
function ellipse(b: PathBuilder, cx: number, cy: number, rx: number, ry: number, hole = false) {
  b.moveTo(cx - rx, cy);
  b.arcTo(rx, ry, 0, false, !hole, cx + rx, cy);
  b.arcTo(rx, ry, 0, false, !hole, cx - rx, cy);
  b.close();
}

type Cap = 'butt' | 'round' | 'square';

/** The filled outline of stroked polylines (px): a quad per segment, plus caps and joins. */
function strokeOutline(
  b: PathBuilder,
  lines: readonly (readonly Point[])[],
  width: number,
  cap: Cap
) {
  const h = width / 2;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [x0, y0] = line[i] as Point;
      const [x1, y1] = line[i + 1] as Point;
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len === 0) continue;
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      const nx = -uy * h;
      const ny = ux * h;
      const before = cap === 'square' && i === 0 ? h : 0;
      const after = cap === 'square' && i + 2 === line.length ? h : 0;
      const ax = x0 - ux * before;
      const ay = y0 - uy * before;
      const bx = x1 + ux * after;
      const by = y1 + uy * after;
      polygon(b, [
        [ax + nx, ay + ny],
        [bx + nx, by + ny],
        [bx - nx, by - ny],
        [ax - nx, ay - ny],
      ]);
    }
    // Round caps and joins; square or butt strokes get square joins only.
    for (let i = 0; i < line.length; i++) {
      const [x, y] = line[i] as Point;
      const end = i === 0 || i === line.length - 1;
      if (cap === 'round') ellipse(b, x, y, h, h);
      else if (!end)
        polygon(b, [
          [x - h, y - h],
          [x + h, y - h],
          [x + h, y + h],
          [x - h, y + h],
        ]);
    }
  }
}

/** A clip rectangle in px: left, top, right, bottom. */
type Clip = readonly [number, number, number, number];

const STEPS = 16;

/** The subpaths of `segs` through `m` as polygons, curves flattened into `STEPS` lines. */
function flatten(segs: readonly Segment[], m: Matrix): Point[][] {
  const polys: Point[][] = [];
  let x = 0;
  let y = 0;
  for (const s of segs) {
    const poly = polys.at(-1);
    switch (s.op) {
      case 'M':
        [x, y] = s.p;
        polys.push([apply(m, x, y)]);
        break;
      case 'L':
        [x, y] = s.p;
        poly?.push(apply(m, x, y));
        break;
      case 'C':
      case 'Q':
        for (let i = 1; i <= STEPS; i++) {
          const t = i / STEPS;
          const u = 1 - t;
          let px: number;
          let py: number;
          if (s.op === 'C') {
            const [x1, y1, x2, y2, x3, y3] = s.p;
            px = u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
            py = u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
          } else {
            const [x1, y1, x2, y2] = s.p;
            px = u * u * x + 2 * u * t * x1 + t * t * x2;
            py = u * u * y + 2 * u * t * y1 + t * t * y2;
          }
          poly?.push(apply(m, px, py));
        }
        x = s.op === 'C' ? s.p[4] : s.p[2];
        y = s.op === 'C' ? s.p[5] : s.p[3];
        break;
      case 'A':
        throw new MathError('Refused a clipped arc');
      case 'Z':
        if (poly?.[0]) [x, y] = [poly[0][0], poly[0][1]];
        break;
    }
  }
  return polys;
}

/** Sutherland–Hodgman: `poly` cut to `clip`, its winding kept. */
function clipPolygon(poly: readonly Point[], clip: Clip): Point[] {
  let out: Point[] = [...poly];
  for (let edge = 0; edge < 4 && out.length > 0; edge++) {
    const axis = edge % 2; // 0: x, 1: y
    const bound = clip[edge] as number;
    const inside = (p: Point) => (edge < 2 ? p[axis]! >= bound : p[axis]! <= bound);
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i] as Point;
      const prev = input[(i + input.length - 1) % input.length] as Point;
      const at = (): Point => {
        const t = (bound - prev[axis]!) / (cur[axis]! - prev[axis]!);
        return axis === 0
          ? [bound, prev[1] + t * (cur[1] - prev[1])]
          : [prev[0] + t * (cur[0] - prev[0]), bound];
      };
      if (inside(cur)) {
        if (!inside(prev)) out.push(at());
        out.push(cur);
      } else if (inside(prev)) out.push(at());
    }
  }
  return out;
}

/** Whether every point `segs` names (end and control points) lies inside `clip`. */
function within(segs: readonly Segment[], m: Matrix, clip: Clip): boolean {
  for (const s of segs) {
    if (s.op === 'Z') continue;
    const p = s.op === 'A' ? [s.p[5], s.p[6]] : s.p;
    for (let i = 0; i + 1 < p.length; i += 2) {
      const [x, y] = apply(m, p[i] as number, p[i + 1] as number);
      if (x < clip[0] || y < clip[1] || x > clip[2] || y > clip[3]) return false;
    }
  }
  return true;
}

/** A colour handed down the tree; `undefined` is the label's own colour (inherited). */
type Ink = Paint | undefined;

function ink(value: string | undefined, parent: Ink): Ink {
  if (value === undefined || value === '' || value === 'currentColor') return parent;
  if (value === 'none') return 'none';
  const color = checkColor(value);
  if (!color) throw new MathError(`Refused colour: ${value}`);
  return color;
}

const RE_STYLE = /^\s*(?:stroke-width:\s*([\d.]+)\s*;?\s*)?$/;

function strokeWidth(attrs: Readonly<Record<string, string>>): number {
  const fromStyle = attrs.style === undefined ? undefined : RE_STYLE.exec(attrs.style)?.[1];
  const width = Number(fromStyle ?? attrs['stroke-width'] ?? 0);
  if (!Number.isFinite(width)) throw new MathError('Refused stroke width');
  return width;
}

function number(attrs: Readonly<Record<string, string>>, name: string): number {
  const value = Number(attrs[name] ?? 0);
  if (!Number.isFinite(value)) throw new MathError(`Refused ${name}`);
  return value;
}

/** Structure only: their children are drawn. */
const GROUPS: ReadonlySet<string> = new Set(['g']);
/** Attributes read here or dropped as metadata; any other attribute is refused. */
const KNOWN_ATTRS: ReadonlySet<string> = new Set([
  'transform',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'style',
  'd',
  'x',
  'y',
  'width',
  'height',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'font-size',
  'font-family',
  'font-style',
  'font-weight',
  'class',
  'role',
  'focusable',
  'viewBox',
  'preserveAspectRatio',
  'xmlns',
]);

type Attributes = Readonly<Record<string, string>>;

/** What a node hands its children: the transform to px, the paints and the clip. */
interface State {
  readonly m: Matrix;
  readonly fill: Ink;
  readonly stroke: Ink;
  readonly clip: Clip | undefined;
}

interface Walk {
  readonly adaptor: LiteAdaptor;
  readonly out: MathFragment[];
}

function walkNode(walk: Walk, node: LiteElement, parent: State): void {
  const { adaptor } = walk;
  const tag = adaptor.kind(node);
  const attrs: Record<string, string> = {};
  for (const { name, value } of adaptor.allAttributes(node)) {
    if (name.startsWith('data-')) continue;
    if (!KNOWN_ATTRS.has(name)) throw new MathError(`Refused attribute ${name} on <${tag}>`);
    attrs[name] = String(value);
  }
  if (attrs.style !== undefined && !RE_STYLE.test(attrs.style)) {
    throw new MathError(`Refused style: ${attrs.style}`);
  }
  let state: State = {
    m: attrs.transform ? multiply(parent.m, parseTransform(attrs.transform)) : parent.m,
    fill: ink(attrs.fill, parent.fill),
    stroke: ink(attrs.stroke, parent.stroke),
    clip: parent.clip,
  };
  if (tag === 'svg') {
    // A nested <svg> is how MathJax clips a stretched extender glyph: a viewport at (x, y),
    // its viewBox the same size (no scaling), clipping what it holds.
    state = viewport(attrs, state);
  } else if (!GROUPS.has(tag)) {
    return drawLeaf(walk, node, tag, attrs, state);
  }
  for (const child of adaptor.childNodes(node)) {
    if (adaptor.kind(child) !== '#text') walkNode(walk, child as LiteElement, state);
  }
}

function viewport(attrs: Attributes, state: State): State {
  const view = RE_VIEWBOX.exec(attrs.viewBox ?? '');
  const x = number(attrs, 'x');
  const y = number(attrs, 'y');
  const w = number(attrs, 'width');
  const h = number(attrs, 'height');
  const [vx = 0, vy = 0, vw = 0, vh = 0] = view ? view.slice(1).map(Number) : [];
  const scaled = Math.abs(vw - w) > 0.05 || Math.abs(vh - h) > 0.05;
  if (!view || attrs.preserveAspectRatio !== undefined || scaled) {
    throw new MathError('Refused element <svg>');
  }
  const { m, clip } = state;
  const [ax, ay] = apply(m, x, y);
  const [bx, by] = apply(m, x + w, y + h);
  const box: Clip = [
    Math.max(Math.min(ax, bx), clip?.[0] ?? -Infinity),
    Math.max(Math.min(ay, by), clip?.[1] ?? -Infinity),
    Math.min(Math.max(ax, bx), clip?.[2] ?? Infinity),
    Math.min(Math.max(ay, by), clip?.[3] ?? Infinity),
  ];
  return { ...state, m: multiply(m, [1, 0, 0, 1, x - vx, y - vy]), clip: box };
}

/** A leaf element, read: its attributes, state, and how it is stroked. */
interface Leaf extends State {
  readonly attrs: Attributes;
  /** Not filled: `fill="none"`, or a `<line>`. */
  readonly hollow: boolean;
  /** Stroke width in px, 0 when not stroked. */
  readonly width: number;
  readonly cap: Cap;
  /** The uniform scale of `m`, when it has one. */
  readonly k: number | undefined;
  emit(paint: Ink, draw: (b: PathBuilder) => void): void;
}

const CAPS: ReadonlySet<string> = new Set(['butt', 'round', 'square']);

function drawLeaf(walk: Walk, node: LiteElement, tag: string, attrs: Attributes, state: State) {
  if (state.clip && tag !== 'path') throw new MathError(`Refused a clipped <${tag}>`);
  const width = strokeWidth(attrs);
  const stroked = state.stroke !== 'none' && width > 0;
  // A <line> is only ever stroked; anything else is filled unless it says fill="none".
  const hollow = attrs.fill === 'none' || tag === 'line';
  if (stroked && !hollow) throw new MathError(`Refused a filled and stroked <${tag}>`);
  const k = uniform(state.m);
  const cap = attrs['stroke-linecap'] ?? 'butt';
  if (stroked && (k === undefined || !CAPS.has(cap))) {
    throw new MathError(`Refused a stroke on <${tag}>`);
  }
  const leaf: Leaf = {
    ...state,
    attrs,
    hollow,
    width: stroked ? width * (k ?? 0) : 0,
    cap: cap as Cap,
    k,
    emit(paint, draw) {
      if (paint === 'none') return;
      const b = pathBuilder();
      draw(b);
      const d = b.done();
      if (d !== '') walk.out.push({ tag: 'path', attrs: paint ? { d, fill: paint } : { d } });
    },
  };
  const draw = LEAVES[tag];
  if (!draw) {
    // <use>, <defs>, <image>, <a>, <foreignObject>, …
    throw new MathError(`Refused element <${tag}>`);
  }
  if (tag === 'text') walk.out.push(textLeaf(leaf, walk.adaptor.textContent(node)));
  else draw(leaf);
}

const LEAVES: Readonly<Record<string, (leaf: Leaf) => void>> = {
  path: pathLeaf,
  rect: rectLeaf,
  line: lineLeaf,
  ellipse: ellipseLeaf,
  circle: ellipseLeaf,
  text: () => undefined, // drawn by drawLeaf, which has its characters
};

function pathLeaf(leaf: Leaf): void {
  const { m, clip } = leaf;
  const segs = segments(leaf.attrs.d ?? '');
  if (!leaf.hollow && clip && !within(segs, m, clip)) {
    return leaf.emit(leaf.fill, (b) => {
      for (const poly of flatten(segs, m)) {
        const cut = clipPolygon(poly, clip);
        if (cut.length < 3) continue;
        cut.forEach(([x, y], i) => (i === 0 ? b.moveTo(x, y) : b.lineTo(x, y)));
        b.close();
      }
    });
  }
  if (!leaf.hollow) return leaf.emit(leaf.fill, (b) => drawSegments(b, segs, m));
  if (leaf.width === 0) return;
  const lines: Point[][] = [];
  for (const g of segs) {
    if (g.op === 'M') lines.push([apply(m, g.p[0], g.p[1])]);
    else if (g.op === 'L') lines.at(-1)?.push(apply(m, g.p[0], g.p[1]));
    else if (g.op === 'Z') {
      const line = lines.at(-1);
      if (line?.[0]) line.push(line[0]);
    } else throw new MathError('Refused a curved stroke');
  }
  leaf.emit(leaf.stroke, (b) => strokeOutline(b, lines, leaf.width, leaf.cap));
}

function rectLeaf(leaf: Leaf): void {
  const { attrs, m } = leaf;
  const x = number(attrs, 'x');
  const y = number(attrs, 'y');
  const w = number(attrs, 'width');
  const h = number(attrs, 'height');
  const corners: Point[] = [
    apply(m, x, y),
    apply(m, x + w, y),
    apply(m, x + w, y + h),
    apply(m, x, y + h),
  ];
  if (!leaf.hollow) return leaf.emit(leaf.fill, (b) => polygon(b, corners));
  if (leaf.width === 0) return;
  const ring = [...corners, corners[0] as Point];
  leaf.emit(leaf.stroke, (b) => strokeOutline(b, [ring], leaf.width, 'square'));
}

function lineLeaf(leaf: Leaf): void {
  if (leaf.width === 0) return;
  const { attrs, m } = leaf;
  const p0 = apply(m, number(attrs, 'x1'), number(attrs, 'y1'));
  const p1 = apply(m, number(attrs, 'x2'), number(attrs, 'y2'));
  leaf.emit(leaf.stroke, (b) => strokeOutline(b, [[p0, p1]], leaf.width, leaf.cap));
}

function ellipseLeaf(leaf: Leaf): void {
  const { attrs, m, k } = leaf;
  if (k === undefined) throw new MathError('Refused an ellipse under an uneven transform');
  const [cx, cy] = apply(m, number(attrs, 'cx'), number(attrs, 'cy'));
  const rx = Number(attrs.rx ?? attrs.r ?? 0) * k;
  const ry = Number(attrs.ry ?? attrs.r ?? 0) * k;
  if (!leaf.hollow) return leaf.emit(leaf.fill, (b) => ellipse(b, cx, cy, rx, ry));
  if (leaf.width === 0) return;
  const h = leaf.width / 2;
  leaf.emit(leaf.stroke, (b) => {
    ellipse(b, cx, cy, rx + h, ry + h);
    ellipse(b, cx, cy, Math.max(rx - h, 0), Math.max(ry - h, 0), true);
  });
}

/** A character the TeX font lacks: MathJax leaves it as text, drawn in the label's font. */
function textLeaf(leaf: Leaf, text: string): MathFragment {
  const { attrs, m, k, fill } = leaf;
  if (k === undefined) throw new MathError('Refused text under an uneven transform');
  const [x, y] = apply(m, number(attrs, 'x'), number(attrs, 'y'));
  const textAttrs: Attrs = {
    x,
    y,
    'font-size': Number.parseFloat(attrs['font-size'] ?? '0') * k,
    ...(attrs['font-style'] === 'italic' && { 'font-style': 'italic' as const }),
    ...(attrs['font-weight'] === 'bold' && { 'font-weight': 'bold' as const }),
    ...(fill !== undefined && fill !== 'none' && { fill }),
  };
  return { tag: 'text', attrs: textAttrs, children: [text] };
}

const RE_VIEWBOX = /^\s*(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)\s*$/;

/**
 * Typesets `tex` in display mode, as v12's KaTeX did, into a box of plain paths. Synchronous:
 * MathJax, its TeX packages and the TeX font all load with this module. Throws `MathError`
 * for TeX that does not parse and for output outside the allow-list.
 */
export function typeset(tex: string, options: TypesetOptions): MathBox {
  const { ex } = options;
  if (!(ex > 0) || !Number.isFinite(ex)) throw new RangeError('ex must be a positive number');
  const em = options.em ?? 2 * ex;
  const { adaptor, input, convert, xHeight } = start();
  input.reset(); // equation numbers and \label
  let container: LiteElement;
  try {
    container = convert(tex, { display: true, em, ex, containerWidth: 1e6 });
  } catch (error) {
    if (error instanceof MathError) throw error;
    throw new MathError(error instanceof Error ? error.message : String(error));
  }
  const children = adaptor.childNodes(container);
  const svg =
    children.length === 1 && adaptor.kind(children[0] as LiteElement) === 'svg'
      ? (children[0] as LiteElement)
      : undefined;
  const view = svg ? RE_VIEWBOX.exec(String(adaptor.getAttribute(svg, 'viewBox'))) : null;
  if (!svg || !view) throw new MathError('MathJax gave no single SVG');
  const [minX = 0, minY = 0, width = 0, height = 0] = view.slice(1).map(Number);
  // MathJax sizes its SVG in ex of the surrounding text, and one ex is the TeX font's x-height.
  const k = ex / (xHeight * 1000);
  const root: Matrix = [k, 0, 0, k, -minX * k, -minY * k];
  const walk: Walk = { adaptor, out: [] };
  const state: State = { m: root, fill: undefined, stroke: undefined, clip: undefined };
  for (const child of adaptor.childNodes(svg)) {
    if (adaptor.kind(child) !== '#text') walkNode(walk, child as LiteElement, state);
  }
  return {
    width: width * k,
    height: height * k,
    baseline: -minY * k,
    node: { tag: 'g', children: walk.out },
  };
}
