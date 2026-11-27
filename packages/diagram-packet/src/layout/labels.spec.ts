/**
 * How the layout reads field labels and the title (D734, #1397): only a quoted markdown string is
 * markdown, a field's marked by the parser and the title's found by the handler. Plain markers,
 * bare backticks and a code span are text; tags draw and a written `\n` breaks. No packet label
 * kind read markdown in v12, so `legacyMarkdown` changes nothing.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { Style, tableMeasurer, type MeasuredLabel } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { parsePacket } from '../parser/index.ts';
import { packet as plugin } from '../plugin.ts';
import { layoutPacket } from './index.ts';

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

/** Each line of `label` as text, a bold run as `[b:…]` and an italic run as `[i:…]`. */
const shown = (label: MeasuredLabel): string[] =>
  label.lines.map((line) =>
    line
      .map((r) =>
        r.style & Style.Bold ? `[b:${r.text}]` : r.style & Style.Italic ? `[i:${r.text}]` : r.text
      )
      .join('')
  );

/** The first field's label and the title, as {@link shown}. */
function lay(field: string, title: string, legacyMarkdown = false): [string[], string[]] {
  const { model } = parsePacket(`packet\ntitle ${title}\n0-31: ${field}`);
  const layout = layoutPacket(model, {
    config: { packet: {}, legacyMarkdown } as unknown as ResolvedConfig,
    measurer: tableMeasurer,
    theme: createTheme(spec, { diagram: plugin.theme }),
  });
  return [shown(layout.rows[0]!.pieces[0]!.label.text), shown(layout.title!.text)];
}

describe.each([false, true])('packet labels, legacyMarkdown %s', (legacy) => {
  it('reads a quoted markdown string as markdown, without its wrapper', () => {
    expect(lay('"`f **b** _i_`"', '"`t **b** _i_`"', legacy)).toEqual([
      ['f [b:b] [i:i]'],
      ['t [b:b] [i:i]'],
    ]);
    expect(lay("'`f **b**`'", 't', legacy)[0]).toEqual(['f [b:b]']);
  });

  it('draws plain markers, bare backticks and a code span as written', () => {
    expect(lay('"**b** *i*"', '**b** _i_', legacy)).toEqual([['**b** *i*'], ['**b** _i_']]);
    expect(lay('"a `c` b"', '`t **b**`', legacy)).toEqual([['a `c` b'], ['`t **b**`']]);
  });

  it('draws tags and breaks at `<br>` and a written `\\n`', () => {
    expect(lay('"<b>b</b><br>x"', 'one\\ntwo', legacy)).toEqual([
      ['[b:b]', 'x'],
      ['one', 'two'],
    ]);
    expect(lay('"`**a**\\nb`"', 't', legacy)[0]).toEqual(['[b:a]', 'b']);
  });
});
