// Reads an ER text drawing back into structure (D83, D109): ours or mermaid-ascii's
// `upstream.txt`, in either charset. Crow's-foot marks are found first, counted one per
// relationship end and replaced with plain line glyphs; the flowchart reader (`structure.ts`)
// then finds the boxes, the edge labels and the line components on what is left. Entity
// tables are checked here: the name on the first row, the attribute cells on the rows below
// the rule.
import { ascii, glyphFor, graphemes, unicode, type GlyphSet } from '@mermaid-js/core/ascii';
import type { ErCellLayout } from './er-render.ts';
import { readStructure, type Box, type Charset } from './structure.ts';

/** What an ER drawing should show, from the parsed diagram. */
export interface ErExpected {
  /**
   * Per entity: its name row and its attribute rows' cell texts (empty cells left out; a
   * multi-line cell has its lines joined with `\n`).
   */
  entities: readonly { name: string; rows: readonly (readonly string[])[] }[];
  /** Relationship labels (non-empty ones). */
  edgeLabels: readonly string[];
  /** Subgraph titles and the front-matter title. */
  texts: readonly string[];
}

/**
 * What a run of marks says, read as a set (bar, ring, foot): the four cardinalities and the
 * MD parent, or `one?` / `many?` for a bar or a foot alone (the outer mark left out).
 */
export type EndKind = ErCardinalityName | 'one?' | 'many?' | 'unknown';
type ErCardinalityName = 'onlyOne' | 'zeroOrOne' | 'oneOrMore' | 'zeroOrMore' | 'mdParent';

export interface ErStructure {
  boxes: Box[];
  /** Relationship ends drawn: runs of crow's-foot marks on a line, next to an entity. */
  ends: number;
  /** What each end says, sorted. */
  kinds: EndKind[];
  /** Arrowheads (an ER drawing has none). */
  heads: number;
  /** Entities whose table was found in no box. */
  missingEntities: string[];
  missingEdgeLabels: string[];
  dangling: string[];
}

// Arms, packed as in core/ascii glyphs.ts: up·64 + right·16 + down·4 + left.
const UP = 0xc0;
const RIGHT = 0x30;
const DOWN = 0x0c;
const LEFT = 0x03;
const H = RIGHT | LEFT;
const V = UP | DOWN;

function armsTable(set: GlyphSet): Map<string, number> {
  const arms = new Map<string, number>();
  for (let code = 1; code < 256; code++) {
    const glyph = glyphFor(code, set);
    if (glyph !== undefined && !arms.has(glyph)) arms.set(glyph, code);
  }
  if (set.name === 'ascii') {
    for (const g of '-.') arms.set(g, H);
    for (const g of '|:') arms.set(g, V);
    arms.set('+', UP | RIGHT | DOWN | LEFT);
  } else {
    for (const g of '┄┈╌') arms.set(g, H);
    for (const g of '┆┊╎') arms.set(g, V);
    for (const [g, a] of [
      ['╭', RIGHT | DOWN],
      ['╮', LEFT | DOWN],
      ['╰', UP | RIGHT],
      ['╯', UP | LEFT],
    ] as const)
      arms.set(g, a);
  }
  return arms;
}

const SETS = { unicode, ascii } as const;
const ARMS = { unicode: armsTable(unicode), ascii: armsTable(ascii) } as const;

/** The marks that sit on a horizontal line, and on a vertical one. */
function markGlyphs(set: GlyphSet): { h: Set<string>; v: Set<string> } {
  const c = set.cardinality;
  return {
    h: new Set([c.bar.h, c.ring, c.many.left, c.many.right, c.parent]),
    v: new Set([c.bar.v, c.ring, c.many.up, c.many.down, c.parent]),
  };
}

/**
 * Finds the crow's-foot marks: a run of mark glyphs along a row with a line running into it
 * at both ends (`└||─`, `├o{┤`), or down a column (`┬╪╪│`). Returns the text with each run
 * replaced by the line glyphs it stands for, the number of runs and what each says.
 */
