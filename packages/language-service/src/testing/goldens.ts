/**
 * The golden format (D99 suite 1), shared by every diagram type. A fixture is
 * `goldens/<diagram>/<feature>/<case>.mmd`; its output is the `<case>.out` next to it.
 *
 * - `|` marks a cursor (removed from the text); write a literal `|` as `\|`.
 * - `%% rename-to: <name>` (a comment, so it stays in the text) is the new name for `rename`.
 * - Positions print as 1-based `line:column`; a range prints as `l:c-l:c 'text'`.
 *
 * Features with markers (definition, references, rename, astAt, completions, hover) print one
 * block per marker; the others (diagnostics, folding, semanticTokens) print the whole document.
 *
 * A feature folder with no renderer in {@link FEATURES} runs through the snapshot method of
 * the same name (one call per marker), printed by {@link generic}: a new query needs a folder
 * of fixtures, and a renderer only when the generic output reads badly. Port checklist
 * (R-LANG-3): v13/docs/agents/port-diagram/README.md.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
  completions: perMarker((doc, at, p) => {
    const items = doc.completions(at);
    return items.length
      ? items.map(
          (c) =>
            `${c.label} ${c.kind}${c.detail === undefined ? '' : ` (${c.detail})`} ${p.range(c.range)} -> ${JSON.stringify(c.insertText)}`
        )
      : ['none'];
  }),
  hover: perMarker((doc, at, p) => {
    const h = doc.hover(at);
    return h
      ? [p.range(h.range), ...h.contents.split('\n').map((l) => `| ${l}`.trimEnd())]
      : ['none'];
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

/**
 * Every feature a diagram's facet must have goldens for (R-LANG-3). Completion and hover
 * (#32, #33) join the list when they land.
 */
export const REQUIRED_FEATURES: readonly string[] = Object.freeze([
  'diagnostics',
  'definition',
  'references',
  'rename',
  'astAt',
  'folding',
  'semanticTokens',
]);

const isRange = (v: unknown): v is Range =>
  typeof v === 'object' &&
  v !== null &&
  Object.keys(v).length === 2 &&
  typeof (v as Range).start === 'number' &&
  typeof (v as Range).end === 'number';

/** One value on one line: a range as `l:c-l:c 'text'`, an object as `key value …`. */
function show(value: unknown, p: Printer): string {
  if (value === undefined) return 'none';
  if (isRange(value)) return p.range(value);
  if (Array.isArray(value)) return `[${value.map((v) => show(v, p)).join(', ')}]`;
  if (typeof value === 'object' && value !== null)
    return Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k} ${show(v, p)}`)
      .join(' ');
  return JSON.stringify(value);
}

/** The renderer of a feature with none in {@link FEATURES}: the snapshot method `feature`. */
function generic(feature: string): Render | undefined {
  const method = (doc: DocumentSnapshot) =>
    (doc as unknown as Record<string, unknown>)[feature] as
      | ((offset?: number) => unknown)
      | undefined;
  const lines = (value: unknown, p: Printer): string[] => {
    if (!Array.isArray(value)) return [show(value, p)];
    return value.length ? value.map((v) => show(v, p)) : ['none'];
  };
  return (doc, fixture, p) => {
    const fn = method(doc);
    if (typeof fn !== 'function')
      throw new Error(`"${feature}" is neither a golden renderer nor a snapshot method`);
    if (!fixture.markers.length) return lines(fn.call(doc), p);
    return perMarker((d, at, pr) => lines(fn.call(d, at), pr))(doc, fixture, p);
  };
}

/** The golden output of `feature` for one fixture. */
export function renderGolden(feature: string, doc: DocumentSnapshot, fixture: Fixture): string {
  const render = FEATURES[feature] ?? generic(feature)!;
  return `${render(doc, fixture, new Printer(doc.text)).join('\n')}\n`;
}

export interface GoldenCase {
  diagram: string;
  feature: string;
  /** The case name: the file name without `.mmd`. */
  name: string;
  /** Path of the `.mmd` fixture. */
  input: string;
  /** Path of the `.out` next to it. */
  output: string;
}

const dirs = (path: string): string[] =>
  existsSync(path)
    ? readdirSync(path, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

/** Every `<root>/<diagram>/<feature>/<case>.mmd`, sorted; new folders need no code change. */
export function goldenCases(root: string): GoldenCase[] {
  return dirs(root).flatMap((diagram) =>
    dirs(join(root, diagram)).flatMap((feature) => {
      const dir = join(root, diagram, feature);
      return readdirSync(dir)
        .filter((f) => f.endsWith('.mmd'))
        .sort()
        .map((f) => {
          const name = f.slice(0, -'.mmd'.length);
          return { diagram, feature, name, input: join(dir, f), output: join(dir, `${name}.out`) };
        });
    })
  );
}

/** The {@link REQUIRED_FEATURES} with no case under `<root>/<diagram>/`. */
export function missingFeatures(root: string, diagram: string): string[] {
  const have = new Set(
    goldenCases(root)
      .filter((c) => c.diagram === diagram)
      .map((c) => c.feature)
  );
  return REQUIRED_FEATURES.filter((f) => !have.has(f));
}
