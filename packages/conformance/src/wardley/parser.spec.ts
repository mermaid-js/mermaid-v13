import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseWardley,
  WARDLEY_COORDINATE_AMBIGUOUS,
  WARDLEY_LINK_DROPPED,
  WARDLEY_PIPELINE_REPLACED,
  WARDLEY_UNKNOWN_TARGET,
} from '@mermaid-js/diagram-wardley';
import type { WardleyPipelineNode } from '@mermaid-js/diagram-wardley';
import { WardleyTokenKind } from '@mermaid-js/diagram-wardley/testing';
import { preprocess } from '@mermaid-js/core/preprocess';
import { REPO_ROOT } from '../corpus.ts';

/**
 * The wardley parser and model (#489) on the e2e fixtures (`pr-check/`, and the parser's own in
 * `nightly-check/parser-*.mmd`) and the cases of `corpus/wardley-cases.json` v12 rejects: v12's population rules (merges, pipelines, link resolution,
 * last-wins, category order), the D218 title, AST ids (D427), the D425 and D428 warnings,
 * symbols (D427), statement spans and source ranges. Accept/reject and model parity with v12
 * are `parity.spec.ts`'s.
 */
const parse = (src: string) => parseWardley(src);
const fixture = (name: string) =>
  readFileSync(join(REPO_ROOT, `e2e/diagrams/wardley/pr-check/${name}.mmd`), 'utf8');
/** The parser's fixtures that v12 accepts (as radar's T2): `e2e/diagrams/wardley/nightly-check/`. */
const nightly = (name: string) =>
  readFileSync(join(REPO_ROOT, `e2e/diagrams/wardley/nightly-check/${name}.mmd`), 'utf8');
const CASES = new Map(
  (
    JSON.parse(
      readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/wardley-cases.json'), 'utf8')
    ) as { id: string; source: string }[]
  ).map((c) => [c.id, c.source])
);
const wardleyCase = (id: string): string => {
  const found = CASES.get(`wardley-cases/${id}`);
  if (found === undefined) throw new Error(`no wardley case ${id}`);
  return found;
};
const ids = (src: string) =>
  parse(src).ast.children.map((n) =>
    n.type === 'Pipeline' ? [n.id, ...n.children.map((c) => c.id)] : n.id
  );

describe('wardley parser on the fixtures', () => {
  it('reads the tea shop: anchors before components, links, trends, notes, title, size', () => {
    const { model, diagnostics } = parse(fixture('1-should-render-tea-shop'));
    expect(diagnostics).toEqual([]);
    expect(model.nodes.map((n) => [n.id, n.className])).toEqual([
      ['Business', 'anchor'],
      ['Public', 'anchor'],
      ['Cup of Tea', 'component'],
      ['Cup', 'component'],
      ['Tea', 'component'],
      ['Hot Water', 'component'],
      ['Water', 'component'],
      ['Kettle', 'component'],
      ['Power', 'component'],
    ]);
    expect(model.nodes[2]).toEqual({
      id: 'Cup of Tea',
      label: 'Cup of Tea',
      x: 61,
      y: 79,
      className: 'component',
      labelOffsetX: 19,
      labelOffsetY: -4,
      inertia: false,
      inPipeline: false,
      isPipelineParent: false,
      astId: 'node:Cup of Tea',
    });
    expect(model.links).toHaveLength(8);
    expect(model.links[0]).toEqual({
      source: 'Business',
      target: 'Cup of Tea',
      dashed: false,
      astId: 'link:Business->Cup of Tea',
    });
    expect(model.trends).toEqual([
      { nodeId: 'Kettle', targetX: 62, targetY: 43, astId: 'evolve:Kettle' },
      { nodeId: 'Power', targetX: 89, targetY: 10, astId: 'evolve:Power' },
    ]);
    expect(model.notes.map((n) => n.astId)).toEqual(['note:1', 'note:2', 'note:3']);
    expect(model.notes[0]).toMatchObject({ x: 49, y: 30 });
    expect(model.size).toEqual({ width: 1100, height: 800, astId: 'size' });
    expect(model).toMatchObject({ title: 'Tea Shop', titleAstId: 'title' });
    expect(Object.isFrozen(model) && Object.isFrozen(model.nodes[0])).toBe(true);
    expect(structuredClone(model)).toEqual(model);
  });

  it('reads pipelines: child ids, the parent line, links to children by label', () => {
    const { model, diagnostics } = parse(fixture('3-should-render-pipelines'));
    expect(diagnostics).toEqual([]);
    const kettle = model.nodes.find((n) => n.id === 'Kettle');
    // 0.57 × 100, as v12 computed it.
    expect(kettle).toMatchObject({ isPipelineParent: true, y: 0.57 * 100 });
    expect(model.pipelines).toEqual([
      {
        nodeId: 'Kettle',
        componentIds: ['Kettle_Campfire Kettle', 'Kettle_Electric Kettle', 'Kettle_Smart Kettle'],
        astId: 'pipeline:Kettle',
      },
    ]);
    expect(model.nodes.find((n) => n.id === 'Kettle_Campfire Kettle')).toEqual({
      id: 'Kettle_Campfire Kettle',
      label: 'Campfire Kettle',
      x: 35,
      y: 0.57 * 100,
      className: 'pipeline-component',
      labelOffsetX: -60,
      labelOffsetY: 35,
      inertia: false,
      inPipeline: true,
      isPipelineParent: false,
      astId: 'node:Kettle_Campfire Kettle',
    });
    expect(model.links.map((l) => [l.source, l.target])).toEqual([
      ['Kettle', 'Power'],
      ['User', 'Kettle_Electric Kettle'],
      ['Kettle_Campfire Kettle', 'Kettle'],
      ['Kettle_Electric Kettle', 'Kettle'],
      ['Kettle_Smart Kettle', 'Kettle'],
    ]);
  });
});

