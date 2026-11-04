// Reads a sequence diagram's text drawing back into structure (D83, #150): which participant
// labels sit inside a box, which texts are present, and how many arrowheads the message lines
// carry. It reads both v13's output and mermaid-ascii's `upstream.txt`, in either charset, so
// the two can be compared although their layouts differ (box widths, label places, fragment
// titles on the border or under it).
import { graphemes } from '@mermaid-js/core/ascii';
import type { SequenceLayout } from '@mermaid-js/diagram-sequence';
import type { Charset } from './structure.ts';

/** What a drawing should show, from the parsed diagram's cell layout. */
export interface SequenceExpected {
  /** Participant label lines. */
  participants: readonly string[];
  /** Message, note, fragment and box label lines, and the diagram title. */
  texts: readonly string[];
}

export interface SequenceStructure {
  /** Arrowheads on message lines. */
  heads: number;
  /** Participant label lines found in no box. */
  missingParticipants: string[];
  /** Texts (or a word of them) found nowhere. */
  missingTexts: string[];
}

const SIDES: Record<Charset, string> = { unicode: '│║┃', ascii: '|I#' };
// Heads both drawings use: v13's glyph sets and mermaid-ascii's (`×` cross, `(`/`)` async).
const HEADS: Record<Charset, string> = { unicode: '►◄✕×()⇀⇁↼↽', ascii: '<>x()' };
// What a head touches on a message line: the line, a lifeline tee or a self loop's corner.
const LINE: Record<Charset, string> = {
  unicode: '─┄┈━═├┤┼┠┨╂┐┘┌└┬┴',
  ascii: '-.=+',
};

/**
 * The rows of a drawing as cells: one grapheme per cell, '' in the right half of a wide one.
 * Zero-width clusters (combining marks, controls, zero-width spaces) are left out on both sides of a
 * comparison: where a drawing puts a leading mark is not structure.
 */
function cellsOf(text: string): string[][] {
  return text.split('\n').map((line) => {
    const row: string[] = [];
    for (const g of graphemes(line)) {
      if (g.width === 0) continue;
      row.push(g.text.replace(/[\p{M}\p{Cc}\p{Cf}]/gu, ''));
      if (g.width === 2) row.push('');
    }
    return row;
  });
}

/** Where `needle` (as cells) starts in `row`, from `from`; -1 when it is not there. */
function find(row: readonly string[], needle: readonly string[], from = 0): number {
  for (let x = from; x + needle.length <= row.length; x++) {
    let ok = true;
    for (let k = 0; k < needle.length && ok; k++) ok = row[x + k] === needle[k];
    if (ok) return x;
  }
  return -1;
}

const needleOf = (text: string): string[] => cellsOf(text)[0] ?? [];

/** Reads `text` (a drawing in `charset`) for what `expected` says it shows. */
export function readSequence(
  text: string,
  charset: Charset,
  expected: SequenceExpected
): SequenceStructure {
  const rows = cellsOf(text);
  const sides = SIDES[charset];
  const inBox = (label: string): boolean => {
    const needle = needleOf(label);
    for (const row of rows) {
      for (let x = find(row, needle); x >= 0; x = find(row, needle, x + 1)) {
        let l = x - 1;
        while (l >= 0 && row[l] === ' ') l--;
        let r = x + needle.length;
        while (r < row.length && row[r] === ' ') r++;
        if (l >= 0 && sides.includes(row[l]!) && r < row.length && sides.includes(row[r]!))
          return true;
      }
    }
    return false;
  };
  const present = (label: string): boolean =>
    label
      .split(/\s+/)
      .filter((w) => w !== '')
      .every((w) => rows.some((row) => find(row, needleOf(w)) >= 0));

  const missingParticipants = expected.participants.filter((p) => p.trim() !== '' && !inBox(p));
  const missingTexts = expected.texts.filter((t) => t.trim() !== '' && !present(t));
  // Labels are not lines: `->> message` or `:-)` in a label is no arrowhead.
  for (const t of [...expected.participants, ...expected.texts]) {
    const needle = needleOf(t);
    if (needle.length === 0) continue;
    for (const row of rows)
      for (let x = find(row, needle); x >= 0; x = find(row, needle, x + needle.length))
        row.fill(' ', x, x + needle.length);
  }
  let heads = 0;
  const line = LINE[charset];
  for (const row of rows) {
    row.forEach((c, x) => {
      if (c === '' || !HEADS[charset].includes(c)) return;
      if (line.includes(row[x - 1] ?? ' ') || line.includes(row[x + 1] ?? ' ')) heads++;
    });
  }
  return { heads, missingParticipants, missingTexts };
}

type Label = SequenceLayout['participants'][number]['label'];
const linesOf = (label: Label): string[] =>
  label.lines.map((runs) => runs.map((r) => r.text).join(''));
// A fragment title is drawn in brackets by v13 and with its keyword by mermaid-ascii.
const withoutBrackets = (s: string): string => s.replace(/^\[/, '').replace(/\]$/, '');

/** What a sequence drawing should show, from its cell layout. */
export function sequenceExpectedOf(layout: SequenceLayout): SequenceExpected {
  return {
    participants: layout.participants.flatMap((p) => linesOf(p.label)),
    texts: [
      ...layout.messages.flatMap((m) => (m.label ? linesOf(m.label.text) : [])),
      ...layout.notes.flatMap((n) => linesOf(n.label.text)),
      ...layout.fragments.flatMap((f) => [
        ...(f.title ? linesOf(f.title.text).map(withoutBrackets) : []),
        ...f.sections.flatMap((s) => (s.label ? linesOf(s.label.text).map(withoutBrackets) : [])),
      ]),
      ...layout.boxes.flatMap((b) => (b.label ? linesOf(b.label.text) : [])),
      ...(layout.title ? linesOf(layout.title.text) : []),
    ],
  };
}
