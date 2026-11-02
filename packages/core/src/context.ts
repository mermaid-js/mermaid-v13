import type { ResolvedConfig } from './config/index.ts';
import type { Limits } from './limits/index.ts';
import type { Measurer } from './text/index.ts';
import type { Theme } from './theme/index.ts';

/** A warning any stage can raise; the pipeline collects them into `RenderResult.warnings`. */
export interface RenderWarning {
  readonly code: string;
  readonly message: string;
}

/**
 * What every plugin stage receives (DESIGN §3): created per call, frozen except for the
 * warning sink. #15 owns the pipeline that builds it; this is the shared shape. Diagram
 * packages may declare a structural subset (e.g. flowchart's `FlowRenderContext`).
 */
export interface RenderContext {
  readonly config: ResolvedConfig;
  readonly measurer: Measurer;
  readonly theme: Theme;
  /** Integrator-only (R-SEC-5): from `resolveLimits(initializeConfig, options.limits)`. */
  readonly limits: Limits;
  warn(warning: RenderWarning): void;
}
