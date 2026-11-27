// Reads a text drawing back into structure (D83, R-ASCII-2): boxes and what is written inside
// them, edge lines as connected components and where they touch boxes, and arrowheads. It
// reads both v13's output and mermaid-ascii's `upstream.txt`, in either charset, so the two
// can be compared structurally although their layouts differ.
import { ascii, glyphFor, graphemes, unicode } from '@mermaid-js/core/ascii';

export type Charset = 'unicode' | 'ascii';

/** What a drawing should show, taken from the parsed diagram. */
export interface Expected {
  /** Node labels as drawn: one entry per node, lines joined with `\n`. */
  nodes: readonly string[];
  /** Edge labels (non-empty ones). */
  edgeLabels: readonly string[];
  /** Other text that is not a line: subgraph titles, the front-matter title. */
  texts: readonly string[];
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The text inside, one entry per interior row, trimmed. */
  lines: string[];
  /** True when another box lies inside it (a subgraph frame). */
  frame: boolean;
}

export interface Structure {
  boxes: Box[];
  /** Arrowheads drawn on edge lines. */
  heads: number;
  /** Node labels found in no box. */
  missingNodes: string[];
  /** Edge labels (or words of them) found nowhere outside the node boxes. */
  missingEdgeLabels: string[];
  /** Edge line components that do not touch boxes at two ends or more, by their first cell. */
  dangling: string[];
}

// Arms, packed as in core/ascii glyphs.ts: up·64 + right·16 + down·4 + left (2 bits each).
const UP = 0xc0;
const RIGHT = 0x30;
const DOWN = 0x0c;
const LEFT = 0x03;
const DIRS = [
  { arm: UP, back: DOWN, dx: 0, dy: -1 },
  { arm: RIGHT, back: LEFT, dx: 1, dy: 0 },
  { arm: DOWN, back: UP, dx: 0, dy: 1 },
  { arm: LEFT, back: RIGHT, dx: -1, dy: 0 },
] as const;
const ALL = UP | RIGHT | DOWN | LEFT;
const H = RIGHT | LEFT;
const V = UP | DOWN;

const UNICODE_ARMS = new Map<string, number>();
for (let code = 1; code < 256; code++) {
  const glyph = glyphFor(code, unicode);
  if (glyph !== undefined && !UNICODE_ARMS.has(glyph)) UNICODE_ARMS.set(glyph, code);
}
for (const [glyphs, arms] of [
  ['╭', RIGHT | DOWN],
  ['╮', LEFT | DOWN],
  ['╰', UP | RIGHT],
  ['╯', UP | LEFT],
  ['┄┈╌┅┉╍', H],
  ['┆┊╎┇┋╏', V],
  ['◄►', H],
  ['▲▼', V],
  ['●✕', ALL],
] as const) {
  for (const glyph of glyphs) UNICODE_ARMS.set(glyph, arms);
}
const ASCII_ARMS = new Map<string, number>([
  ['-', H],
  ['.', H],
  ['=', H],
  ['|', V],
  [':', V],
  ['I', V],
  ['+', ALL],
  ['<', H],
  ['>', H],
  ['^', V],
  ['v', V],
  ['o', ALL],
  ['x', ALL],
]);
const HEADS: Record<Charset, string> = {
  unicode: Object.values(unicode.head).join(''),
  ascii: Object.values(ascii.head).join(''),
};
/** Side marks of the text forms (D82): diamond, hexagon. They sit on a box border. */
const MARKS: Record<Charset, string> = { unicode: '◇<>+', ascii: '*<>+' };
/** ASCII glyphs that are also letters: a line only when no letter or digit sits beside them. */
const LETTERS = new Set(['v', 'o', 'x', 'I']);
const WORD = /[\p{L}\p{N}]/u;
/** Spaces either side of an edge label that still belong to it. */
const PAD = 3;

/** A drawing as cells: a wide grapheme takes its cell and a continuation cell (`null`). */
type Grid = (string | null)[][];

function toGrid(text: string): Grid {
  return text.split('\n').map((line) => {
    const row: (string | null)[] = [];
    for (const g of graphemes(line)) {
      if (g.width === 0 && row.length > 0) {
        row[row.length - 1] += g.text;
        continue;
      }
      row.push(g.text);
      if (g.width === 2) row.push(null);
    }
    return row;
  });
}

