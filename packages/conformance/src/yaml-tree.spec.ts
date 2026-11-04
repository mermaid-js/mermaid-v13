/**
 * The YAML reader's tree mode (R-LANG-5) over the front matter of the e2e corpus: it reads the
 * same value and diagnostics as the default mode, and its ranges nest and cover their keys.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseYaml, preprocess } from '@mermaid-js/core/preprocess';
import type { YamlNode } from '@mermaid-js/core/preprocess';
import { corpusFromDir, REPO_ROOT } from './corpus.ts';
import type { CorpusItem } from './types.ts';

const CORPUS_DIR = 'e2e/diagrams';

/** Problems with the ranges under `node`, which must lie inside `outer`. */
function badRanges(src: string, node: YamlNode, outer: { start: number; end: number }): string[] {
  const bad: string[] = [];
  const inside = (r: { start: number; end: number }) =>
    r.start >= outer.start && r.end <= outer.end && r.start <= r.end;
  if (!inside(node.range)) bad.push(`range ${node.range.start}-${node.range.end}`);
  if (node.kind === 'map') {
    for (const pair of node.pairs) {
      const text = src.slice(pair.keyRange.start, pair.keyRange.end);
      if (!inside(pair.keyRange)) bad.push(`key range of ${pair.key}`);
      if (!/^["']/.test(text) && text !== pair.key) bad.push(`key ${pair.key} reads ${text}`);
      if (pair.value) bad.push(...badRanges(src, pair.value, node.range));
    }
  } else if (node.kind === 'seq') {
    for (const item of node.items) bad.push(...badRanges(src, item, node.range));
  }
  return bad;
}

describe('YAML tree mode over the corpus front matter', async () => {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, CORPUS_DIR), CORPUS_DIR)) items.push(item);

  it('reads what the default mode reads, with ranges that nest', () => {
    let read = 0;
    const differing: string[] = [];
    for (const { id, source } of items) {
      const fm = preprocess(source).frontMatter;
      if (!fm) continue;
      read++;
      const lineStart = source.lastIndexOf('\n', fm.range.start - 1) + 1;
      const indent = /^[ \t]*/.exec(source.slice(lineStart, fm.range.start + 3))?.[0] ?? '';
      const opts = { start: fm.yamlRange.start, end: fm.yamlRange.end, indent };
      const plain = parseYaml(source, opts);
      const tree = parseYaml(source, { ...opts, tree: true });
      const same =
        JSON.stringify([tree.value, tree.diagnostics]) ===
        JSON.stringify([plain.value, plain.diagnostics]);
      const bad = tree.root ? badRanges(source, tree.root, fm.yamlRange) : [];
      if (!same || bad.length > 0) differing.push(`${id}: ${same ? bad.join(', ') : 'value'}`);
    }
    expect(read).toBeGreaterThan(100);
    expect(differing).toEqual([]);
  });
});