describe('wardley model: v12 population rules', () => {
  it('merges statements for one node: later values win, label offsets fall back', () => {
    const { model } = parse(nightly('parser-merge-nodes'));
    expect(model.nodes).toEqual([
      {
        id: 'A',
        label: 'A',
        x: 20,
        y: 20,
        className: 'component',
        labelOffsetX: -4,
        labelOffsetY: 6,
        inertia: false,
        inPipeline: false,
        isPipelineParent: false,
        astId: 'node:A',
      },
    ]);
    expect(ids(nightly('parser-merge-nodes'))).toEqual([
      'wardley',
      'node:A',
      'node:A@2',
      'node:A@3',
      'node:A@4',
    ]);
  });

  it('a pipeline child over a component of its id drops inertia and strategy, keeps offsets', () => {
    const node = parse(nightly('parser-pipeline-id-collision')).model.nodes[1];
    expect(node).toEqual({
      id: 'P_c',
      label: 'c',
      x: 20,
      y: 50,
      className: 'pipeline-component',
      labelOffsetX: 5,
      labelOffsetY: 5,
      inertia: false,
      inPipeline: true,
      isPipelineParent: false,
      astId: 'node:P_c',
    });
  });

  it('a second pipeline for a parent replaces its children, with one warning', () => {
    const src = nightly('parser-pipeline-replaced');
    const { model, diagnostics } = parse(src);
    expect(model.pipelines).toEqual([
      { nodeId: 'Kettle', componentIds: ['Kettle_Electric'], astId: 'pipeline:Kettle@2' },
    ]);
    // The old child stays a node, still marked as in a pipeline (v12's builder).
    expect(model.nodes.find((n) => n.id === 'Kettle_Gas')?.inPipeline).toBe(true);
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([
      [WARDLEY_PIPELINE_REPLACED, 'warning'],
    ]);
    const [d] = diagnostics;
    expect(src.slice(d?.range.start, d?.range.end)).toBe('Kettle');
    expect(d?.related?.map((r) => src.slice(r.range.start, r.range.end))).toEqual(['Kettle']);
    expect(d?.range.start).toBeGreaterThan(d?.related?.[0]?.range.start ?? Infinity);
    expect(model.warnings).toEqual(diagnostics);
    expect(model.trends).toEqual([
      { nodeId: 'Kettle', targetX: 80, targetY: 50, astId: 'evolve:Kettle' },
    ]);
  });

  it('keeps links whatever their ends; one warning for those not drawn', () => {
    const src = nightly('parser-link-resolve');
    const { model, diagnostics } = parse(src);
    expect(model.links.map((l) => [l.source, l.target])).toEqual([
      ['A', 'B'],
      ['A', 'X'],
      ['Y', 'Z'],
      ['B', 'B'],
    ]);
    expect(diagnostics).toHaveLength(1);
    const [d] = diagnostics;
    expect(d).toMatchObject({ code: WARDLEY_LINK_DROPPED, severity: 'warning' });
    expect(d?.message).toBe('The link `A -> X` is not drawn: `X` names no anchor or component.');
    expect(d?.related?.map((r) => [src.slice(r.range.start, r.range.end), r.message])).toEqual([
      ['Y -> Z', 'the link `Y -> Z` is not drawn either: `Y` and `Z` name no anchor or component'],
      ['B -> B', 'the link `B -> B` is not drawn either: it links `B` to itself'],
    ]);
  });

  it('reads flows, dashes and labels as v12 did', () => {
    const { model } = parse(nightly('parser-link-flows'));
    expect(model.links.map(({ dashed, label, flow }) => ({ dashed, label, flow }))).toEqual([
      { dashed: false, label: undefined, flow: 'bidirectional' },
      { dashed: false, label: undefined, flow: 'backward' },
      { dashed: false, label: undefined, flow: 'forward' },
      { dashed: false, label: undefined, flow: 'backward' },
      // The arrow's label wins over the `;` label.
      { dashed: false, label: 'x', flow: 'forward' },
      // v12 tested the whole arrow for `<`: the label's counts.
      { dashed: false, label: 'a<b', flow: 'backward' },
      { dashed: false, label: '', flow: 'bidirectional' },
      { dashed: false, label: undefined, flow: 'forward' },
      { dashed: true, label: undefined, flow: undefined },
      { dashed: false, label: undefined, flow: undefined },
      { dashed: false, label: undefined, flow: undefined },
      { dashed: false, label: undefined, flow: undefined },
      { dashed: false, label: '', flow: undefined },
    ]);
  });

  it('an evolve of an unknown name is skipped with one warning, before its range check', () => {
    const { model, diagnostics } = parse(nightly('parser-range-evolve-unknown'));
    expect(model.trends.map((t) => t.nodeId)).toEqual(['Tea']);
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([
      [WARDLEY_UNKNOWN_TARGET, 'warning'],
    ]);
    // A pipeline child is found by its id only, as v12's `getNode`.
    const child = parse(nightly('parser-evolve-pipeline-child'));
    expect(child.model.trends.map((t) => t.nodeId)).toEqual(['P_c']);
    expect(child.diagnostics.map((d) => d.code)).toEqual([WARDLEY_UNKNOWN_TARGET]);
  });

  it('keeps the last evolve, evolution and size, and the first annotations box', () => {
    expect(parse(nightly('parser-evolve-last-wins')).model.trends).toEqual([
      { nodeId: 'A', targetX: 70, targetY: 50, astId: 'evolve:A@2' },
      { nodeId: 'B', targetX: 80, targetY: 40, astId: 'evolve:B' },
    ]);
    expect(parse(nightly('parser-evolution-last-wins')).model.evolution).toEqual({
      stages: ['Genesis / Concept', 'Custom / Emerging', 'Product'],
      boundaries: [0.4],
      astId: 'evolution@2',
    });
    expect(parse(nightly('parser-size-last-wins')).model.size).toEqual({
      width: 0,
      height: 0,
      astId: 'size@2',
    });
    expect(parse(nightly('parser-range-annotations-second')).model.annotationsBox).toEqual({
      x: 90,
      y: 10,
      astId: 'annotations',
    });
  });

  it('reports range errors in source order with v12 messages, keeping the value as 100', () => {
    const src = wardleyCase('parser-range-category-order');
    const { model, diagnostics } = parse(src);
    expect(
      diagnostics.map((d) => [d.code, src.slice(d.range.start, d.range.end), d.message])
    ).toEqual([
      [
        'WARDLEY_OUT_OF_RANGE',
        '102.0',
        'Accelerator "Cloud" evolution must be between 0-1 (decimal) or 0-100 (percentage). Received: 102',
      ],
      [
        'WARDLEY_OUT_OF_RANGE',
        '103.0',
        'Anchor "User" visibility must be between 0-1 (decimal) or 0-100 (percentage). Received: 103',
      ],
    ]);
    expect(model.accelerators[0]).toMatchObject({ x: 100, y: 50 });
    expect(model.nodes[0]).toMatchObject({ id: 'User', x: 50, y: 100 });
    const limits = parse(nightly('parser-range-limits'));
    expect(limits.model.nodes.map((n) => [n.x, n.y])).toEqual([
      [100, 0],
      [2, 100],
      [99.99, 1.000001],
    ]);
  });

  it('warns once for coordinates in (1, 2), D428', () => {
    const src = nightly('parser-coordinates-ambiguous');
    const { model, diagnostics } = parse(src);
    expect(diagnostics.map((d) => d.code)).toEqual([WARDLEY_COORDINATE_AMBIGUOUS]);
    const [d] = diagnostics;
    expect(src.slice(d?.range.start, d?.range.end)).toBe('1.5');
    expect(d?.related?.map((r) => src.slice(r.range.start, r.range.end))).toEqual([
      '1.000001',
      '1.99',
    ]);
    expect(model.nodes.map((n) => [n.x, n.y])).toEqual([
      [50, 1.5],
      [1.000001, 50],
    ]);
    // INT coordinates: `1` is 100 %, `2` is 2 %.
    expect(model.annotations[0]).toMatchObject({ x: 2, y: 100 });
  });
});

