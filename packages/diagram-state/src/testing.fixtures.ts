/**
 * Test-only (not built, not exported): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the state plugin, with `state.configDefaults`
 * under the integrator's config, `layered`, and the tree-backed writer, so the package's specs
 * can query the views. Cross-package specs render through `createMermaid()` instead.
 */
import { layered } from '@mermaid-js/core/layout';
import type { SvgTree } from '@mermaid-js/core/svg';
import {
  createSourceHarness,
  type SourceRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import type { CompleteStateLayout } from './layout/index.ts';
import type { StateDocument, StateModel } from './parser/index.ts';
import { state } from './plugin.ts';

export type Rendered = SourceRender<StateModel, CompleteStateLayout, StateDocument>;

const harness = createSourceHarness<StateModel, CompleteStateLayout, StateDocument>(state, {
  engine: layered,
  below: { state: state.configDefaults },
});

export const renderForTest = async (
  source: string,
  options?: Pick<TestRenderOptions, 'config' | 'idPrefix'>
): Promise<Rendered & { readonly tree: SvgTree }> => {
  const r = await harness(source, { ...options, tree: true });
  return { ...r, tree: r.tree! };
};
