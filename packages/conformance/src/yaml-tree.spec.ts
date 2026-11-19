/**
 * The YAML reader's tree mode (R-LANG-5) over the front matter of the e2e corpus: it reads the
 * same value and diagnostics as the default mode, its ranges nest, and each covers the text of
 * its key or value. The default mode's own output (value and diagnostics) over the corpus front
 * matter and flowchart shape data is pinned by digest, so tree-mode work (#169) cannot change
 * what the renderer reads.
 *
 * The digest is pinned per fixture (#1020). A pinned fixture whose read changes fails, and so
 * does a pinned fixture that is no longer in the corpus. A fixture that is not pinned yet passes
 * and is listed in the output. Regenerate every digest file with
 * `pnpm vitest run packages/conformance/src/yaml-tree.spec.ts -u`; a run without `-u` never
 * writes them.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseYaml, preprocess } from '@mermaid-js/core/preprocess';
import type { YamlNode } from '@mermaid-js/core/preprocess';
import { corpusFromDir, REPO_ROOT } from './corpus.ts';
import type { CorpusItem } from './types.ts';

const CORPUS_DIR = 'e2e/diagrams';
/**
 * The pinned reads: `<folder>.txt` per e2e diagram folder with front matter or shape data, one
 * `<id> <count> <hash16>` line per fixture with reads, sorted by id (#1020).
 */
const DIGESTS = join(import.meta.dirname, '__snapshots__', 'yaml-tree');
/** How to rewrite the digest files: vitest's update mode (`-u`). No other run writes them. */
const REGENERATE = 'pnpm vitest run packages/conformance/src/yaml-tree.spec.ts -u';

/** What the source text under a node must look like, for its kind and style. */
function badText(text: string, node: YamlNode): string | undefined {
  if (node.kind === 'map' || node.kind === 'seq') {
    const [open, close] = node.kind === 'map' ? ['{', '}'] : ['[', ']'];
    if (node.flow) return text.startsWith(open) && text.endsWith(close) ? undefined : 'flow';
    if (node.kind === 'seq') return text.startsWith('-') ? undefined : 'block sequence';
    return text === '' || node.pairs.length === 0 || text.startsWith(src(node.pairs[0]!.keyRange))
      ? undefined
      : 'block mapping';
  }
  const quote = { single: "'", double: '"', literal: '|', folded: '>', plain: '' }[node.style];
  if (quote === '') {
    // A one-line plain value reads back as itself; an empty range is an empty value.
    if (text === '') return node.value === null ? undefined : 'empty';
    if (text.includes('\n') || text.trim() !== text) return undefined;
    const back = parseYaml(text).value;
    return Object.is(back, node.value) || back === node.value ? undefined : `plain ${text}`;
  }
  if (!text.startsWith(quote)) return `${node.style} start`;
  if ((quote === "'" || quote === '"') && !text.endsWith(quote)) return `${node.style} end`;
  if ((quote === "'" || quote === '"') && !text.includes('\n')) {
    return parseYaml(text).value === node.value ? undefined : `quoted ${text}`;
  }
  return undefined;
}

let source = '';
const src = (r: { start: number; end: number }) => source.slice(r.start, r.end);

/** Problems with the ranges under `node`, which must lie inside `outer`. */
function badRanges(node: YamlNode, outer: { start: number; end: number }): string[] {
  const bad: string[] = [];
  const inside = (r: { start: number; end: number }) =>
    r.start >= outer.start && r.end <= outer.end && r.start <= r.end;
  if (!inside(node.range)) bad.push(`range ${node.range.start}-${node.range.end}`);
  const text = badText(src(node.range), node);
  if (text) bad.push(text);
  if (node.kind === 'map') {
    for (const pair of node.pairs) {
      const key = src(pair.keyRange);
      if (!inside(pair.keyRange)) bad.push(`key range of ${pair.key}`);
      if (!/^["']/.test(key) && key !== pair.key) bad.push(`key ${pair.key} reads ${key}`);
      if (pair.value) bad.push(...badRanges(pair.value, node.range));
    }
  } else if (node.kind === 'seq') {
    for (const item of node.items) bad.push(...badRanges(item, node.range));
  }
  return bad;
}

describe('YAML tree mode over the corpus front matter', async () => {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, CORPUS_DIR), CORPUS_DIR)) items.push(item);

  it('reads what the default mode reads, with ranges that nest', () => {
    let read = 0;
    const differing: string[] = [];
    for (const { id, source: text } of items) {
      const fm = preprocess(text).frontMatter;
      if (!fm) continue;
      read++;
      const lineStart = text.lastIndexOf('\n', fm.range.start - 1) + 1;
      const indent = /^[ \t]*/.exec(text.slice(lineStart, fm.range.start + 3))?.[0] ?? '';
      const opts = { start: fm.yamlRange.start, end: fm.yamlRange.end, indent };
      const plain = parseYaml(text, opts);
      const tree = parseYaml(text, { ...opts, tree: true });
      const same =
        JSON.stringify([tree.value, tree.diagnostics]) ===
        JSON.stringify([plain.value, plain.diagnostics]);
      source = text;
      const bad = tree.root ? badRanges(tree.root, fm.yamlRange) : [];
      if (!same || bad.length > 0) differing.push(`${id}: ${same ? bad.join(', ') : 'value'}`);
    }
    expect(read).toBeGreaterThan(100);
    expect(differing).toEqual([]);
  });
});

