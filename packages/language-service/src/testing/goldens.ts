/**
 * The golden format (D99 suite 1), shared by every diagram type. A fixture is
 * `goldens/<diagram>/<feature>/<case>.mmd`; its output is the `<case>.out` next to it.
 *
 * - `|` marks a cursor (removed from the text); write a literal `|` as `\|`.
 * - `%% rename-to: <name>` (a comment, so it stays in the text) is the new name for `rename`.
 * - Positions print as 1-based `line:column`; a range prints as `l:c-l:c 'text'`.
 *
 * Features with markers (definition, references, rename, astAt) print one block per marker;
 * the others (diagnostics, folding, semanticTokens) print the whole document. A new query
 * adds a renderer to {@link FEATURES} and a folder of fixtures.
 */
import { LineIndex } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import type { DocumentSnapshot } from '../snapshot.ts';

export interface Fixture {
  /** The text with the markers removed. */
  text: string;
  /** Marker offsets, in order. */
  markers: number[];
  renameTo?: string;
}

export function readFixture(source: string): Fixture {
  let text = '';
  const markers: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source.charAt(i);
    if (c === '\\' && source.charAt(i + 1) === '|') {
      text += '|';
      i++;
    } else if (c === '|') markers.push(text.length);
    else text += c;
  }
  const renameTo = /^[ \t]*%% rename-to: (.*)$/m.exec(text)?.[1];
  return renameTo === undefined ? { text, markers } : { text, markers, renameTo };
}

class Printer {
  private readonly lines: LineIndex;
  constructor(readonly text: string) {
    this.lines = new LineIndex(text);
  }

  pos(offset: number): string {
    const p = this.lines.position(offset);
    return `${p.line + 1}:${p.column + 1}`;
  }

  range(r: Range): string {
    return `${this.pos(r.start)}-${this.pos(r.end)} ${JSON.stringify(this.text.slice(r.start, r.end))}`;
  }

  /** The marker's position and the line around it, with the cursor drawn as `|`. */
  marker(offset: number): string {
    const p = this.lines.position(offset);
    const lineStart = offset - p.column;
    const lineEnd = this.text.slice(lineStart).search(/\r|\n|$/) + lineStart;
    const line = `${this.text.slice(lineStart, offset)}|${this.text.slice(offset, lineEnd)}`;
    return `@ ${this.pos(offset)}  ${line.trim()}`;
  }
}

type Render = (doc: DocumentSnapshot, fixture: Fixture, p: Printer) => string[];

const perMarker =
  (render: (doc: DocumentSnapshot, offset: number, p: Printer, fixture: Fixture) => string[]) =>
  (doc: DocumentSnapshot, fixture: Fixture, p: Printer): string[] =>
    fixture.markers.flatMap((m) => [
      p.marker(m),
      ...render(doc, m, p, fixture).map((l) => `  ${l}`),
    ]);

function applyEdits(text: string, edits: readonly { range: Range; newText: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

export const FEATURES: Readonly<Record<string, Render>> = {
  diagnostics: (doc, _, p) =>
    doc.diagnostics().map((d) => `${p.range(d.range)} ${d.severity} ${d.code}: ${d.message}`),
  definition: perMarker((doc, at, p) => {
    const r = doc.definition(at);
    return [r ? `-> ${p.range(r)}` : '-> none'];
  }),
  references: perMarker((doc, at, p) => {
    const refs = doc.references(at);
    return refs.length ? refs.map((r) => p.range(r)) : ['none'];
  }),
  rename: perMarker((doc, at, p, fixture) => {
    const prepared = doc.prepareRename(at);
    if ('refused' in prepared) return [`prepare: refused: ${prepared.refused}`];
    const to = fixture.renameTo ?? 'renamed';
    const head = `prepare: ${p.range(prepared.range)}; rename to ${JSON.stringify(to)}:`;
    const result = doc.rename(at, to);
    if ('refused' in result) return [head, `refused: ${result.refused}`];
    return [head, ...applyEdits(doc.text, result.edits).trimEnd().split('\n')];
  }),
  astAt: perMarker((doc, at, p) => {
    const ids = doc.astAt(at);
    if (!ids.length) return ['none'];
    return ids.map((id) => {
      const r = doc.rangeOf(id);
      return `${id} ${r ? p.range(r) : 'no range'}`;
    });
  }),
  folding: (doc, _, p) =>
    doc.foldingRanges().map((f) => `${p.pos(f.range.start)}-${p.pos(f.range.end)} ${f.kind}`),
  semanticTokens: (doc, _, p) =>
    doc
      .semanticTokens()
      .map(
        (t) =>
          `${p.range(t.range)} ${t.type}${t.modifiers.length ? ` [${t.modifiers.join(', ')}]` : ''}`
      ),
};

/** The golden output of `feature` for one fixture. */
export function renderGolden(feature: string, doc: DocumentSnapshot, fixture: Fixture): string {
  const render = FEATURES[feature];
  if (!render) throw new Error(`no golden renderer for "${feature}"`);
  return `${render(doc, fixture, new Printer(doc.text)).join('\n')}\n`;
}