export function stripMarks(
  text: string,
  charset: Charset
): { text: string; ends: number; kinds: EndKind[] } {
  const set = SETS[charset];
  const arms = ARMS[charset];
  const marks = markGlyphs(set);
  const markSet = new Set([...marks.h, ...marks.v]);
  const grid = text.split('\n').map((line) => {
    const row: string[] = [];
    for (const g of graphemes(line)) {
      row.push(g.text);
      if (g.width === 2) row.push('');
    }
    return row;
  });
  const at = (x: number, y: number) => grid[y]?.[x] ?? ' ';
  const armsAt = (x: number, y: number) => arms.get(at(x, y)) ?? 0;
  const lines: [number, number, string][] = [];
  let ends = 0;
  const kinds: EndKind[] = [];
  const c = set.cardinality;
  const kindOf = (run: string[]): EndKind => {
    const bars = run.filter((g) => g === c.bar.h || g === c.bar.v).length;
    const rings = run.filter((g) => g === c.ring).length;
    const feet = run.filter((g) => Object.values(c.many).includes(g)).length;
    const key = `${bars}${rings}${feet}${run.length}`;
    const KINDS: Record<string, EndKind> = {
      '2002': 'onlyOne',
      '1102': 'zeroOrOne',
      '1012': 'oneOrMore',
      '0112': 'zeroOrMore',
      '1001': 'one?',
      '0011': 'many?',
    };
    if (run.length === 1 && run[0] === c.parent) return 'mdParent';
    return KINDS[key] ?? 'unknown';
  };
  // The four directions as (arm, arm facing back, dx, dy).
  const DIRS = [
    [UP, DOWN, 0, -1],
    [RIGHT, LEFT, 1, 0],
    [DOWN, UP, 0, 1],
    [LEFT, RIGHT, -1, 0],
  ] as const;
  // The directions a line runs into (x, y) from: neighbours with an arm towards it.
  const facing = (x: number, y: number): number => {
    let out = 0;
    for (const [arm, back, dx, dy] of DIRS) if (armsAt(x + dx, y + dy) & back) out |= arm;
    return out;
  };
  const taken = new Set<string>();
  // A run of marks along `axis`: it joins a line at both ends (an end may join from the side,
  // where the outer mark sits on the line's corner), and along the axis at one end at least.
  const scan = (cells: [number, number][], axis: 'h' | 'v'): void => {
    const [fwd, bwd] = axis === 'h' ? [RIGHT, LEFT] : [DOWN, UP];
    const along = fwd | bwd;
    // What joins an end of the run from outside: the line along the axis, else from the side.
    const outer = (x: number, y: number, inward: number): number => {
      const f = facing(x, y) & ~inward;
      return f & along ? f & along : f;
    };
    const [fx, fy] = cells[0]!;
    const [lx, ly] = cells.at(-1)!;
    const single = cells.length === 1;
    const first = outer(fx, fy, single ? 0 : fwd);
    const last = outer(lx, ly, single ? 0 : bwd);
    const count = (a: number) => DIRS.filter(([arm]) => a & arm).length;
    const joins = single ? count(first) >= 2 : first !== 0 && last !== 0;
    if (cells.length > 3 || !joins || !((first | last) & along)) return;
    // A letter of a label a vertical line runs through has text beside it on its row (text
    // runs across); a mark does not.
    const inText = ([x, y]: [number, number]) =>
      [at(x - 1, y), at(x + 1, y)].some((g) => WORD.test(g) && !markSet.has(g));
    if (axis === 'v' && cells.some(inText)) return;
    // An ASCII bar is also a line glyph: one a line runs into from both its own ends is a line.
    const own = armsAt(fx, fy);
    if (single && own !== 0 && (facing(fx, fy) & own) === own) return;
    ends++;
    kinds.push(kindOf(cells.map(([x, y]) => at(x, y))));
    cells.forEach(([x, y], i) => {
      taken.add(`${x},${y}`);
      let a = (i === 0 ? first : 0) | (i === cells.length - 1 ? last : 0);
      if (i > 0) a |= bwd;
      if (i < cells.length - 1) a |= fwd;
      // Light arms only: the packed masks above are both bits of each arm.
      lines.push([x, y, glyphFor(a & 0x55, set) ?? (axis === 'h' ? set.solid.h : set.solid.v)]);
    });
  };
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!marks.h.has(at(x, y))) continue;
      const cells: [number, number][] = [];
      while (marks.h.has(at(x, y))) cells.push([x++, y]);
      scan(cells, 'h');
    }
  });
  const width = Math.max(0, ...grid.map((r) => r.length));
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < grid.length; y++) {
      if (!marks.v.has(at(x, y)) || taken.has(`${x},${y}`)) continue;
      const cells: [number, number][] = [];
      while (marks.v.has(at(x, y)) && !taken.has(`${x},${y}`)) cells.push([x, y++]);
      scan(cells, 'v');
    }
  }
  for (const [x, y, glyph] of lines) grid[y]![x] = glyph;
  return { text: grid.map((r) => r.join('')).join('\n'), ends, kinds: kinds.sort() };
}

