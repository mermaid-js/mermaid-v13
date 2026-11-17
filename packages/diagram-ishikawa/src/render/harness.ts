/**
 * Test harness (`@mermaid-js/diagram-ishikawa/testing`): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the ishikawa plugin. Ishikawa paints no
 * gradient (D227), so its writer gets none. Throws `ishikawa parse error: …` for a source the
 * parser rejects.
 */
import {
  createRenderHarness,
  type TestRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import type { IshikawaLayout } from '../layout/index.ts';
import type { IshikawaModel } from '../model.ts';
import type { IshikawaDocument } from '../parser/index.ts';
import { ishikawa } from '../plugin.ts';

export type RenderIshikawaOptions = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'outline' | 'measurer'
>;

export type RenderedIshikawa = TestRender<IshikawaModel, IshikawaLayout, IshikawaDocument>;

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export const renderIshikawaForTest: (
  input: string | IshikawaModel,
  options?: RenderIshikawaOptions
) => Promise<RenderedIshikawa> = createRenderHarness(ishikawa, { gradient: false });
