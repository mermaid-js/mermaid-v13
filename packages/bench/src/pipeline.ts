/**
 * Whether the v13 render pipeline exists yet. The gates report until it does and enforce after
 * (`auto` mode). Used in Node by the CLI and in the browser by the v13 adapters, so no Node APIs.
 */
import type { PipelineState } from './report.ts';

export type RenderFn = (id: string, text: string) => unknown;

export const PROBE_SOURCE = 'flowchart LR\n  A --> B\n';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** `render` from a module namespace, or from its default export object (v12 style). */
export function findRender(mod: unknown): RenderFn | undefined {
  if (!isRecord(mod)) return undefined;
  if (typeof mod.render === 'function') return mod.render as RenderFn;
  const d = mod.default;
  if (isRecord(d) && typeof d.render === 'function') return (d.render as RenderFn).bind(d);
  return undefined;
}

/** The SVG string of a `RenderResult` (or of a renderer that returns the string itself). */
export function svgOf(result: unknown): string {
  if (typeof result === 'string') return result;
  if (isRecord(result) && typeof result.svg === 'string') return result.svg;
  return '';
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export async function detectPipeline(mod: unknown): Promise<PipelineState> {
  const render = findRender(mod);
  if (!render) return { present: false, reason: 'mermaid exports no render()' };
  try {
    const svg = svgOf(await render('bench-probe', PROBE_SOURCE));
    return svg.includes('<svg')
      ? { present: true, reason: 'render() turned a two-node flowchart into an <svg>' }
      : { present: false, reason: 'render() returned no <svg>' };
  } catch (e) {
    return { present: false, reason: `render() threw: ${errorText(e)}` };
  }
}
