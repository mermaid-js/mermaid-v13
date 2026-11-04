// The seam the ER ASCII suites use (#136): `renderErAscii` draws an ER diagram as text the way
// the API's `format: 'ascii'` path does (#47: resolved config with the `ascii` section, the
// cell profile and measurer, the front-matter title and the AST), through the plugin's
// `./ascii` entry, and hands back the cell layout it drew.
//
// The ER plugin is not in the registry yet (T5, #134). When it is, T5 replaces this with
// `renderAscii` from `render.ts` (the public API, layout captured by a `postLayout` hook) and
// drops `ER_SECTION_DEFAULTS`, which the generated config defaults then supply.
import { cellMeasurer, cellWidth } from '@mermaid-js/core/ascii';
import { CORE_DEFAULTS, resolveConfig, type ResolvedConfig } from '@mermaid-js/core/config';
import { cellProfile } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { layoutEr, parseEr, type ErLayout, type ErWarning } from '@mermaid-js/diagram-er';
import { ascii } from '@mermaid-js/diagram-er/ascii';
import type { AsciiOptions } from './render.ts';

/** v12's `er` section defaults, which T5 generates (GAPS.md #134). */
export const ER_SECTION_DEFAULTS = {
  nodeSpacing: 140,
  rankSpacing: 80,
  minEntityWidth: 100,
} as const;

/** The ER cell layout (with `er`: the views it was built from) and its title. */
export type ErCellLayout = ErLayout & { er: NonNullable<ErLayout['er']>; title?: string };

export interface ErAsciiResult {
  text: string;
  columns: number;
  rows: number;
  warnings: ErWarning[];
  layout: ErCellLayout;
}

let theme: Theme | undefined;

/** `text` drawn as text. Throws when the parse has errors (the API's `MermaidError`). */
export async function renderErAscii(
  text: string,
  options: AsciiOptions = {}
): Promise<ErAsciiResult> {
  const pre = preprocess(text);
  const parse = parseEr(text, { preprocessed: pre });
  const errors = parse.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`parse error: ${errors[0]!.message}`);
  const resolved = resolveConfig(CORE_DEFAULTS, {}, pre.frontMatter?.config, [], {
    er: ER_SECTION_DEFAULTS,
  } as never);
  const section = {
    charset: 'unicode',
    padding: 'compact',
    ...resolved.ascii,
    ...options,
  } as const satisfies AsciiOptions;
  const config = { ...resolved, ascii: section } as ResolvedConfig;
  theme ??= createTheme(await loadTheme('default'), {});
  const warnings: ErWarning[] = [];
  const title = pre.frontMatter?.title;
  const ctx = {
    config,
    measurer: cellMeasurer,
    units: cellProfile(section.padding),
    theme,
    warn: (w: ErWarning) => void warnings.push(w),
    ...(title !== undefined ? { title } : {}),
    ast: parse.ast,
  };
  const layout = layoutEr(parse.model, ctx);
  const out = ascii(parse.model, layout, ctx);
  const lines = out === '' ? [] : out.split('\n');
  return {
    text: out,
    columns: lines.reduce((m, l) => Math.max(m, cellWidth(l)), 0),
    rows: lines.length,
    warnings,
    layout: { ...layout, er: layout.er!, ...(title !== undefined ? { title } : {}) },
  };
}