describe('wardley messages and the probe', () => {
  it('says a name starts with a keyword and how to quote it (D423)', () => {
    const messages = (id: string) =>
      parse(wardleyCase(id))
        .diagnostics.filter((d) => d.severity === 'error')
        .map((d) => d.message);
    expect(messages('keyword-names-note')).toEqual([
      'Expected a name such as `Tea` or `"Hot water"`, got `note`; `notebook` starts with the keyword `note`, and an unquoted name cannot be or start with one: quote it, as `"notebook"`.',
    ]);
    expect(messages('keyword-names-component')[0]).toContain(
      '`component` is a keyword, and an unquoted name cannot be or start with one: quote it, as `"component"`'
    );
    expect(messages('keyword-names-strategy')[0]).toContain(
      '`marketing` starts with the keyword `market`'
    );
  });

  it('keeps the preprocess diagnostics unless they are handed in', () => {
    const src = wardleyCase('unclosed-directive');
    const pre = preprocess(src);
    expect(pre.diagnostics.map((d) => d.code)).toEqual(['UNCLOSED_DIRECTIVE']);
    const own = parse(src).diagnostics.map((d) => d.code);
    expect(own).toContain('UNCLOSED_DIRECTIVE');
    expect(parseWardley(src, { preprocessed: pre }).diagnostics.map((d) => d.code)).not.toContain(
      'UNCLOSED_DIRECTIVE'
    );
  });

  it('records what the parser expects at a probe offset, and the title mode', () => {
    const src = fixture('1-should-render-tea-shop');
    const after = src.indexOf('component Cup [0.73, 0.78]') + 'component Cup [0.73, 0.78]'.length;
    expect(parseWardley(src, { probe: after }).probe?.expected).toEqual(
      expect.arrayContaining([
        WardleyTokenKind.Label,
        WardleyTokenKind.LParen,
        WardleyTokenKind.Inertia,
      ])
    );
    const inTitle = src.indexOf('title Tea Shop') + 'title Tea'.length;
    expect(parseWardley(src, { probe: inTitle }).probe?.mode).toBe('title');
  });
});

