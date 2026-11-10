import { beforeAll, describe, expect, it } from 'vitest';
import type { AstId } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';

/**
 * v12's element-mapping specs (`agentflow-mappings`, `agentflow-attachment-mapping`,
 * `agentflow-inline-metadata-mapping`, `agentflow-subgraph-span`'s innermost-match ranking and
 * `agentflow-blank-line-fold`, skipped in `src/v12-specs/` as D465 removed the DB methods they
 * read) re-asked through the language service (#549): v12's `getElementById` /
 * `getElementAtPosition` are `astAt` (innermost first) and `rangeOf`, a declaration's line is
 * its `definition`, and a container's span is its fold. Lines and columns are v12's: lines
 * from 1, columns from 0.
 *
 * The service loads the facet through the generated registry row (agentflow's manifest, #550).
 */
const service = createLanguageService();
beforeAll(() => service.preload({ types: ['agentflow'] }));

let n = 0;
const open = (text: string): DocumentSnapshot => service.update(`test:///${n++}.mmd`, text);

/** The offset of v12's 1-based line and 0-based column. */
const at = (doc: DocumentSnapshot, line: number, column: number) =>
  doc.lines().offset(line - 1, column);

/** The 1-based first and last line of AST node `id`. */
function lines(doc: DocumentSnapshot, id: AstId): [number, number] | undefined {
  const r = doc.rangeOf(id);
  if (!r) return undefined;
  const l = doc.lines();
  return [l.position(r.start).line + 1, l.position(r.end).line + 1];
}

/** The 1-based line of the definition of the symbol whose name starts at `name`'s first use. */
function defLine(doc: DocumentSnapshot, name: string): number | undefined {
  const i = doc.text.search(new RegExp(`(?<![\\w-])${name}(?![\\w-])`));
  const d = i < 0 ? undefined : doc.definition(i);
  return d && doc.lines().position(d.start).line + 1;
}

/** The innermost AST id at v12's line and column. */
const hit = (doc: DocumentSnapshot, line: number, column: number) =>
  doc.astAt(at(doc, line, column))[0];

