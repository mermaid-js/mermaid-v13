/**
 * Test harness (`@mermaid-js/diagram-architecture/testing`): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the architecture plugin and its theme
 * table, laid out with `compass` or the engine given, the plugin's engine as the config layer
 * under the integrator's (D284), as `mermaid` puts it. It parses with `parseArchitecture` alone,
 * without the plugin's limits, and keeps each warning's code and message only.
 */
import type { Warning } from '@mermaid-js/core';
import { compass } from '@mermaid-js/core/layout/compass';
import {
  createSourceHarness,
  type SourceRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import { architectureLayoutEngine } from '../layout/engine.ts';
import type { ArchitectureLayout } from '../layout/layout.ts';
import type { ArchitectureModel } from '../model.ts';
import type { ArchitectureDocument } from '../parser/ast.ts';
import { parseArchitecture } from '../parser/index.ts';
import { architecture } from '../plugin.ts';

export { TEST_VERSION } from '@mermaid-js/shared/testing/test-context';

export type RenderArchitectureOptions = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'engine' | 'measurer' | 'icon' | 'inline'
>;

export type RenderedArchitecture = SourceRender<
  ArchitectureModel,
  ArchitectureLayout,
  ArchitectureDocument
>;

/** Renders `source`, parsed with its front matter and directives; throws on a parse error. */
export const renderArchitectureForTest: (
  source: string,
  options?: RenderArchitectureOptions
) => Promise<RenderedArchitecture> = createSourceHarness(architecture, {
  engine: compass,
  below: { layout: architectureLayoutEngine.default },
  parse: (text, { preprocessed }) => parseArchitecture(text, { preprocessed }),
  warning: (w): Warning => ({ code: w.code, message: w.message }),
});