const squash = (s: string) => s.replace(/\s+/g, '');
const WORD = /[\p{L}\p{N}]/u;

/**
 * A table box: the name alone in the name band, then the attribute rows below the rule, a
 * multi-line cell taking as many lines as its row needs.
 */
function holds(box: Box, entity: ErExpected['entities'][number], charset: Charset): boolean {
  if (box.frame) return false;
  if (entity.rows.length === 0) return squash(box.lines.join('')) === squash(entity.name);
  if (squash(box.lines[0] ?? '') !== squash(entity.name)) return false;
  const divider = charset === 'unicode' ? /│/g : /\|/g;
  const drawn = box.lines.slice(2).map((l) => squash(l.replace(divider, '')));
  const want = entity.rows.flatMap((row) => {
    const split = row.map((cell) => cell.split('\n'));
    const height = Math.max(...split.map((c) => c.length));
    return Array.from({ length: height }, (_, k) => squash(split.map((c) => c[k] ?? '').join('')));
  });
  return drawn.length === want.length && want.every((line, i) => drawn[i] === line);
}

/** Reads `text` (drawn in `charset`) against what the diagram should show. */
export function readErStructure(text: string, charset: Charset, expected: ErExpected): ErStructure {
  const stripped = stripMarks(text, charset);
  const s = readStructure(stripped.text, charset, {
    nodes: [],
    edgeLabels: expected.edgeLabels,
    texts: expected.texts,
  });
  const missingEntities = expected.entities
    .filter((e) => !s.boxes.some((b) => holds(b, e, charset)))
    .map((e) => e.name);
  return {
    boxes: s.boxes,
    ends: stripped.ends,
    kinds: stripped.kinds,
    heads: s.heads,
    missingEntities,
    missingEdgeLabels: s.missingEdgeLabels,
    dangling: s.dangling,
  };
}

type Label = ErCellLayout['er']['entities'][number]['label'];

const textOf = (label: Label): string =>
  label.lines.map((line) => line.map((run) => run.text).join('')).join('\n');

/** What the drawing of `layout` should show: its views' measured text. */
export function erExpectedOf(layout: ErCellLayout): ErExpected {
  const er = layout.er;
  const shown = (s: string) => s.trim() !== '';
  return {
    entities: er.entities.map((e) => ({
      name: textOf(e.label),
      rows: e.rows.map((r) => r.cells.map(textOf).filter(shown)),
    })),
    edgeLabels: er.edges.map((e) => textOf(e.label)).filter(shown),
    texts: [
      ...er.groups.map((g) => textOf(g.label)).filter(shown),
      ...(layout.title ? [layout.title] : []),
    ],
  };
}
