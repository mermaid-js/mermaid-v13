import { beforeAll, describe, expect, it } from 'vitest';
import { Style } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { ishikawaTestTheme, ishikawaTestContext, parsedIshikawa } from '../test-context.ts';
import { layoutIshikawa } from './layout.ts';
import type { PlacedLabel } from './types.ts';

// Labels through the label handler (#1368): a line that is wholly a quoted markdown string
// is markdown, in the effect, a cause and a sub-cause at any depth, in both modes; any other line
// is plain (markers and bare backticks as written), its tags drawn and a written `\n` a break.
let theme: Theme;
beforeAll(async () => {
  theme = await ishikawaTestTheme();
});

/** A label's lines, a bold run as `[b:…]` and an italic run as `[i:…]`, lines joined by ` / `. */
const read = (label: PlacedLabel): string =>
  label.text.lines
    .map((runs) =>
      runs
        .map((r) => {
          if (r.style & Style.Bold) return `[b:${r.text}]`;
          return r.style & Style.Italic ? `[i:${r.text}]` : r.text;
        })
        .join('')
    )
    .join(' / ');

const MODES = [{}, { legacyMarkdown: true }] as const;

/** Each mode's readings of the effect, a cause, a sub-cause and a sub-sub-cause, all `line`. */
function kinds(line: string): string[][] {
  const { model } = parsedIshikawa(
    `ishikawa-beta\n  ${line}\n  ${line}\n    ${line}\n      ${line}\n`
  );
  return MODES.map((extra) => {
    const ctx = ishikawaTestContext(theme);
    const layout = layoutIshikawa(model, { ...ctx, config: { ...ctx.config, ...extra } });
    const cause = layout.pairs[0]!.causes[0]!;
    return [layout.head!.label, cause.label, ...cause.subCauses.map((s) => s.label)].map(read);
  });
}

describe('ishikawa layout: labels through the label handler (#1368)', () => {
  it('reads a line that is wholly a quoted markdown string as markdown', () => {
    for (const mode of kinds('"`**b** _i_`"')) expect(mode).toEqual(Array(4).fill('[b:b] [i:i]'));
  });

  it('draws plain markers, bare backticks and a code span as written, tags drawn, \\n a break', () => {
    for (const [line, drawn] of [
      ['**b** _i_', '**b** _i_'],
      ['`**b** _i_`', '`**b** _i_`'],
      ['a `code` b', 'a `code` b'],
      ['<b>b</b> <i>i</i><br>next', '[b:b] [i:i] / next'],
      ['one\\ntwo', 'one / two'],
    ] as const) {
      for (const mode of kinds(line)) expect(mode, line).toEqual(Array(4).fill(drawn));
    }
  });
});