// Cell kinds after the boxes are found.
const FREE = 0;
const BORDER = 1;
const INTERIOR = 2; // inside a node box (not a frame)
const TEXT = 3; // a title: not a line
const WILD = 4; // an edge label: joins the lines on either side of it

/** Reads `text` (drawn in `charset`) against what the diagram should show. */
export function readStructure(text: string, charset: Charset, expected: Expected): Structure {
  const d = new Drawing(text, charset);
  for (const t of expected.texts) {
    for (const line of t.split('\n')) if (line.trim()) d.maskTitle(line.trim());
  }
  const boxes = d.findBoxes();
  d.markBoxes(boxes);
  // The ASCII charset draws a markdown bullet as `-`.
  const squash = (s: string) =>
    (charset === 'ascii' ? s.replace(/•/g, '-') : s).replace(/\s+/g, '');
  const missingNodes = expected.nodes.filter(
    (label) => !boxes.some((b) => squash(b.lines.join('')) === squash(label))
  );
  for (const t of expected.texts) {
    // A title on a border first: an edge label may be the same text (`A -- Lane --> B`).
    for (const line of t.split('\n')) {
      const want = line.trim();
      if (want && !d.find(want, TEXT, true)) d.find(want, TEXT);
    }
  }
  // A label line as drawn, else its words: v13 may wrap a label where mermaid-ascii does not.
  // Lines first, so that labels sharing words (`a **b**` and `` `a **b**` ``) find their own.
  const lines = expected.edgeLabels.flatMap((label) => label.split('\n').map((l) => l.trim()));
  const notFound = lines.filter((line) => line && !d.find(line, WILD));
  const missingEdgeLabels = notFound
    .flatMap((line) => line.split(/\s+/).filter(Boolean))
    .filter((word) => !d.find(word, WILD));
  const { heads, dangling } = d.traceLines();
  return { boxes, heads, missingNodes, missingEdgeLabels, dangling };
}

class Drawing {
  private readonly grid: Grid;
  private readonly table: ReadonlyMap<string, number>;
  private kind: number[][] = [];
  /** Cells of titles written on a border (`y,x`): text, though ASCII `-`, `.` or `I` are lines. */
  private readonly titled = new Set<string>();
  /**
   * Cells of the titles `find` took as one (`y,x`), frame borders included: an edge label's
   * word is not looked for there (a lane `lane one` and an edge `edge one`).
   */
  private readonly titles = new Set<string>();

  constructor(
    text: string,
    private readonly charset: Charset
  ) {
    this.grid = toGrid(text);
    this.table = charset === 'unicode' ? UNICODE_ARMS : ASCII_ARMS;
  }

  private at(x: number, y: number): string | null | undefined {
    return this.grid[y]?.[x];
  }

  /** Whether (x, y) holds text: a glyph that is no blank and no line. */
  private textAt(x: number, y: number): boolean {
    const c = this.at(x, y);
    return !!c && c.trim() !== '' && !this.armsOf(x, y);
  }

  /** The line arms of the glyph at (x, y); 0 for text, space or nothing. */
  private armsOf(x: number, y: number): number {
    const c = this.at(x, y);
    if (c === null || c === undefined || this.titled.has(`${y},${x}`)) return 0;
    const arms = this.table.get(c) ?? 0;
    if (arms && this.charset === 'ascii' && LETTERS.has(c)) {
      const l = this.at(x - 1, y);
      const r = this.at(x + 1, y);
      // A vertical glyph a line runs into from above or below is a line, whatever sits beside
      // it (two heads side by side read `vv`).
      const joined =
        arms === V &&
        ((this.table.get(this.at(x, y - 1) ?? '') ?? 0) & DOWN ||
          (this.table.get(this.at(x, y + 1) ?? '') ?? 0) & UP);
      if (!joined && ((l && WORD.test(l)) || (r && WORD.test(r)))) return 0;
    }
    return arms;
  }

  /**
   * Marks every run of `title` that sits on a horizontal line: the nearest glyph either side,
   * past blanks, is a line running towards it. Such a run is text even where its characters
   * are line glyphs in the charset (`P1.5`, `a-b-c`, a title `I`).
   */
  maskTitle(title: string): void {
    const want = toGrid(title)[0]!;
    this.grid.forEach((row, y) => {
      for (let x = 0; x + want.length <= row.length; x++) {
        if (!want.every((c, i) => row[x + i] === c)) continue;
        let l = x - 1;
        while (row[l] === ' ') l--;
        let r = x + want.length;
        while (row[r] === ' ') r++;
        if (!(this.armsOf(l, y) & RIGHT) || !(this.armsOf(r, y) & LEFT)) continue;
        for (let i = 0; i < want.length; i++) this.titled.add(`${y},${x + i}`);
      }
    });
  }

