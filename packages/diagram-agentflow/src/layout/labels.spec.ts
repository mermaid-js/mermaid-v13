// How agentflow reads its labels (spec #1368, #1396): flow titles, vertex and connector texts
// and edge texts all go through core's label handler. By default markdown is read only in a
// quoted markdown string; bare backticks, plain `**x**` and a code span are drawn as written;
// tags draw; a written `\n` breaks the line in every label. With `markdownAlwaysOn` every label
// is markdown; tags and `\n` read as in the default mode.
import { describe, expect, it } from 'vitest';
import { Style, type MeasuredLabel } from '@mermaid-js/core/text';
import { renderAgentflowForTest } from '../render/harness.ts';
import type { AgentflowPrepared } from './prepare.ts';

async function prepared(
  src: string,
  config: Readonly<Record<string, unknown>> = {}
): Promise<AgentflowPrepared> {
  return (await renderAgentflowForTest(src, { config })).layout.agentflow;
}

/** A label's lines as text: a bold run as `[b:…]`, an italic one `[i:…]`, code `[c:…]`. */
const shown = (label: MeasuredLabel): string[] =>
  label.lines.map((line) =>
    line
      .map((r) => {
        if (r.style & Style.Bold) return `[b:${r.text}]`;
        if (r.style & Style.Italic) return `[i:${r.text}]`;
        return r.style & Style.Mono ? `[c:${r.text}]` : r.text;
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
const inGlobal = (statement: string) => `${HEAD}  global\n    ${statement}\n  end`;

/**
 * Every label kind, written several of the six ways, and the line rules: the lines by default,
 * and with `markdownAlwaysOn` when they differ.
 */
const CASES: readonly (readonly [string, string, Read, string[], string[]?])[] = [
  ['plain node', `${HEAD}  a[node **b** _i_]`, node('a'), ['node **b** _i_'], ['node [b:b] [i:i]']],
  ['md string node', `${HEAD}  a["\`node **b** _i_\`"]`, node('a'), ['node [b:b] [i:i]']],
  ['bare backticks node', `${HEAD}  a[\`**b**\`]`, node('a'), ['`**b**`'], ['[c:**b**]']],
  ['code span node', `${HEAD}  a[a \`code\` b]`, node('a'), ['a `code` b'], ['a [c:code] b']],
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
  ['plain edge', `${HEAD}  a -->|e **b** _i_| b`, edge, ['e **b** _i_'], ['e [b:b] [i:i]']],
  [
    'plain inline edge',
    `${HEAD}  a -- e **b** _i_ --> b`,
    edge,
    ['e **b** _i_'],
    ['e [b:b] [i:i]'],
  ],
  ['md string edge', `${HEAD}  a -->|"\`**e**\`"| b`, edge, ['[b:e]']],
  ['inline md string edge', `${HEAD}  a -- "\`**e**\`" --> b`, edge, ['[b:e]']],
  ['bare backticks edge', `${HEAD}  a -->|\`**e**\`| b`, edge, ['`**e**`'], ['[c:**e**]']],
  ['written \\n in a md string edge', `${HEAD}  a -->|"\`one\\ntwo\`"| b`, edge, ['one', 'two']],
  [
    'plain flow title',
    inFlow('flow **b** _i_'),
    flow('f'),
    ['flow **b** _i_'],
    ['flow [b:b] [i:i]'],
  ],
  ['md string flow title', inFlow('"`**t**`"'), flow('f'), ['[b:t]']],
  ['bare backticks flow title', inFlow('`**t**`'), flow('f'), ['`**t**`'], ['[c:**t**]']],
  ['written \\n flow title', inFlow('one\\ntwo'), flow('f'), ['one', 'two']],
  [
    'plain connector',
    `${HEAD}  connector c[c **b** _i_]`,
    node('c'),
    ['c **b** _i_'],
    ['c [b:b] [i:i]'],
  ],
  ['md string connector', `${HEAD}  connector c["\`**c**\`"]`, node('c'), ['[b:c]']],
  [
    'bare backticks connector',
    `${HEAD}  connector c[\`**c**\`]`,
    node('c'),
    ['`**c**`'],
    ['[c:**c**]'],
  ],
  ['written \\n connector', `${HEAD}  connector c[one\\ntwo]`, node('c'), ['one', 'two']],
  ['plain global node', inGlobal('g[g **b** _i_]'), node('g'), ['g **b** _i_'], ['g [b:b] [i:i]']],
  ['md string global node', inGlobal('g["`**g**`"]'), node('g'), ['[b:g]']],
  ['bare backticks global node', inGlobal('g[`**g**`]'), node('g'), ['`**g**`'], ['[c:**g**]']],
];

/** Each case with its `markdownAlwaysOn` lines filled in. */
const FULL = CASES.map(
  ([name, src, read, lines, on = lines]) => [name, src, read, lines, on] as const
);

describe('agentflow labels through the core label handler (#1368, #1396)', () => {
  it.each(FULL)('%s', async (_, src, read, lines) => {
    expect(read(await prepared(src))).toEqual(lines);
  });

  it.each(FULL)('%s, with markdownAlwaysOn', async (_, src, read, _lines, on) => {
    expect(read(await prepared(src, { markdownAlwaysOn: true }))).toEqual(on);
  });

  it.each(FULL)('%s, with agentflow.markdownAlwaysOn', async (_, src, read, _lines, on) => {
    expect(read(await prepared(src, { agentflow: { markdownAlwaysOn: true } }))).toEqual(on);
  });
});
