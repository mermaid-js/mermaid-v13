/**
 * How the layout reads field labels and the title (#1368, #1397). In the default mode only a
 * quoted markdown string is markdown, a field's marked by the parser and the title's found by the
 * handler; plain markers, bare backticks and a code span are text, and a plain label with an
 * emphasis pair warns `MARKDOWN_NOT_READ`. With `markdownAlwaysOn` every label is markdown. Tags
 * draw and a written `\n` breaks in both modes.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { Style, tableMeasurer, type MeasuredLabel } from '@mermaid-js/core/text';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { parsePacket } from '../parser/index.ts';
import { packet as plugin } from '../plugin.ts';
import { layoutPacket } from './index.ts';

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

/** Each line of `label` as text, a bold run as `[b:…]`, an italic run as `[i:…]`, code as `[c:…]`. */
const shown = (label: MeasuredLabel): string[] =>
  label.lines.map((line) =>
    line
      .map((r) =>
        r.style & Style.Bold
          ? `[b:${r.text}]`
          : r.style & Style.Italic
            ? `[i:${r.text}]`
            : r.style & Style.Mono
              ? `[c:${r.text}]`
              : r.text
      )
      .join('')
  );

interface Laid {
  readonly field: string[];
  readonly title: string[];
  readonly warnings: string[];
}

/** The first field's label and the title, as {@link shown}, and the warning codes. */
function lay(field: string, title: string, alwaysOn = false): Laid {
  const { model } = parsePacket(`packet\ntitle ${title}\n0-31: ${field}`);
  const warnings: Warning[] = [];
  const layout = layoutPacket(model, {
    // The resolved config carries the effective top-level value (core folds `packet.…` in).
    config: { packet: {}, markdownAlwaysOn: alwaysOn } as unknown as ResolvedConfig,
    measurer: tableMeasurer,
    theme: createTheme(spec, { diagram: plugin.theme }),
    warn: (w) => warnings.push(w),
  });
  return {
    field: shown(layout.rows[0]!.pieces[0]!.label.text),
    title: shown(layout.title!.text),
    warnings: [...new Set(warnings.map((w) => w.code))],
  };
}

describe.each([false, true])('packet labels, markdownAlwaysOn %s', (on) => {
  it('reads a quoted markdown string as markdown, without its wrapper', () => {
    expect(lay('"`f **b** _i_`"', '"`t **b** _i_`"', on)).toEqual({
      field: ['f [b:b] [i:i]'],
      title: ['t [b:b] [i:i]'],
      warnings: [],
    });
    expect(lay("'`f **b**`'", 't', on).field).toEqual(['f [b:b]']);
  });

  it('draws tags and breaks at `<br>` and a written `\\n`', () => {
    const l = lay('"<b>b</b><br>x"', 'one\\ntwo', on);
    expect([l.field, l.title]).toEqual([
      ['[b:b]', 'x'],
      ['one', 'two'],
    ]);
    expect(lay('"`**a**\\nb`"', 't', on).field).toEqual(['[b:a]', 'b']);
  });
});

describe('packet labels, default mode', () => {
  it('draws plain markers, bare backticks and a code span as written, and warns once', () => {
    expect(lay('"**b** *i*"', '**b** _i_')).toEqual({
      field: ['**b** *i*'],
      title: ['**b** _i_'],
      warnings: [MARKDOWN_NOT_READ.code],
    });
    expect(lay('"a `c` b"', '`t **b**`')).toMatchObject({
      field: ['a `c` b'],
      title: ['`t **b**`'],
    });
  });
});

describe('packet labels, markdownAlwaysOn', () => {
  it('reads every label as markdown, plain markers and code spans included, with no warning', () => {
    expect(lay('"**b** *i*"', '**b** _i_', true)).toEqual({
      field: ['[b:b] [i:i]'],
      title: ['[b:b] [i:i]'],
      warnings: [],
    });
    expect(lay('"a `c` b"', 'x', true).field).toEqual(['a [c:c] b']);
  });
});
