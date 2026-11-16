/**
 * Test harness for the package's own specs: the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the requirement plugin and its theme table,
 * laid out with core's `layered` or the engine given. Corpus properties go through
 * `createMermaid().render()` (pitfall 24), not through this.
 */
import { layered } from '@mermaid-js/core/layout';
import {
  createRenderHarness,
  type TestRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import type { RequirementLayout } from '../layout/layout.ts';
import type { RequirementModel } from '../model.ts';
import type { RequirementDocument } from '../parser/index.ts';
import { requirement } from '../plugin.ts';

export { TEST_VERSION } from '@mermaid-js/shared/testing/test-context';

export type RenderRequirementOptions = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'engine' | 'outline' | 'measurer'
>;

export type RenderedRequirement = TestRender<
  RequirementModel,
  RequirementLayout,
  RequirementDocument
>;

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export const renderRequirementForTest: (
  input: string | RequirementModel,
  options?: RenderRequirementOptions
) => Promise<RenderedRequirement> = createRenderHarness(requirement, { engine: layered });
