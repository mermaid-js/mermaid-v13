import { beforeAll, describe, expect, it } from 'vitest';
import type { DiagramPlugin } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { pxProfile } from '@mermaid-js/core/layout';
import { Style, tableMeasurer, type MeasuredLabel } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { layoutState, parseState, type StateRenderContext, type StateWarning } from '../index.ts';
import { state as diagramPlugin } from '../plugin.ts';

// Label handling (#1368, T2 #1390): every label goes through core's label handler. Markdown is
// read only in a markdown string; a written `\n` breaks every label. With `legacyMarkdown`, the
// four label kinds where v12 read markdown in plain text (state text, descriptions, transitions
// and notes) draw plain `**b**` and `_i_` as emphasis again; a composite title never does.

const { theme: diagramTheme }: Pick<DiagramPlugin, 'theme'> = diagramPlugin;
let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('redux');
});

const LEGACY: ConfigInput = { legacyMarkdown: true };

/** Every label of the layout by what it labels: `node:<id>`, `group:<id>`, `edge:<label>`. */
function labels(src: string, config?: ConfigInput): Map<string, MeasuredLabel> {
  const warnings: StateWarning[] = [];
  const ctx: StateRenderContext = {
    config: resolveConfig(CORE_DEFAULTS, config),
    measurer: tableMeasurer,
    units: pxProfile,
    theme: createTheme(spec, { diagram: diagramTheme }),
    warn: (w) => warnings.push(w),
  };
  const { model } = parseState(src);
  const { state } = layoutState(model, ctx);
  const out = new Map<string, MeasuredLabel>();
  for (const n of state.nodes) {
    out.set(`node:${n.id}`, n.label);
    if (n.rows) out.set(`rows:${n.id}`, n.rows);
  }
  for (const g of state.groups) if (!g.region) out.set(`group:${g.id}`, g.label);
  for (const e of state.edges) if (!e.note) out.set(`edge:${e.source}-${e.target}`, e.label);
  return out;
}

/** A label's lines as text, with `<b>…</b>` around a bold run and `<i>…</i>` around an italic one. */
const shown = (label: MeasuredLabel | undefined): string[] =>
  (label?.lines ?? []).map((line) =>
    line
      .map((r) => {
        let t = r.text;
        if (r.style & Style.Italic) t = `<i>${t}</i>`;
        if (r.style & Style.Bold) t = `<b>${t}</b>`;
        return t;
      })
      .join('')
  );

const SRC = `stateDiagram-v2
state "text **b** _i_" as T
state "\`text **b**\`" as TM
D: desc **b** _i_
DM: "\`desc **b**\`"
DB: \`desc **b**\`
N: one\\ntwo
T --> D: tr **b** _i_
D --> DM: "\`tr **b**\`"
DM --> DB: \`code\`
DB --> N: long line using \\nshould work
note right of T: note **b** _i_
note left of D: "\`note **b**\`"
state "comp **b** _i_" as C {
  X
}
state "\`comp **b**\`" as CM {
  Y
}
state "comp one\\ntwo" as CN {
  Z
}
`;

describe('state labels (#1368): default mode', () => {
  let got: Map<string, MeasuredLabel>;
  beforeAll(() => {
    got = labels(SRC);
  });

  it('draws plain markdown as written in every label kind', () => {
    expect(shown(got.get('node:T'))).toEqual(['text **b** _i_']);
    expect(shown(got.get('node:D'))).toEqual(['desc **b** _i_']);
    expect(shown(got.get('edge:T-D'))).toEqual(['tr **b** _i_']);
    const note = [...got].find(([k]) => k.startsWith('node:note'))?.[1];
    expect(shown(note)).toEqual(['note **b** _i_']);
    expect(shown(got.get('group:C'))).toEqual(['comp **b** _i_']);
  });

  it('reads a markdown string in every label kind', () => {
    expect(shown(got.get('node:TM'))).toEqual(['text <b>b</b>']);
    expect(shown(got.get('node:DM'))).toEqual(['desc <b>b</b>']);
    expect(shown(got.get('edge:D-DM'))).toEqual(['tr <b>b</b>']);
    const notes = [...got].filter(([k]) => k.startsWith('node:note')).map(([, l]) => shown(l));
    expect(notes).toContainEqual(['note <b>b</b>']);
    expect(shown(got.get('group:CM'))).toEqual(['comp <b>b</b>']);
  });

  it('draws bare backticks as written', () => {
    expect(shown(got.get('node:DB'))).toEqual(['`desc **b**`']);
    expect(shown(got.get('edge:DM-DB'))).toEqual(['`code`']);
  });

  it('breaks a label at a written \\n, the composite title too', () => {
    expect(shown(got.get('node:N'))).toEqual(['one', 'two']);
    expect(shown(got.get('edge:DB-N'))).toEqual(['long line using', 'should work']);
    expect(shown(got.get('group:CN'))).toEqual(['comp one', 'two']);
  });

  it('draws the common tags', () => {
    const tags = labels('stateDiagram-v2\nA: a <b>b</b><br>c');
    expect(shown(tags.get('node:A'))).toEqual(['a <b>b</b>', 'c']);
  });
});

describe('state labels (#1368): legacyMarkdown', () => {
  let got: Map<string, MeasuredLabel>;
  beforeAll(() => {
    got = labels(SRC, LEGACY);
  });

  it('draws plain markdown as emphasis in state text, descriptions, transitions and notes', () => {
    expect(shown(got.get('node:T'))).toEqual(['text <b>b</b> <i>i</i>']);
    expect(shown(got.get('node:D'))).toEqual(['desc <b>b</b> <i>i</i>']);
    expect(shown(got.get('edge:T-D'))).toEqual(['tr <b>b</b> <i>i</i>']);
    const note = [...got].find(([k]) => k.startsWith('node:note'))?.[1];
    expect(shown(note)).toEqual(['note <b>b</b> <i>i</i>']);
  });

  it('keeps a composite title plain, as v12 did', () => {
    expect(shown(got.get('group:C'))).toEqual(['comp **b** _i_']);
  });

  it('draws everything else as the default mode does', () => {
    const plain = labels(SRC);
    for (const key of ['node:TM', 'node:DM', 'node:DB', 'node:N', 'edge:DM-DB', 'group:CN'])
      expect([key, shown(got.get(key))]).toEqual([key, shown(plain.get(key))]);
  });
});
