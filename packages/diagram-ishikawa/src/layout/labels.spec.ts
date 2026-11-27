import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import { Style } from '@mermaid-js/core/text';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import type { Theme } from '@mermaid-js/core/theme';
import { ishikawaTestTheme, ishikawaTestContext, parsedIshikawa } from '../test-context.ts';
import { layoutIshikawa } from './layout.ts';
import type { PlacedLabel } from './types.ts';

// Labels through the label handler (#1368): a line that is wholly a quoted markdown string
// is markdown, in the effect, a cause and a sub-cause at any depth, in both modes; any other line
// is plain (markers and bare backticks as written), or markdown with markdownAlwaysOn; tags draw
// and a written `\n` breaks in both modes.
let theme: Theme;
beforeAll(async () => {
  theme = await ishikawaTestTheme();
});

/** A label's lines: a bold run as `[b:…]`, inline code `[m:…]`, italic `[i:…]`, joined by ` / `. */
const read = (label: PlacedLabel): string =>
  label.text.lines
    .map((runs) =>
      runs
        .map((r) => {
          if (r.style & Style.Bold) return `[b:${r.text}]`;
          if (r.style & Style.Mono) return `[m:${r.text}]`;
          return r.style & Style.Italic ? `[i:${r.text}]` : r.text;
        })
        .join('')
    )
    .join(' / ');

const ON = { markdownAlwaysOn: true } as const;

/**
 * The readings of the effect, a cause, a sub-cause and a sub-sub-cause, all `line`, with `extra`
 * in the config, and the warning codes the layout gave.
 */
function laid(
  line: string,
  extra: Readonly<Record<string, unknown>> = {}
): { drawn: string[]; codes: string[] } {
  const { model } = parsedIshikawa(
    `ishikawa-beta\n  ${line}\n  ${line}\n    ${line}\n      ${line}\n`
  );
  const warnings: Warning[] = [];
  const ctx = ishikawaTestContext(theme, {}, warnings);
  const layout = layoutIshikawa(model, { ...ctx, config: { ...ctx.config, ...extra } });
  const cause = layout.pairs[0]!.causes[0]!;
  const labels = [layout.head!.label, cause.label, ...cause.subCauses.map((s) => s.label)];
  return { drawn: labels.map(read), codes: [...new Set(warnings.map((w) => w.code))] };
}
const kinds = (line: string, extra: Readonly<Record<string, unknown>> = {}): string[] =>
  laid(line, extra).drawn;

describe('ishikawa layout: labels through the label handler (#1368)', () => {
  it('reads a line that is wholly a quoted markdown string as markdown, in both modes', () => {
    for (const extra of [{}, ON])
      expect(kinds('"`**b** _i_`"', extra)).toEqual(Array(4).fill('[b:b] [i:i]'));
  });

  it('draws plain markers, bare backticks and a code span as written, tags drawn, \\n a break', () => {
    for (const [line, drawn] of [
      ['**b** _i_', '**b** _i_'],
      ['`**b** _i_`', '`**b** _i_`'],
      ['a `code` b', 'a `code` b'],
      ['<b>b</b> <i>i</i><br>next', '[b:b] [i:i] / next'],
      ['one\\ntwo', 'one / two'],
    ] as const)
      expect(kinds(line), line).toEqual(Array(4).fill(drawn));
  });

  it('reads every line as markdown with markdownAlwaysOn; tags and \\n as by default', () => {
    for (const [line, drawn] of [
      ['**b** _i_', '[b:b] [i:i]'],
      ['`**b** _i_`', '[m:**b** _i_]'],
      ['a `code` b', 'a [m:code] b'],
      ['<b>b</b> <i>i</i><br>next', '[b:b] [i:i] / next'],
      ['one\\ntwo', 'one / two'],
    ] as const)
      expect(kinds(line, ON), line).toEqual(Array(4).fill(drawn));
  });

  it('warns MARKDOWN_NOT_READ for plain emphasis only in the default mode', () => {
    expect(laid('**b** _i_').codes).toEqual([MARKDOWN_NOT_READ.code]);
    expect(laid('**b** _i_', ON).codes).toEqual([]);
    expect(laid('"`**b** _i_`"').codes).toEqual([]);
  });
});
