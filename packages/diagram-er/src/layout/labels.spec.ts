// How each ER label kind reads what is written (#1368, D731): Markdown only in a markdown
// string, and plain `**b** _i_` as v12 drew it only with `legacyMarkdown`.
import type { Warning } from '@mermaid-js/core';
import { describe, expect, it } from 'vitest';
import { pxProfile } from '@mermaid-js/core/layout';
import { CORE_DEFAULTS, resolveConfig, type MermaidConfig } from '@mermaid-js/core/config';
import { Style, tableMeasurer, type MeasuredLabel } from '@mermaid-js/core/text';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { parseEr } from '../index.ts';
import { er } from '../plugin.ts';
import { layoutEr, type ErRenderContext } from './layout.ts';
import type { ErPrepared } from './prepare.ts';

const theme = createTheme(await loadTheme('redux'), { diagram: er.theme });
const LEGACY: MermaidConfig = { legacyMarkdown: true };

/** The ER views of `src`, and the warnings the layout gave. */
function prepared(src: string, init?: MermaidConfig): { er: ErPrepared; warnings: Warning[] } {
  const { model, diagnostics } = parseEr(src);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const warnings: Warning[] = [];
  const ctx: ErRenderContext = {
    config: resolveConfig(CORE_DEFAULTS, init),
    measurer: tableMeasurer,
    units: pxProfile,
    theme,
    warn: (w) => void warnings.push(w),
  };
  return { er: layoutEr(model, ctx).er!, warnings };
}

/** Each line of `label` as its runs, a bold run in `<B>`, an italic one in `<I>`. */
const drawn = (label: MeasuredLabel): string[] =>
  label.lines.map((line) =>
    line
      .map((r) => {
        let t = r.text;
        if (r.style & Style.Italic) t = `<I>${t}</I>`;
        if (r.style & Style.Bold) t = `<B>${t}</B>`;
        return t;
      })
      .join('')
  );

/** One diagram with every label kind written as `form(kind)`. */
const every = (form: (kind: string) => string): string =>
  [
    'erDiagram',
    `  E[${form('alias')}] {`,
    `    string name ${form('comment')}`,
    '  }',
    `  E ||--o{ F : ${form('relationship')}`,
    `  ${form('entity')} ||--o{ E : x`,
    `  subgraph S[${form('subgraph')}]`,
    '    F',
    '  end',
  ].join('\n');

/** The drawn lines of every label kind in `src`, by kind. */
function kinds(src: string, init?: MermaidConfig): Record<string, string[]> {
  const { er: view } = prepared(src, init);
  const entity = (name: string) => view.entities.find((e) => e.entity.name === name)!;
  const e = entity('E');
  const named = view.entities.find((x) => !['E', 'F'].includes(x.entity.name))!;
  return {
    alias: drawn(e.label),
    comment: drawn(e.rows[0]!.cells[3]),
    relationship: drawn(view.edges.find((x) => x.relationship.to.name === 'F')!.label),
    entity: drawn(named.label),
    subgraph: drawn(view.groups[0]!.label),
  };
}

const KINDS = ['alias', 'comment', 'relationship', 'entity', 'subgraph'] as const;
const each = (f: (kind: string) => string[]) =>
  Object.fromEntries(KINDS.map((k) => [k, f(k)])) as Record<string, string[]>;

describe('ER labels in the default mode', () => {
  it('draws plain **b** _i_ as written, in every label kind', () => {
    expect(kinds(every((k) => `"${k} **b** _i_"`))).toEqual(each((k) => [`${k} **b** _i_`]));
  });

  it('reads a markdown string as markdown, without its backticks, in every label kind', () => {
    expect(kinds(every((k) => `"\`${k} **b** _i_\`"`))).toEqual(
      each((k) => [`${k} <B>b</B> <I>i</I>`])
    );
  });

  it('draws a code span in a plain label as written', () => {
    expect(kinds(every((k) => `"${k} a \`code\` b"`))).toEqual(each((k) => [`${k} a \`code\` b`]));
  });

  it('draws the tags in every label kind', () => {
    expect(kinds(every((k) => `"${k} <b>b</b><br>H<sub>2</sub>O"`))).toEqual(
      each((k) => [`${k} <B>b</B>`, 'H2O'])
    );
  });

  it('breaks a comment and a relationship label at a written \\n', () => {
    // A `\n` in an entity name, an alias or a subgraph title is a parse error, as in v12.
    const { er: view } = prepared(
      'erDiagram\n  E {\n    string n "c one\\ntwo"\n  }\n  E ||--o{ F : "r one\\ntwo"\n'
    );
    expect(drawn(view.entities[0]!.rows[0]!.cells[3])).toEqual(['c one', 'two']);
    expect(drawn(view.edges[0]!.label)).toEqual(['r one', 'two']);
  });

  it('keeps an attribute name written in backticks as it was', () => {
    const { er: view } = prepared('erDiagram\n  E {\n    string `first name`\n  }\n');
    expect(drawn(view.entities[0]!.rows[0]!.cells[1])).toEqual(['first name']);
  });

  it('warns once that plain markdown is drawn as written, however many labels hold it', () => {
    const { warnings } = prepared(every((k) => `"${k} **b** _i_"`));
    // No `inline` in this context: each label warns, the API gives the warning once.
    expect(new Set(warnings.map((w) => w.code))).toEqual(new Set([MARKDOWN_NOT_READ.code]));
  });

  it('gives no warning for markdown strings', () => {
    expect(prepared(every((k) => `"\`${k} **b** _i_\`"`)).warnings).toEqual([]);
  });
});

describe('ER labels with legacyMarkdown', () => {
  it('draws plain **b** _i_ as emphasis, as v12 did, in every label kind', () => {
    expect(
      kinds(
        every((k) => `"${k} **b** _i_"`),
        LEGACY
      )
    ).toEqual(each((k) => [`${k} <B>b</B> <I>i</I>`]));
  });

  it('reads everything else as the default mode does', () => {
    for (const form of [
      (k: string) => `"\`${k} **b** _i_\`"`,
      (k: string) => `"${k} a \`code\` b"`,
      (k: string) => `"${k} <b>b</b><br>H<sub>2</sub>O"`,
    ]) {
      expect(kinds(every(form), LEGACY)).toEqual(kinds(every(form)));
    }
  });

  it('gives no warning', () => {
    expect(
      prepared(
        every((k) => `"${k} **b** _i_"`),
        LEGACY
      ).warnings
    ).toEqual([]);
  });
});
