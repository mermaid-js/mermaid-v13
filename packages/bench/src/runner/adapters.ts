/**
 * The only renderer-specific code in the runner (approaches harness `src/runner/adapters/*`).
 * Each adapter imports its renderer from the URL the server publishes it under.
 */
import type { StageClock } from '@mermaid-js/core/timing';
import { findRender, svgOf } from '../pipeline.ts';
import type { RenderFn } from '../pipeline.ts';
import type { RendererId, Stage } from '../report.ts';
import type { RunnerOptions } from './protocol.ts';
import { RENDERER_ENTRY } from './protocol.ts';

export class PipelineMissing extends Error {
  override name = 'PipelineMissing';
}

export interface Adapter {
  init(options: RunnerOptions): Promise<void>;
  /** Returns an SVG string. `id` is unique per call. */
  render(source: string, id: string): Promise<string>;
  /** Stage time accumulated since the last call; absent for renderers without stage timing. */
  takeStages?(): Partial<Record<Stage, number>>;
}

const LIFTED = { maxTextSize: 10_000_000, maxEdges: 1_000_000 };

// The URL is only known at run time, so the bundler leaves the import alone.
const load = (id: RendererId): Promise<Record<string, unknown>> => import(RENDERER_ENTRY[id]);

function v13(id: 'v13' | 'v13-stages' | 'v13-base'): Adapter {
  let render: RenderFn | undefined;
  let acc: Partial<Record<Stage, number>> = {};
  return {
    async init({ liftLimits }) {
      const mod = await load(id);
      render = findRender(mod);
      if (!render) throw new PipelineMissing('mermaid exports no render()');
      const initialize = mod.initialize;
      if (liftLimits && typeof initialize === 'function') initialize(LIFTED);
      if (id === 'v13-stages') {
        const install = mod.installStageClock as (c: StageClock) => void;
        install({
          now: () => performance.now(),
          record: (stage, ms) => {
            acc[stage] = (acc[stage] ?? 0) + ms;
          },
        });
      }
    },
    async render(source, diagramId) {
      return svgOf(await render!(diagramId, source));
    },
    ...(id === 'v13-stages' && {
      takeStages() {
        const out = acc;
        acc = {};
        return out;
      },
    }),
  };
}

interface Mermaid12 {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}

function v12(id: 'v12-frozen' | 'v12-current'): Adapter {
  let mermaid: Mermaid12;
  return {
    async init({ liftLimits }) {
      mermaid = (await load(id)).default as Mermaid12;
      // Defaults otherwise (default theme, securityLevel 'strict'). Frozen 12.2.0 is the R-PERF-3
      // baseline with the classic dagre layout; current 12.x keeps its own default layout.
      mermaid.initialize({
        startOnLoad: false,
        ...(id === 'v12-frozen' && { layout: 'dagre' }),
        ...(liftLimits && LIFTED),
      });
    },
    async render(source, diagramId) {
      const { svg } = await mermaid.render(diagramId, source);
      // Over maxTextSize Mermaid does not throw: it renders a placeholder diagram.
      if (svg.includes('Maximum text size in diagram exceeded')) {
        throw new Error('Maximum text size in diagram exceeded (maxTextSize)');
      }
      return svg;
    },
  };
}

type PeleRender = (source: string, options?: Record<string, unknown>) => { svg: string };

function pele(): Adapter {
  let render: PeleRender;
  let options: Record<string, unknown> = {};
  return {
    async init({ liftLimits }) {
      render = (await load('pele')).render as PeleRender;
      // Pele's defaults otherwise. It is synchronous and throws a PeleError on bad input.
      if (liftLimits)
        options = {
          limit: LIFTED.maxTextSize,
          maxEdges: LIFTED.maxEdges,
          outputLimit: Number.MAX_SAFE_INTEGER,
        };
    },
    render(source) {
      // Pele is synchronous; the adapter contract is a promise.
      return Promise.resolve(render(source, options).svg);
    },
  };
}

export function adapterFor(id: RendererId): Adapter {
  if (id === 'pele') return pele();
  return id === 'v13' || id === 'v13-stages' || id === 'v13-base' ? v13(id) : v12(id);
}
