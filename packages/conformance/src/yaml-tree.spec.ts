/**
 * The YAML reader's tree mode (R-LANG-5) over the front matter of the e2e corpus: it reads the
 * same value and diagnostics as the default mode, its ranges nest, and each covers the text of
 * its key or value.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseYaml, preprocess } from '@mermaid-js/core/preprocess';
import type { YamlNode } from '@mermaid-js/core/preprocess';
import { corpusFromDir, REPO_ROOT } from './corpus.ts';
import type { CorpusItem } from './types.ts';

const CORPUS_DIR = 'e2e/diagrams';

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
