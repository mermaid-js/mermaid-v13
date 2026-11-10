// Reads a requirement text drawing back into structure (#588, D438), as `er-structure.ts` does
// for ER: the `contains` marks (`⊕`, `(+)` in ascii) are found first, counted and replaced
// with the line glyphs they sit on; the flowchart reader (`structure.ts`) then finds the
// boxes, the relation labels, the arrowheads and the line components on what is left. Boxes
// are checked here: the kind and the name above one divider, the body lines below it.
import { cellWidth } from '@mermaid-js/core/ascii';
import type { RequirementCellLayout } from './requirement-render.ts';
import { readStructure, type Box, type Charset } from './structure.ts';

/** What one box should show: its head lines, and its body lines as `Key: value`. */
export interface RequirementBoxExpected {
  head: readonly string[];
  body: readonly string[];
}

export interface RequirementExpected {
  boxes: readonly RequirementBoxExpected[];
  /** Relation labels (`<<kind>>`). */
  edgeLabels: readonly string[];
  /** The front-matter title. */
  texts: readonly string[];
}

export interface RequirementStructure {
  boxes: Box[];
  /** `contains` marks found on lines. */
  contains: number;
  /** Arrowheads. */
  heads: number;
  /** Boxes (by their name line) found in no drawn box. */
  missingBoxes: string[];
  missingEdgeLabels: string[];
  dangling: string[];
}

/** The most cells a value shows (D438). */
export const VALUE_CELLS = 40;

const squash = (s: string): string => s.replace(/\s+/g, '');
const LINE_H = { unicode: '─│', ascii: '-|' } as const;

/**
 * Replaces each `contains` mark with the line glyph it stands on: `⊕` with the line running
 * through its neighbours, `(+)` along a row with three line cells or, across a vertical line,
 * with the line cell between two blanks.
 */
export function stripContains(text: string, charset: Charset): { text: string; contains: number } {
  const [h, v] = [...LINE_H[charset]] as [string, string];
  const rows = text.split('\n').map((l) => [...l]);
  const at = (x: number, y: number): string => rows[y]?.[x] ?? ' ';
  const vertical = (x: number, y: number): boolean =>
    /[│┆|:┬┴+▲▼^v]/u.test(at(x, y - 1)) || /[│┆|:┬┴+▲▼^v]/u.test(at(x, y + 1));
  let contains = 0;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (charset === 'unicode' && row[x] === '⊕') {
        contains++;
        row[x] = vertical(x, y) ? v : h;
      } else if (
        charset === 'ascii' &&
        row[x] === '(' &&
        row[x + 1] === '+' &&
        row[x + 2] === ')'
      ) {
        contains++;
        if (vertical(x + 1, y)) [row[x], row[x + 1], row[x + 2]] = [' ', v, ' '];
        else [row[x], row[x + 1], row[x + 2]] = [h, h, h];
        x += 2;
      }
    }
  });
  return { text: rows.map((r) => r.join('')).join('\n'), contains };
}

/**
 * Whether `drawn` shows `full` as D438 says: whole, or cut to its key and 40 cells of value,
 * the last an ellipsis (`…`, `~` in ascii).
 */
export function showsBodyLine(drawn: string, full: string, charset: Charset): boolean {
  if (drawn === full) return true;
  const mark = charset === 'unicode' ? '…' : '~';
  const key = full.indexOf(': ') + 2;
  return (
    drawn.endsWith(mark) &&
    full.startsWith(drawn.slice(0, -mark.length)) &&
    cellWidth(drawn.slice(key)) === VALUE_CELLS
  );
}

function holds(box: Box, want: RequirementBoxExpected, charset: Charset): boolean {
  if (box.frame) return false;
  const rule = charset === 'unicode' ? /^─+$/u : /^-+$/;
  const rows = box.lines.filter((l) => l !== '');
  const divider = rows.findIndex((l) => rule.test(l));
  const head = divider < 0 ? rows : rows.slice(0, divider);
  const body = divider < 0 ? [] : rows.slice(divider + 1);
  if (want.body.length === 0 && divider >= 0) return false;
  if (want.body.length > 0 && divider < 0) return false;
  return (
    head.length === want.head.length &&
    head.every((l, i) => squash(l) === squash(want.head[i]!)) &&
    body.length === want.body.length &&
    body.every((l, i) => showsBodyLine(l, want.body[i]!, charset))
  );
}

/** Reads `text` (drawn in `charset`) against what the diagram should show. */
export function readRequirementStructure(
  text: string,
  charset: Charset,
  expected: RequirementExpected
): RequirementStructure {
  const stripped = stripContains(text, charset);
  const s = readStructure(stripped.text, charset, {
    nodes: [],
    edgeLabels: expected.edgeLabels,
    texts: expected.texts,
  });
  const missingBoxes = expected.boxes
    .filter((want) => !s.boxes.some((b) => holds(b, want, charset)))
    .map((want) => want.head.join(' / '));
  return {
    boxes: s.boxes,
    contains: stripped.contains,
    heads: s.heads,
    missingBoxes,
    missingEdgeLabels: s.missingEdgeLabels,
    dangling: s.dangling,
  };
}

type Label = RequirementCellLayout['requirement']['boxes'][number]['lines'][number]['label'];

const linesOf = (label: Label): string[] =>
  label.lines.map((line) => line.map((run) => run.text).join(''));

/** What the drawing of `layout` should show: its views' measured text. */
export function requirementExpectedOf(layout: RequirementCellLayout): RequirementExpected {
  const r = layout.requirement;
  return {
    boxes: r.boxes.map((b) => ({
      head: b.lines.filter((l) => l.align === 'center').flatMap((l) => linesOf(l.label)),
      body: b.lines.filter((l) => l.align === 'start').flatMap((l) => linesOf(l.label)),
    })),
    edgeLabels: r.relations.flatMap((e) => linesOf(e.label)).filter((s) => s.trim() !== ''),
    texts: r.title ? [linesOf(r.title).join(' ')] : [],
  };
}