/** Every `{…}` after `@` in `text` (flowchart shape data), brackets balanced, quotes skipped. */
function shapeData(text: string): string[] {
  const out: string[] = [];
  for (let at = text.indexOf('@{'); at >= 0; at = text.indexOf('@{', at + 1)) {
    let depth = 0;
    let quote = '';
    for (let i = at + 1; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        out.push(text.slice(at + 1, i + 1));
        break;
      }
    }
  }
  return out;
}

/** JSON of a read, with non-finite numbers (`.inf`, `.nan`) kept apart from `null`. */
function readout(r: { value: unknown; diagnostics: unknown }): string {
  return JSON.stringify([r.value, r.diagnostics], (_k, v: unknown) =>
    typeof v === 'number' && !Number.isFinite(v) ? `#${v}` : v
  );
}

/** The default mode's reads of one fixture: its front matter, then each shape data block. */
function readsOf(text: string): string[] {
  const reads: string[] = [];
  const fm = preprocess(text).frontMatter;
  if (fm) {
    const lineStart = text.lastIndexOf('\n', fm.range.start - 1) + 1;
    const indent = /^[ \t]*/.exec(text.slice(lineStart, fm.range.start + 3))?.[0] ?? '';
    reads.push(readout(parseYaml(text, { ...fm.yamlRange, indent })));
  }
  for (const data of shapeData(text)) reads.push(readout(parseYaml(data)));
  return reads;
}

/** Folder → fixture id → `<count> <hash16>`, for every fixture with reads. */
type Digests = Map<string, Map<string, string>>;

function digests(items: CorpusItem[]): Digests {
  const out: Digests = new Map();
  for (const { id, source: text } of items) {
    const reads = readsOf(text);
    if (reads.length === 0) continue;
    const folder = id.split('/')[2] ?? '';
    const hash = createHash('sha256').update(reads.join('\n')).digest('hex').slice(0, 16);
    let lines = out.get(folder);
    if (lines === undefined) out.set(folder, (lines = new Map<string, string>()));
    lines.set(id, `${reads.length} ${hash}`);
  }
  return out;
}

const LINE = /^(\S+) (\d+ [0-9a-f]{16})$/;

/** What the digest files pin. A line that is not `<id> <count> <hash16>` fails here. */
function pinnedDigests(): Digests {
  const out: Digests = new Map();
  for (const file of readdirSync(DIGESTS).filter((f) => f.endsWith('.txt'))) {
    const lines = new Map<string, string>();
    for (const line of readFileSync(join(DIGESTS, file), 'utf8').split('\n')) {
      if (line === '') continue;
      const match = LINE.exec(line);
      expect(match, `${file}: not "<id> <count> <hash16>": ${line}`).not.toBeNull();
      lines.set(match![1]!, match![2]!);
    }
    out.set(file.slice(0, -'.txt'.length), lines);
  }
  return out;
}

/** Rewrite every digest file from `current`, sorted by id, and drop those of folders with no reads. */
function writeDigests(current: Digests): void {
  for (const file of readdirSync(DIGESTS).filter((f) => f.endsWith('.txt')))
    if (!current.has(file.slice(0, -'.txt'.length))) rmSync(join(DIGESTS, file));
  const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  for (const [folder, lines] of current) {
    const ids = [...lines.keys()].sort(byCodePoint);
    const text = ids.map((id) => `${id} ${lines.get(id)}\n`).join('');
    writeFileSync(join(DIGESTS, `${folder}.txt`), text);
  }
}

describe('YAML default mode over the corpus', async () => {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, CORPUS_DIR), CORPUS_DIR)) items.push(item);

  it('reads front matter and shape data exactly as before (digest per fixture)', () => {
    const current = digests(items);
    expect(current.size).toBeGreaterThan(10);
    if (expect.getState().snapshotState.snapshotUpdateState === 'all') return writeDigests(current);
    const pins = pinnedDigests();
    const corpus = new Set(items.map((item) => item.id));
    const changed: string[] = [];
    const missing: string[] = [];
    const unpinned: string[] = [];
    for (const [folder, pinned] of pins) {
      for (const [id, line] of pinned) {
        const now = current.get(folder)?.get(id);
        if (!corpus.has(id)) missing.push(id);
        else if (now !== line) changed.push(`${id}: pinned ${line}, reads ${now ?? 'nothing'}`);
      }
    }
    for (const [folder, lines] of current)
      for (const id of lines.keys()) if (!pins.get(folder)?.has(id)) unpinned.push(id);
    if (unpinned.length > 0) {
      console.info(
        `yaml-tree: ${unpinned.length} fixture(s) with reads not pinned yet (${REGENERATE} pins them):\n  ${unpinned.join('\n  ')}`
      );
    }
    expect(changed, `reads that changed (if on purpose, regenerate: ${REGENERATE})`).toEqual([]);
    expect(missing, `pinned fixtures not in the corpus: regenerate with ${REGENERATE}`).toEqual([]);
  });
});
