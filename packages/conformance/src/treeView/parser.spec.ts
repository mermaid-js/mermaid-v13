import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectTreeView,
  parseTreeView,
  TREEVIEW_ANNOTATION_NEXT_LINE,
  TREEVIEW_NAME_READ_AS_TITLE,
  TREEVIEW_NODES_ON_ONE_LINE,
  TREEVIEW_TRAILING_BLANK,
} from '@mermaid-js/diagram-treeview';
import type { TreeViewParseResult } from '@mermaid-js/diagram-treeview';
import { REPO_ROOT } from '../corpus.ts';
import { loadOracle } from '../oracle.ts';

/**
 * What the treeView parser gives beyond the parity snapshot (#572): AST ids (D487), ranges in
 * the source (box drawing included, D486), symbols, warnings, the front-matter title (D218,
 * D484) and the text statements. The sources are the `parser-*` cases of
 * `corpus/treeView-cases.json`, which the gates also run (v12 accepts each: checked here too).
 */
const CASES = new Map(
  (
    JSON.parse(
      readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/treeView-cases.json'), 'utf8')
    ) as { id: string; source: string }[]
  ).map((c) => [c.id.replace('treeView-cases/', ''), c.source])
);

function parsed(id: string): { src: string; result: TreeViewParseResult } {
  const src = CASES.get(id);
  if (src === undefined) throw new Error(`no case ${id}`);
  return { src, result: parseTreeView(src) };
}

const at = (src: string, r: { start: number; end: number }) => src.slice(r.start, r.end);

describe('treeView parser', () => {
  it('accepts every parser case, as v12 does', async () => {
    const oracle = await loadOracle();
    for (const [id, src] of CASES) {
      if (!id.startsWith('parser-')) continue;
      expect((await oracle.parse(src)).accepted, id).toBe(true);
      const errors = parseTreeView(src).diagnostics.filter((d) => d.severity === 'error');
      expect(errors, id).toEqual([]);
    }
  });

  it('detects the header as v12 did', () => {
    expect(detectTreeView('treeView-beta\n  a')).toBe(true);
    expect(detectTreeView('%% c\n  treeView-betaX')).toBe(true);
    expect(detectTreeView('treeview-beta')).toBe(false);
  });

  it('gives each node an AST id from its path, @2 for a repeat in one directory (D487)', () => {
    const { result } = parsed('parser-ast-ids');
    expect(result.model.nodes.map((n) => [n.astId, n.depth])).toEqual([
      ['node:app', 0],
      ['node:app/src', 1],
      ['node:app/src/index.js', 2],
      ['node:app/src/index.js@2', 2],
      // A file named as a directory beside it shares its path.
      ['node:app/src@2', 1],
      ['node:app/a%2Fb%25c%40d', 1],
      ['node:lib', 0],
      ['node:lib/index.js', 1],
    ]);
    const ids = result.ast.children.map((n) => n.id);
    expect(ids.slice(0, 2)).toEqual(['treeView', 'title']);
    expect(ids.slice(2)).toEqual(result.model.nodes.map((n) => n.astId));
    expect(result.model.titleAstId).toBe('title');
  });

  it('nests the model as v12 did', () => {
    const { result } = parsed('parser-ast-ids');
    const [app, lib] = result.model.roots;
    expect(app?.children.map((n) => n.name)).toEqual(['src', 'src', 'a/b%c@d']);
    expect(app?.children[0]?.children.map((n) => n.name)).toEqual(['index.js', 'index.js']);
    expect(app?.children.map((n) => n.directory)).toEqual([true, false, false]);
    expect(lib?.children.map((n) => n.level)).toEqual([2]);
  });

  it('records a node symbol per node, over just its name', () => {
    const { src, result } = parsed('parser-symbols');
    expect(result.symbols.map((s) => [s.name, s.kind, s.role, at(src, s.range)])).toEqual([
      ['my dir', 'node', 'def', 'my dir'],
      ['index.js', 'node', 'def', 'index.js'],
      ['my file', 'node', 'def', 'my file'],
      ['lib', 'node', 'def', 'lib'],
    ]);
    expect(result.model.nodes.map((n) => at(src, n.range))).toEqual([
      '"my dir/"',
      'index.js',
      '"my file"',
      'lib/',
    ]);
  });

  it('gives box-drawing nodes their ranges in the source (D486)', () => {
    const { src, result } = parsed('parser-box-ranges');
    const nodes = result.ast.children.flatMap((n) => (n.type === 'Node' ? [n] : []));
    expect(nodes.map((n) => [n.id, at(src, n.range)])).toEqual([
      ['node:src', 'src/ :::hl'],
      ['node:src/index.js', 'index.js ## entry'],
      ['node:read me', '"read me"'],
    ]);
    expect(nodes.map((n) => [n.level, n.depth])).toEqual([
      [4, 0],
      [8, 1],
      [4, 0],
    ]);
    const [src0, index] = nodes;
    expect(src0?.classRange && at(src, src0.classRange)).toBe(':::hl');
    expect(index?.description).toBe('entry');
    expect(index?.descriptionRange && at(src, index.descriptionRange)).toBe('## entry');
  });

  it("warns at v12's traps that it accepts", () => {
    const { src, result } = parsed('parser-warnings');
    expect(result.diagnostics.map((d) => [d.severity, d.code, at(src, d.range)] as const)).toEqual([
      ['warning', TREEVIEW_NAME_READ_AS_TITLE, 'title.txt'],
      ['warning', TREEVIEW_NODES_ON_ONE_LINE, 'trailing'],
      ['warning', TREEVIEW_TRAILING_BLANK, ' '],
      ['warning', TREEVIEW_ANNOTATION_NEXT_LINE, ':::hl'],
      ['warning', TREEVIEW_TRAILING_BLANK, '  '],
    ]);
    expect(result.model.warnings).toHaveLength(5);
    expect(result.model.nodes.map((n) => [n.name, n.depth, n.cssClass])).toEqual([
      ['.txt', 0, undefined],
      ['q x', 0, undefined],
      ['trailing', 1, undefined],
      ['a', 0, undefined],
      ['b', 1, undefined],
      ['c', 0, 'hl'],
      ['d', 1, undefined],
    ]);
  });

  it('keeps the front-matter title when the text has none (D218, D484)', () => {
    const { result } = parsed('parser-front-matter-title');
    expect(result.model.title).toBe('From front matter');
    expect(result.model.titleAstId).toBeUndefined();
  });

  it('keeps the last title, accTitle and accDescr, each statement with its own id', () => {
    const { result } = parsed('parser-text-last-wins');
    expect([result.model.title, result.model.accTitle, result.model.accDescr]).toEqual([
      'B',
      'y',
      'one\ntwo',
    ]);
    expect(result.model.titleAstId).toBe('title@2');
    expect(result.ast.children.map((n) => n.id)).toEqual([
      'treeView',
      'title',
      'title@2',
      'accTitle',
      'accTitle@2',
      'accDescr',
      'node:a',
    ]);
    expect(result.statements.map((s) => s.kind)).toEqual([
      'header',
      'title',
      'title',
      'accTitle',
      'accTitle',
      'accDescr',
      'node',
    ]);
  });
});
