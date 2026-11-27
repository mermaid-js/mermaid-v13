// How agentflow reads its labels (spec #1368 T8, #1396): flow titles, vertex and connector texts
// and edge texts all go through core's label handler, with no v12 markdown profile. Markdown is
// read only in a quoted markdown string; bare backticks, plain `**x**` and a code span are drawn
// as written; tags draw; a written `\n` breaks the line in every label.
import { describe, expect, it } from 'vitest';
import { Style, type MeasuredLabel } from '@mermaid-js/core/text';
import { renderAgentflowForTest } from '../render/harness.ts';
import type { AgentflowPrepared } from './prepare.ts';

async function prepared(src: string, legacyMarkdown = false): Promise<AgentflowPrepared> {
  const config = legacyMarkdown ? { legacyMarkdown } : {};
  return (await renderAgentflowForTest(src, { config })).layout.agentflow;
}

/** A label's lines as text, a bold run as `[b:…]` and an italic one as `[i:…]`. */
const shown = (label: MeasuredLabel): string[] =>
  label.lines.map((line) =>
    line
      .map((r) => {
        if (r.style & Style.Bold) return `[b:${r.text}]`;
        return r.style & Style.Italic ? `[i:${r.text}]` : r.text;
      })
      .join('')
  );

type Read = (p: AgentflowPrepared) => string[];
const node =
  (id: string): Read =>
  (p) =>
    shown(p.views.get(id)!.label);
const flow =
  (id: string): Read =>
  (p) =>
    shown(p.groups.find((g) => g.id === id)!.label);
const edge: Read = (p) => shown(p.edges[0]!.label);

const HEAD = 'agentflow-beta LR\n';
const inFlow = (title: string, body = 'a') => `${HEAD}  flow f[${title}]\n    ${body}\n  end`;

/** Every label kind, each written one of the six ways, and the line rules. */
const CASES: readonly (readonly [string, string, Read, string[]])[] = [
  ['plain node', `${HEAD}  a[node **b** _i_]`, node('a'), ['node **b** _i_']],
  ['md string node', `${HEAD}  a["\`node **b** _i_\`"]`, node('a'), ['node [b:b] [i:i]']],
  ['bare backticks node', `${HEAD}  a[\`**b**\`]`, node('a'), ['`**b**`']],
  ['code span node', `${HEAD}  a[a \`code\` b]`, node('a'), ['a `code` b']],
  [
    'tags node',
    `${HEAD}  a[<b>b</b> <i>i</i><br>H<sub>2</sub>O]`,
    node('a'),
    ['[b:b] [i:i]', 'H2O'],
  ],
  ['written \\n node', `${HEAD}  a[one\\ntwo]`, node('a'), ['one', 'two']],
  [
    'written \\n in a md string node',
    `${HEAD}  a["\`**one**\\ntwo\`"]`,
    node('a'),
    ['[b:one]', 'two'],
  ],
  ['trailing <br> node', `${HEAD}  a[one<br>]`, node('a'), ['one']],
  ['plain edge', `${HEAD}  a -->|e **b**| b`, edge, ['e **b**']],
  ['md string edge', `${HEAD}  a -->|"\`**e**\`"| b`, edge, ['[b:e]']],
  ['inline md string edge', `${HEAD}  a -- "\`**e**\`" --> b`, edge, ['[b:e]']],
  ['bare backticks edge', `${HEAD}  a -->|\`**e**\`| b`, edge, ['`**e**`']],
  ['written \\n in a md string edge', `${HEAD}  a -->|"\`one\\ntwo\`"| b`, edge, ['one', 'two']],
  ['plain flow title', inFlow('flow **b**'), flow('f'), ['flow **b**']],
  ['md string flow title', inFlow('"`**t**`"'), flow('f'), ['[b:t]']],
  ['bare backticks flow title', inFlow('`**t**`'), flow('f'), ['`**t**`']],
  ['written \\n flow title', inFlow('one\\ntwo'), flow('f'), ['one', 'two']],
  ['plain connector', `${HEAD}  connector c[c **b**]`, node('c'), ['c **b**']],
  ['md string connector', `${HEAD}  connector c["\`**c**\`"]`, node('c'), ['[b:c]']],
  ['bare backticks connector', `${HEAD}  connector c[\`**c**\`]`, node('c'), ['`**c**`']],
  ['written \\n connector', `${HEAD}  connector c[one\\ntwo]`, node('c'), ['one', 'two']],
  ['md string global node', `${HEAD}  global\n    g["\`**g**\`"]\n  end`, node('g'), ['[b:g]']],
  [
    'bare backticks global node',
    `${HEAD}  global\n    g[\`**g**\`]\n  end`,
    node('g'),
    ['`**g**`'],
  ],
];

describe('agentflow labels through the core label handler (#1368 T8)', () => {
  it.each(CASES)('%s', async (_, src, read, lines) => {
    expect(read(await prepared(src))).toEqual(lines);
  });

  // No agentflow label kind has a v12 markdown profile: v12 read markdown only in a markdown
  // string, so `legacyMarkdown` changes nothing.
  it.each(CASES)('%s, with legacyMarkdown', async (_, src, read, lines) => {
    expect(read(await prepared(src, true))).toEqual(lines);
  });
});