  /**
   * A border cell: a line glyph (a side an edge was drawn across keeps its box) or a mark. A
   * title's cell is text, marks included: a title may hold `<` and `>` (#1440).
   */
  private side(x: number, y: number): boolean {
    if (this.titled.has(`${y},${x}`)) return false;
    return this.armsOf(x, y) !== 0 || MARKS[this.charset].includes(this.at(x, y) ?? ' ');
  }

  /**
   * A box corner: arms (any weight) along both sides, and no line running on past it (that
   * is an edge's corner or a crossing: ASCII draws both as `+`).
   */
  private corner(x: number, y: number, arms: number): boolean {
    const own = this.armsOf(x, y);
    return DIRS.every((d) =>
      arms & d.arm ? (own & d.arm) !== 0 : !(this.armsOf(x + d.dx, y + d.dy) & d.back)
    );
  }

  /** Every box: from each top-left corner, the smallest closed rectangle. */
  findBoxes(): Box[] {
    const boxes: Box[] = [];
    this.grid.forEach((row, y) =>
      row.forEach((_, x) => {
        const box = this.corner(x, y, RIGHT | DOWN) ? this.closeBox(x, y) : undefined;
        if (box) boxes.push(box);
      })
    );
    const inside = (a: Box, b: Box) =>
      a !== b &&
      a.x > b.x &&
      a.y > b.y &&
      a.x + a.width < b.x + b.width &&
      a.y + a.height < b.y + b.height;
    for (const b of boxes) b.frame = boxes.some((a) => inside(a, b));
    return boxes;
  }

  /** The top border may hold one title run (v13 writes subgraph titles there). */
  private closeBox(x: number, y: number): Box | undefined {
    let title: 'none' | 'in' | 'after' = 'none';
    let text = '';
    for (let x2 = x + 1; x2 < this.grid[y]!.length; x2++) {
      if (!this.side(x2, y)) {
        if (title === 'after') return undefined;
        title = 'in';
        text += this.at(x2, y) ?? '';
        continue;
      }
      if (title === 'in') {
        // A title run (`┌─ Title ─┐`, or `+one+` when the frame is narrow) is not blank.
        if (text.trim() === '') return undefined;
        title = 'after';
      }
      const box = this.corner(x2, y, LEFT | DOWN) ? this.closeDown(x, x2, y) : undefined;
      if (box) return box;
    }
    return undefined;
  }

  private closeDown(x: number, x2: number, y: number): Box | undefined {
    for (let y2 = y + 1; y2 < this.grid.length; y2++) {
      if (!this.side(x, y2) || !this.side(x2, y2)) return undefined;
      if (!this.corner(x, y2, UP | RIGHT) || !this.corner(x2, y2, UP | LEFT)) continue;
      let bottom = true;
      for (let bx = x + 1; bx < x2 && bottom; bx++) bottom = this.side(bx, y2);
      if (!bottom) continue;
      const lines: string[] = [];
      for (let iy = y + 1; iy < y2; iy++) {
        const cells = (this.grid[iy] ?? []).slice(x + 1, x2).filter((c) => c !== null);
        lines.push(cells.join('').trim());
      }
      return { x, y, width: x2 - x + 1, height: y2 - y + 1, lines, frame: false };
    }
    return undefined;
  }

  markBoxes(boxes: readonly Box[]): void {
    this.kind = this.grid.map((row) => row.map(() => FREE));
    for (const b of boxes) {
      for (let y = b.y; y < b.y + b.height; y++) {
        for (let x = b.x; x < b.x + b.width; x++) {
          const edge =
            y === b.y || y === b.y + b.height - 1 || x === b.x || x === b.x + b.width - 1;
          if (edge) this.kind[y]![x] = BORDER;
          else if (!b.frame && this.kind[y]![x] !== BORDER) this.kind[y]![x] = INTERIOR;
        }
      }
    }
  }

  /**
   * Marks the first free occurrence of `needle` (outside node boxes) as `mark`; with `titled`,
   * only one `maskTitle` found on a horizontal line.
   */
  find(needle: string, mark: typeof TEXT | typeof WILD, titled = false): boolean {
    const want = toGrid(needle)[0]!;
    if (want.length === 0) return true;
    for (let y = 0; y < this.grid.length; y++) {
      for (let x = 0; x + want.length <= this.grid[y]!.length; x++) {
        if (!this.fits(want, x, y, mark, titled)) continue;
        this.claim(x, y, want.length, mark);
        return true;
      }
    }
    return false;
  }

