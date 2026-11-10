// Test helper: renders a usecase source to text through the `./ascii` entry, as the pipeline
// does (parse → layout with the cell measurer and profile → `ascii` hook), with the tests' one
// context builder (`../test-context.ts`): the resolved config with the generated `usecase`
// defaults and the `ascii` section, the theme, and the warnings collected.
import type { TextRenderContext, Warning } from '@mermaid-js/core';
import { asciiOptions, cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { ascii } from '../ascii.ts';
import { usecaseConfigDefaults } from '../generated/config-defaults.ts';
import { layoutUsecase, type UsecaseLayout } from '../layout/layout.ts';
import { parseUsecase } from '../parser/index.ts';
import { usecaseRenderContext, usecaseTestConfig, usecaseTestTheme } from '../test-context.ts';

export interface Drawn {
  readonly text: string;
  readonly warnings: Warning[];
  readonly layout: UsecaseLayout;
}

export interface DrawOptions {
  readonly charset?: 'unicode' | 'ascii';
  readonly padding?: 'compact' | 'roomy';
  readonly maxWidth?: number;
  /** Integrator config, as `initialize()` would get it. */
  readonly config?: Readonly<Record<string, unknown>>;
  /** Lay out in px first: the hook must redo the layout in cells. */
  readonly px?: boolean;
}

/** Draws `source` as text; throws on a parse error. */
export async function draw(source: string, options: DrawOptions = {}): Promise<Drawn> {
  const pre = preprocess(source);
  const parsed = parseUsecase(source, { preprocessed: pre });
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`usecase parse error: ${errors[0]!.message}`);
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const { config: given = {}, charset, padding, maxWidth } = options;
  const section = (given.usecase ?? {}) as Readonly<Record<string, unknown>>;
  const resolved = usecaseTestConfig(pre, {
    ...given,
    usecase: { ...usecaseConfigDefaults, ...section },
  });
  const opts = asciiOptions(resolved, { charset, padding, maxWidth });
  const config = Object.freeze({
    ...resolved,
    ascii: Object.freeze({
      charset: opts.charset,
      padding: opts.padding,
      ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
    }),
  });
  const theme = await usecaseTestTheme(config);
  const base = usecaseRenderContext(config, theme, { measurer: cellMeasurer, warn });
  const title = pre.frontMatter?.title;
  const ctx: TextRenderContext = {
    ...base,
    units: options.px ? base.units : cellProfile(opts.padding),
    ...(title !== undefined ? { title } : {}),
    ast: parsed.ast,
  };
  const layout = layoutUsecase(parsed.model, ctx);
  return { text: ascii(parsed.model, layout, ctx), warnings, layout };
}

/** The text of {@link draw}. */
export const text = async (source: string, options?: DrawOptions): Promise<string> =>
  (await draw(source, options)).text;
