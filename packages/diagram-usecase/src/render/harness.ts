/**
 * Test harness (`@mermaid-js/diagram-usecase/testing`): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the usecase plugin and its theme table,
 * laid out with core's `layered` or the engine given.
 */
import { layered } from '@mermaid-js/core/layout';
import {
  createRenderHarness,
  type TestRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import type { UsecaseLayout } from '../layout/layout.ts';
import type { UsecaseModel } from '../model.ts';
import type { UsecaseDocument } from '../parser/index.ts';
import { usecase } from '../plugin.ts';

export type RenderUsecaseOptions = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'outline' | 'measurer' | 'engine' | 'icon'
>;

export type RenderedUsecase = TestRender<UsecaseModel, UsecaseLayout, UsecaseDocument>;

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export const renderUsecaseForTest: (
  input: string | UsecaseModel,
  options?: RenderUsecaseOptions
) => Promise<RenderedUsecase> = createRenderHarness(usecase, { engine: layered });
