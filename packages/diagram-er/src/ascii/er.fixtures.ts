// Test helper: renders an ER diagram to text through the `./ascii` entry, as a pipeline does
// (parse → cell layout → `ascii` hook), with the table measurer in the context.
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { CORE_DEFAULTS, resolveConfig, type ResolvedConfig } from '@mermaid-js/core/config';
import { cellProfile } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { ascii, type ErAsciiContext } from '../ascii.ts';
import { parseEr } from '../parser/index.ts';
import { layoutEr, type ErLayout, type ErWarning } from '../layout/layout.ts';

export interface Drawn {
  text: string;
  warnings: ErWarning[];
  layout: ErLayout;
}

export interface DrawOptions {
  charset?: 'unicode' | 'ascii';
  padding?: 'compact' | 'roomy';
  maxWidth?: number;
  /** Lay out in px first: the hook must redo the layout in cells. */
  px?: boolean;
  /** Changes the cell layout before the hook draws it (to stage what repair cannot free). */
  tweak?: (layout: ErLayout) => void;
}

/**
 * The `er` section defaults T5 generates (v12's, GAPS.md #134): the API hands them to the hook
 * once the manifest is in, so the drawings here are drawn with them already.
 */
export const ER_DEFAULTS = { nodeSpacing: 140, rankSpacing: 80, minEntityWidth: 100 } as const;

let theme: Theme | undefined;

/** `src` as text. The `ascii` options go in as the config section the API hands the hook. */
export async function draw(src: string, options: DrawOptions = {}): Promise<Drawn> {
  const pre = preprocess(src);
  const resolved = resolveConfig(CORE_DEFAULTS, {}, pre.frontMatter?.config, [], {
    er: ER_DEFAULTS,
  } as never);
  const { px, tweak, ...section } = options;
  const config = {
    ...resolved,
    ascii: { ...(resolved as { ascii?: object }).ascii, ...section },
  } as unknown as ResolvedConfig;
  const parse = parseEr(src, { preprocessed: pre });
  const warnings: ErWarning[] = [];
  theme ??= createTheme(await loadTheme('default'), {});
  const units = cellProfile(config.ascii?.padding);
  const ctx: ErAsciiContext = {
    config,
    measurer: px ? tableMeasurer : cellMeasurer,
    ...(px ? {} : { units }),
    theme,
    warn: (w) => void warnings.push(w),
    title: pre.frontMatter?.title,
    ast: parse.ast,
  };
  const layout = layoutEr(parse.model, ctx);
  tweak?.(layout);
  return { text: ascii(parse.model, layout, ctx), warnings, layout };
}

/** Draws and returns the text alone. */
export const text = async (src: string, options?: DrawOptions): Promise<string> =>
  (await draw(src, options)).text;
