/**
 * The page script of `www/e2e.html` (bundled by the dev server).
 *
 * - `?graph=<base64 JSON {code, mermaid}>` (what `e2e/helpers/util.ts` builds): renders the
 *   code with `mermaid` as integrator config into `#block`, then sets `window.rendered`.
 * - Always: exposes `window.v13` for the browser specs in `e2e/browser/`.
 */
import { canvasMeasurer } from 'mermaid-internal/measurer';
import { renderDiagram, type RenderOptions, type RenderOutput } from '../adapter.ts';

interface GraphObject {
  code: string;
  mermaid?: Record<string, unknown> & { cssVariables?: boolean; measurer?: 'canvas' | 'table' };
}

type PageRenderOptions = Omit<RenderOptions, 'measurer'> & { measurer?: 'canvas' | 'table' };

const api = {
  /** Renders and returns the SVG text (no DOM insertion). */
  async render(code: string, options: PageRenderOptions = {}): Promise<RenderOutput> {
    const measurer = options.measurer === 'canvas' ? (canvasMeasurer() ?? undefined) : undefined;
    return renderDiagram(code, { ...options, measurer });
  },
  /** Renders into a fresh `<div>` appended to `parent` (default body) and returns it. */
  async mount(
    code: string,
    options: PageRenderOptions = {},
    parent: HTMLElement = document.body
  ): Promise<{ div: HTMLDivElement; warnings: RenderOutput['warnings'] }> {
    const { svg, warnings } = await api.render(code, options);
    const div = document.createElement('div');
    div.className = 'diagram';
    div.innerHTML = svg;
    parent.appendChild(div);
    return { div, warnings };
  },
};

declare global {
  interface Window {
    v13: typeof api;
    rendered?: boolean;
    renderError?: string;
  }
}
window.v13 = api;

function b64ToUtf8(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function main(): Promise<void> {
  // Read raw: the base64 may hold `+`, which URLSearchParams would turn into a space.
  const graph = /[?&]graph=([^&]*)/.exec(location.search)?.[1];
  if (!graph) return;
  const obj = JSON.parse(b64ToUtf8(decodeURIComponent(graph))) as GraphObject;
  const { cssVariables, measurer, ...config } = obj.mermaid ?? {};
  const theme = config.theme ?? /^\s*theme:\s*([\w-]+)/m.exec(obj.code)?.[1];
  if (theme === 'dark') document.body.classList.add('dark');
  try {
    const { div } = await api.mount(obj.code, {
      config,
      cssVariables,
      measurer,
      idPrefix: 'block',
    });
    div.id = 'block';
  } catch (error) {
    window.renderError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    window.rendered = true;
  }
}

void main();