describe('agentflow element positions through the service (v12 mappings, D465)', () => {
  it('vertex positions: a labelled vertex, inline shapes', () => {
    const doc = open('agentflow-beta TB\n  a["Alpha"]\n  b --> a');
    expect(defLine(doc, 'a')).toBe(2);
    expect(lines(doc, 'n:a')).toEqual([2, 2]);
    const shapes = open('agentflow-beta TB\n  a["sq"]\n  c{"diamond"}\n  d[/"trap"/]\n  f --> a');
    for (const [id, line] of [
      ['a', 2],
      ['c', 3],
      ['d', 4],
    ] as const) {
      expect(lines(shapes, `n:${id}`), id).toEqual([line, line]);
    }
  });

  it('edge positions: one per edge statement, on its line', () => {
    const doc = open('agentflow-beta TB\n  a --> b');
    expect(lines(doc, 'e:a>b')).toEqual([2, 2]);
    const three = open('agentflow-beta TB\n  a --> b\n  b --> c\n  c --> d');
    const edges = [2, 3, 4].map((line) => hit(three, line, 5));
    expect(edges).toEqual(['e:a>b', 'e:b>c', 'e:c>d']);
  });

  it('container positions: a flow spans its keyword to its `end`, nested ones too', () => {
    const doc = open('agentflow-beta TB\n  flow pipeline["Pipeline"]\n    a --> b\n  end');
    expect(lines(doc, 's:pipeline')).toEqual([2, 4]);
    expect(doc.foldingRanges().find((f) => f.kind === 'flow')?.range).toEqual(
      doc.rangeOf('s:pipeline')
    );
    const nested = open(
      'agentflow-beta TB\n  flow outer["Outer"]\n    flow inner["Inner"]\n      n1 --> n2\n    end\n  end'
    );
    expect(lines(nested, 's:outer')).toEqual([2, 6]);
    expect(lines(nested, 's:inner')).toEqual([3, 5]);
  });

  it('front matter: positions are in the source, front matter lines included', () => {
    const doc = open('---\ntitle: T\n---\nagentflow-beta TB\n  a --> b');
    expect(defLine(doc, 'a')).toBe(5);
    expect(lines(doc, 'n:a')).toEqual([5, 5]);
  });

  it('elements on a line, and the innermost at a point', () => {
    const doc = open('agentflow-beta TB\n  a --> b\n  c --> d');
    const line2 = new Set([2, 3, 4, 5, 6, 7, 8, 9].flatMap((c) => doc.astAt(at(doc, 2, c))));
    expect(line2).toEqual(new Set(['n:a', 'e:a>b', 'chain:1', 'n:b']));
    const flow = open('agentflow-beta TB\n  flow pipeline["Pipeline"]\n    inner --> next\n  end');
    expect(hit(flow, 3, 4)).toBe('n:inner');
  });

  it('innermost-match ranking: the tighter span wins, past 1,000 columns too (agentflow-subgraph-span)', () => {
    const doc = open(
      'agentflow-beta TB\n  flow outer["Outer"]\n    flow inner["Inner"]\n      a["Alpha"]\n    end\n  end'
    );
    expect(hit(doc, 4, 8)).toBe('n:a');
    expect(hit(doc, 3, 5)).toBe('s:inner');
    const wide = 'W'.repeat(1200);
    const long = open(
      `agentflow-beta TB\n  flow outer["Outer"]\n    a["${wide}"] --> b["B"]\n  end`
    );
    expect(hit(long, 3, 10)).toBe('n:a');
    expect(hit(long, 3, 1216)).toBe('n:b');
  });

  it('attachments: a later `id@{ … }` is its own mention of the element (agentflow-attachment-mapping)', () => {
    const task = open(
      'agentflow-beta TB\n\nflow demo\n  helper["Helper"]\nend\n\nhelper@{ instruction: "Answer precisely." }'
    );
    expect(lines(task, 'n:helper')).toEqual([4, 4]);
    expect(hit(task, 7, 0)).toBe('n:helper@2');
    expect(lines(task, 'n:helper@2')).toEqual([7, 7]);
    expect(defLine(task, 'helper')).toBe(4);

    const flow = open(
      'agentflow-beta TB\n  flow pipeline["Pipeline"]\n    a --> b\n  end\n  pipeline@{ view: "collapsed" }'
    );
    expect(hit(flow, 5, 4)).toMatch(/^n:pipeline/);
    expect(defLine(flow, 'pipeline')).toBe(2);

    const connector = open(
      'agentflow-beta TB\n  connector github["GitHub"]\n  github@{ protocol: "mcp", transport: "stdio" }'
    );
    expect(defLine(connector, 'github')).toBe(2);
    expect(hit(connector, 3, 4)).toMatch(/^n:github/);

    const edge = open(
      'agentflow-beta TB\n  a["A"]\n  b["B"]\n  a e1@--> b\n  e1@{ instruction: "hand off" }'
    );
    expect(edge.definition(at(edge, 5, 2))).toEqual({
      start: at(edge, 4, 4),
      end: at(edge, 4, 6),
    });

    const block = open(
      'agentflow-beta TB\n  a["Alpha"]\n  a@{\n    instruction: "do the thing"\n  }'
    );
    expect(hit(block, 4, 8)).toBe('n:a@2');
    expect(lines(block, 'n:a@2')).toEqual([3, 5]);
  });

  it('inline metadata: `id["…"]@{ … }` spans its block (agentflow-inline-metadata-mapping)', () => {
    const inFlow = open(
      'agentflow-beta TB\n  flow f["F"]\n    a["Alpha"]@{\n      instruction: "do the thing"\n    }\n  end'
    );
    expect(lines(inFlow, 'n:a')).toEqual([3, 5]);
    expect(hit(inFlow, 4, 8)).toBe('n:a');
    const target = open('agentflow-beta TB\n  x --> b["Beta"]@{\n    instruction: "hand off"\n  }');
    expect(lines(target, 'n:b')).toEqual([2, 4]);
    expect(hit(target, 3, 6)).toBe('n:b');
    const oneLine = open('agentflow-beta TB\n  a["A"]\n  b["B"]@{ shape: rect }\n  a --> b');
    expect(lines(oneLine, 'n:b')).toEqual([3, 3]);
    const plain = open('agentflow-beta TB\n  a["Alpha"]\n  a --> b');
    expect(lines(plain, 'n:a')).toEqual([2, 2]);
  });

  it('a blank line after `@{ … }` shifts nothing (agentflow-blank-line-fold)', () => {
    const one = open('agentflow-beta\nflow f["F"]\n  a["A"]@{ shape: rounded }\n\n  b["B"]\nend');
    expect(lines(one, 'n:b')).toEqual([5, 5]);
    const two = open('agentflow-beta\nflow f["F"]\n  a["A"]@{ shape: rounded }\n\n\n  b["B"]\nend');
    expect(lines(two, 'n:b')).toEqual([6, 6]);
    const comment = open(
      'agentflow-beta\nflow f["F"]\n  a["A"]@{ shape: rounded }\n  %% a note\n  b["B"]\nend'
    );
    expect(lines(comment, 'n:b')).toEqual([5, 5]);
    const edge = open('agentflow-beta TB\n  a["A"]@{ shape: rounded }\n\n  c["C"]\n  a --> c');
    expect(lines(edge, 'e:a>c')).toEqual([5, 5]);
    const padded = open('agentflow-beta TB\n  a["A"]@{ shape: rounded }   \n\n  b["B"]');
    // (v12 reads `rounded` as unsupported: one warning, no error.)
    expect(padded.diagnostics().map((d) => d.code)).toEqual(['SHAPE_UNSUPPORTED']);
    expect(lines(padded, 'n:b')).toEqual([4, 4]);
    // The fold of a flow ends at its own `end`, never past a blank line after a block.
    expect(one.foldingRanges().map((f) => [f.kind, lines(one, 's:f')])).toEqual([['flow', [2, 6]]]);
  });
});
