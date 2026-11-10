import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import type { AgentflowStatementNode } from './ast.ts';
import { parseAgentflow } from './parser.ts';

/**
 * The line and column checks of v12's position specs, against v13's ranges (their message and
 * mapping checks are skipped in `v12-specs/`: v13's messages are its own, and v12's element
 * mappings are the language service's symbols and `astAt`, #549). Lines are 1-based, columns
 * 0-based, as v12's `hash.loc` was.
 */
const at = (src: string, offset: number) => {
  const p = new LineIndex(src).position(offset);
  return [p.line + 1, p.column];
};

/** `[line, column]` of the first error's start, and the text it covers. */
const firstError = (src: string) => {
  const d = parseAgentflow(src).diagnostics.find((x) => x.severity === 'error');
  if (!d) throw new Error('no error');
  return [...at(src, d.range.start), src.slice(d.range.start, d.range.end)];
};

describe('YAML errors in @{ } point at the source (v12 agentflow-yaml-error-position)', () => {
  it('single-line block: the source line of the block', () => {
    // v12: line 3, column 30 (js-yaml points past the `*`); v13 covers the `*` itself.
    expect(
      firstError('agentflow-beta TB\n\n  content_ref@{ shape: procs,* type: "BilingualContent" }')
    ).toEqual([3, 29, '*']);
  });

  it('multi-line block: the body line, at the tab', () => {
    // v12: line 6, column 6 (after the tab's caret); v13 covers the tab.
    expect(
      firstError(
        'agentflow-beta\nflow f["F"]\n  a["A"]\n  b["B"]\n  c["C"]@{\n\tshape: rounded\n  }\nend'
      )
    ).toEqual([6, 0, '\t']);
  });

  it('multi-line block: an alias on the `@{` line', () => {
    // v12 stopped at the `*` (line 2, column 15); core's reader reads `*,` as text and stops at
    // the badly indented key on the next line.
    expect(firstError('agentflow-beta TB\n  a["A"]@{ x: *,\n    y: 1 }')).toEqual([3, 4, 'y']);
  });

  it('a block below a @{ } and a blank line keeps its source line', () => {
    expect(
      firstError(
        'agentflow-beta TB\n  a["A"]@{ shape: rounded }\n\n  b["B"]@{ shape: procs,* x: 1 }'
      )
    ).toEqual([4, 24, '*']);
  });

  it('counts the front matter', () => {
    // v12 added the front matter's lines to the block's (setFrontmatterLineOffset); v13's ranges
    // are into the whole source.
    expect(
      firstError(
        '---\ntitle: x\n---\nagentflow-beta TB\n\n  content_ref@{ shape: procs,* type: "x" }'
      )
    ).toEqual([6, 29, '*']);
  });

  it('a shape error points at its block', () => {
    expect(firstError('agentflow-beta TB\n  a["A"]@{ shape: Rounded }')).toEqual([
      2,
      8,
      '@{ shape: Rounded }',
    ]);
  });
});

describe('flow spans (v12 agentflow-subgraph-span, #59)', () => {
  const flows = (src: string) => {
    const out: Record<string, [number, number]> = {};
    const walk = (nodes: readonly AgentflowStatementNode[]) => {
      for (const n of nodes) {
        if (n.type !== 'Flow') continue;
        const f = n;
        out[f.name] = [at(src, f.range.start)[0] ?? 0, at(src, f.range.end)[0] ?? 0];
        walk(f.children);
      }
    };
    walk(parseAgentflow(src).ast.children);
    return out;
  };

  it('two sibling flows do not overlap on the boundary line', () => {
    const src =
      'agentflow-beta TB\n\n  flow f2["F2"]\n    a --> b\n  end\n\n  flow f1["F1"]\n    c --> d\n  end';
    expect(flows(src)).toEqual({ f2: [3, 5], f1: [7, 9] });
  });

  it('a nested inner flow ends at its own `end`, not the parent content', () => {
    const src =
      'agentflow-beta TB\n  flow outer["Outer"]\n    flow inner["Inner"]\n      a --> b\n    end\n    c --> d\n  end';
    expect(flows(src)).toEqual({ outer: [2, 7], inner: [3, 5] });
  });

  it('a flow whose `end` is the last line still parses and spans', () => {
    const src = 'agentflow-beta TB\n  flow f["F"]\n    a --> b\n  end';
    expect(flows(src)).toEqual({ f: [2, 4] });
    expect(parseAgentflow(src).model.vertices.map((v) => v.id)).toEqual(['a', 'b']);
  });
});
