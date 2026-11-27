/**
 * Railroad special sequences by the label rule (spec #1368, #1407), through
 * `createMermaid().render()`, over `pr-check/label-syntax*.mmd`. Terminals are grammar tokens
 * and stay as written in both modes (D710).
 */
import { expect, it } from 'vitest';
import { fixture, labelSyntaxSuite, renderLabels } from '../label-syntax.ts';

labelSyntaxSuite({
  folder: 'railroad',
  section: 'railroad',
  kinds: ['special'],
  wrap: (label) => `? ${label} ?`,
  quoted: 'railroad-ebnf-beta\nr = "**t**" , ? "`special **bold**`" ? ;\n',
});

it('draws railroad terminals as written with markdownAlwaysOn (D710)', async () => {
  const { flat } = await renderLabels(fixture('railroad/pr-check/label-syntax-compat.mmd'));
  expect(flat).toEqual(expect.arrayContaining(['**t**', '`t`', '&lt;b&gt;t&lt;/b&gt;']));
});