describe('wardley title and accessibility (D218)', () => {
  it('the last in-text title wins; an empty one leaves none', () => {
    expect(parse(nightly('parser-title-last-wins')).model).toMatchObject({
      title: 'Second title',
      titleAstId: 'title@2',
    });
    expect(parse(nightly('parser-title-last-empty')).model.title).toBeUndefined();
  });

  it('falls back to the front-matter title', () => {
    const { model } = parse(nightly('parser-front-matter-title'));
    expect(model.title).toBe('From front matter');
    expect(model.titleAstId).toBeUndefined();
  });

  it("converts accTitle and accDescr as v12's value converter", () => {
    expect(parse(nightly('parser-acc')).model).toMatchObject({
      accTitle: 'An accessible title',
      accDescr: 'last wins',
    });
    expect(ids(nightly('parser-acc'))).toEqual(['wardley', 'accTitle', 'accDescr', 'accDescr@2']);
  });
});

describe('wardley AST, symbols and statements', () => {
  it('gives every statement a D427 id', () => {
    expect(ids(fixture('6-should-render-gpt-tokeniser-architecture'))).toContain(
      'deaccelerator:License Play'
    );
    expect(ids(wardleyCase('annotation-duplicate-numbers'))).toEqual([
      'wardley',
      'annotations',
      'annotation:1',
      'annotation:1@2',
    ]);
    expect(ids(nightly('parser-pipeline-replaced'))).toEqual([
      'wardley',
      'node:Kettle',
      ['pipeline:Kettle', 'node:Kettle_Gas'],
      ['pipeline:Kettle@2', 'node:Kettle_Electric'],
      'link:Gas->Electric',
      'evolve:Kettle',
    ]);
    // Quoted names are converted; `>`, `@`, `#` and `%` would be percent-encoded.
    expect(ids(nightly('parser-quoted-names'))).toEqual([
      'wardley',
      'node:Tea "Cup"',
      'node:  spaced  ',
      'link:Tea "Cup"->  spaced  ',
      'evolution',
    ]);
    const enc = parse('wardley-beta\n"a>b" -> "c@d"\n"a>b" -> "c@d"');
    expect(enc.ast.children.map((n) => n.id)).toEqual([
      'wardley',
      'link:a%3Eb->c%40d',
      'link:a%3Eb->c%40d@2',
    ]);
  });

  it('defines a node at its first anchor or component; other names refer to it', () => {
    const src = nightly('parser-pipeline-replaced');
    const at = (s: { range: { start: number; end: number } }) =>
      src.slice(s.range.start, s.range.end);
    expect(parse(src).symbols.map((s) => [s.role, s.name, at(s)])).toEqual([
      ['def', 'Kettle', 'Kettle'],
      ['ref', 'Kettle', 'Kettle'],
      ['def', 'Gas', 'Gas'],
      ['ref', 'Kettle', 'Kettle'],
      ['def', 'Electric', 'Electric'],
      ['ref', 'Gas', 'Gas'],
      ['ref', 'Electric', 'Electric'],
      ['ref', 'Kettle', 'Kettle'],
    ]);
    // A quoted name's symbol covers its quotes (D191); names no node defines have none.
    const quoted = nightly('parser-quoted-names');
    expect(parse(quoted).symbols.map((s) => quoted.slice(s.range.start, s.range.end))).toEqual([
      '"Tea \\"Cup\\""',
      "'  spaced  '",
      '"Tea \\"Cup\\""',
      "'  spaced  '",
    ]);
    expect(parse(nightly('parser-link-resolve')).symbols.map((s) => s.name)).toEqual([
      'A',
      'B',
      'A',
      'B',
      'A',
      'B',
      'B',
    ]);
  });

  it('spans statements; a pipeline holds its components', () => {
    const src = nightly('parser-pipeline-blank-lines');
    const { statements, ast } = parse(src);
    const text = (r: { start: number; end: number }) => src.slice(r.start, r.end);
    expect(
      statements.map((s) => [s.kind, text(s.range), s.children?.map((c) => text(c.range))])
    ).toEqual([
      ['header', 'wardley-beta', undefined],
      ['component', 'component P [0.5, 0.5]', undefined],
      [
        'pipeline',
        'pipeline P {\n\n  component c [0.2]\n\n  component d [0.3]\n\n}',
        ['component c [0.2]', 'component d [0.3]'],
      ],
    ]);
    const pipeline = ast.children[2] as WardleyPipelineNode;
    expect(text(pipeline.range)).toBe(text(statements[2]?.range ?? { start: 0, end: 0 }));
    expect(pipeline.children.map((c) => [c.id, text(c.name.range), c.evolution.value])).toEqual([
      ['node:P_c', 'c', 0.2],
      ['node:P_d', 'd', 0.3],
    ]);
  });

  // An unknown `#y;` stays as written, where v12 drew `&y;` (D559).
  it("decodes v12's #name; codes as v12 drew them and keeps a literal &name; (GAPS #493)", () => {
    const { model } = parse(nightly('parser-entity-codes'));
    expect(model.title).toBe('A & B &amp; C');
    expect(model.nodes.map((n) => n.label)).toEqual(['Tea & &amp; "Cups"', 'X #y; ♥ #x41;']);
    expect(model.notes[0]!.text).toBe('♥ love &lt;3');
    expect(model.links[0]).toMatchObject({
      source: 'Tea & &amp; "Cups"',
      target: 'X #y; ♥ #x41;',
      label: 'a < b &gt; c',
    });
    // An `&` in a comment inside the range is dropped with the comment.
    expect(model.accDescr).toBe('a & b\ne &amp;');
  });

  it('accepts every parser fixture without an error, as v12 does', () => {
    const dir = join(REPO_ROOT, 'e2e/diagrams/wardley/nightly-check');
    const names = readdirSync(dir).filter((f) => f.startsWith('parser-') && f.endsWith('.mmd'));
    expect(names.length).toBe(33);
    for (const file of names) {
      const errors = parse(readFileSync(join(dir, file), 'utf8')).diagnostics.filter(
        (d) => d.severity === 'error'
      );
      expect(errors, file).toEqual([]);
    }
    expect(parse(nightly('parser-component-glued-keyword')).model.nodes.map((n) => n.id)).toEqual([
      'B',
      'A',
    ]);
  });
});