  /** Whether `want` can be taken as `mark` at (x, y): free cells, and whole for a label. */
  private fits(
    want: readonly (string | null)[],
    x: number,
    y: number,
    mark: typeof TEXT | typeof WILD,
    titled: boolean
  ): boolean {
    const row = this.grid[y]!;
    const kind = this.kind[y]!;
    const free = (i: number) =>
      kind[i] !== INTERIOR && kind[i] !== TEXT && kind[i] !== WILD && !this.titles.has(`${y},${i}`);
    if (!want.every((c, i) => row[x + i] === c && free(x + i))) return false;
    if (titled && !this.titled.has(`${y},${x}`)) return false;
    // A label's text is whole: no letter of other text right before or after it.
    return mark !== WILD || !(this.textAt(x - 1, y) || this.textAt(x + want.length, y));
  }

  /** Marks `length` cells from (x, y) as `mark`; a label takes the spaces padding it too. */
  private claim(x: number, y: number, length: number, mark: typeof TEXT | typeof WILD): void {
    const row = this.grid[y]!;
    const kind = this.kind[y]!;
    // A label line is centred in its block: the spaces padding it join the line too.
    let from = x;
    let to = x + length - 1;
    for (let i = 0; mark === WILD && i < PAD && row[from - 1] === ' '; i++) from--;
    for (let i = 0; mark === WILD && i < PAD && row[to + 1] === ' '; i++) to++;
    for (let i = from; i <= to; i++) if (kind[i] !== BORDER) kind[i] = mark;
    if (mark === TEXT) for (let i = x; i < x + length; i++) this.titles.add(`${y},${i}`);
  }

  /**
   * The arms a free cell joins other line cells with. A label joins every way; a space
   * between two dashes is a line (mermaid-ascii's dotted `- - >`).
   */
  private lineArms(x: number, y: number): number {
    const k = this.kind[y]?.[x];
    if (k === WILD) return ALL;
    if (k !== FREE) return 0;
    const arms = this.armsOf(x, y);
    if (arms) return arms;
    const gap = this.armsOf(x - 1, y) & RIGHT && this.armsOf(x + 1, y) & LEFT;
    return this.at(x, y) === ' ' && gap ? H : 0;
  }

  /** Edge lines as components joined where facing arms meet: heads, and free ends. */
  traceLines(): { heads: number; dangling: string[] } {
    let heads = 0;
    const seen = this.grid.map((row) => row.map(() => false));
    const dangling: string[] = [];
    this.grid.forEach((row, y) =>
      row.forEach((_, x) => {
        if (seen[y]![x] || !this.lineArms(x, y)) return;
        const c = this.component(x, y, seen);
        heads += c.heads;
        if (!c.wildOnly && c.touches < 2) dangling.push(`${x},${y}`);
      })
    );
    return { heads, dangling };
  }

  /** Flood fills one component from (x, y), counting its heads and the box cells it reaches. */
  private component(x: number, y: number, seen: boolean[][]) {
    const stack: [number, number][] = [[x, y]];
    seen[y]![x] = true;
    const touches = new Set<string>();
    let wildOnly = true;
    let heads = 0;
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      const arms = this.lineArms(cx, cy);
      const wild = this.kind[cy]![cx] === WILD;
      if (!wild) wildOnly = false;
      if (!wild && HEADS[this.charset].includes(this.at(cx, cy) ?? ' ')) heads++;
      for (const d of DIRS) {
        if (!(arms & d.arm)) continue;
        const nx = cx + d.dx;
        const ny = cy + d.dy;
        if (this.kind[ny]?.[nx] === BORDER) {
          // A label touches a box only where the border has a stem out to it.
          if (!wild || this.armsOf(nx, ny) & d.back) touches.add(`${cx},${cy},${d.arm}`);
          continue;
        }
        const back = this.lineArms(nx, ny);
        if (!back || seen[ny]![nx]) continue;
        if (!(back & d.back) && this.kind[ny]![nx] !== WILD && !wild) continue;
        seen[ny]![nx] = true;
        stack.push([nx, ny]);
      }
    }
    return { heads, touches: touches.size, wildOnly };
  }
}
