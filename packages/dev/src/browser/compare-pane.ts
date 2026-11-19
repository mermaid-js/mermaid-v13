/**
 * One side of the Compare tab (#61; v12 `public/compare-pane.html`), the script of
 * `www/dev/compare-pane.html`. Each pane is an iframe that loads one mermaid: the v13 dev
 * build (`/mermaid.esm.mjs?build=<n>`, through `createMermaid()`) or a published mermaid from
 * the CDN (its default export). The two never share globals; a different version or build is
 * a fresh iframe.
 *
 * The iframe is `sandbox="allow-scripts"`: an opaque origin, so the published mermaid running
 * here can't read or write through the dev server's API. It loads only `/build/compare-pane.js`,
 * `/mermaid.esm.mjs`, its chunks (`/chunks/mermaid.esm/`) and `/fonts/` from the server, which
 * send CORS headers for them.
 *
 * Protocol (postMessage to `'*'`, since the pane's origin is opaque; both ends check
 * `event.source` identity):
 *
 *     pane   → parent  { type: 'ready' }
 *     parent → pane    { type: 'load', bundle: { kind: 'dev' | 'npm', url, label } }
 *     pane   → parent  { type: 'loaded' }
 *     parent → pane    { type: 'render', text, config, background, requestId }
 *     pane   → parent  { type: 'rendered', svg, width, height, ms, requestId }
 *     pane   → parent  { type: 'error', message, requestId }   (requestId null: load failed)
 *     parent → pane    { type: 'overlay', dataUrl }             (the diff mask, or null)
 *
 * `ms` is how long the mermaid `render()` call took. A pane's first render is preceded by an
 * untimed warm-up render, so lazy chunk loads and first-run compilation don't count.
 */
import type * as DevBundleModule from './mermaid.ts';

export interface PaneBundle {
  readonly kind: 'dev' | 'npm';
  readonly url: string;
  /** `dev` or `mermaid@12.2.0`, for messages. */
  readonly label: string;
}

export type ParentMessage =
  | { readonly type: 'load'; readonly bundle: PaneBundle }
  | {
      readonly type: 'render';
      readonly text: string;
      readonly config: Record<string, unknown>;
      readonly background: string;
      readonly requestId: number;
    }
  | { readonly type: 'overlay'; readonly dataUrl: string | null };

export type PaneMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'loaded' }
  | {
      readonly type: 'rendered';
      readonly svg: string;
      readonly width: number;
      readonly height: number;
      /** The `render()` call's duration. */
      readonly ms: number;
      readonly requestId: number;
    }
  | { readonly type: 'error'; readonly message: string; readonly requestId: number | null };

/** What a pane renders with: `render(id, text, config)` → the SVG string. */
type Renderer = (id: string, text: string, config: Record<string, unknown>) => Promise<string>;

interface NpmMermaid {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string } | string>;
}

async function loadRenderer(bundle: PaneBundle): Promise<Renderer> {
  if (bundle.kind === 'dev') {
    const module = (await import(/* @vite-ignore */ bundle.url)) as typeof DevBundleModule;
    const instance = module.createMermaid();
    instance.registerLayoutLoaders(module.devLayoutLoaders);
    await instance.registerExternalDiagrams([module.interactions]);
    return async (id, text, config) => {
      instance.initialize(config as Parameters<typeof instance.initialize>[0]);
      return (await instance.render(id, text)).svg;
    };
  }
  const module = (await import(/* @vite-ignore */ bundle.url)) as {
    default?: NpmMermaid;
  } & Partial<NpmMermaid>;
  const mermaid = module.default ?? (module as NpmMermaid);
  if (typeof mermaid.render !== 'function') {
    throw new Error(`${bundle.label} has no render()`);
  }
  return async (id, text, config) => {
    mermaid.initialize(config);
    const result = await mermaid.render(id, text);
    return typeof result === 'string' ? result : result.svg;
  };
}

const errorMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message || String(e);
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as { str?: unknown; message?: unknown };
    return String(o.message ?? o.str ?? JSON.stringify(e));
  }
  return String(e);
};

/** Pins the SVG to its intrinsic size, so both panes overlay pixel for pixel. */
function naturalSize(svg: SVGSVGElement): { width: number; height: number } {
  const box = svg.viewBox.baseVal as DOMRect | null;
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(box && box.width > 0 ? box.width : rect.width));
  const height = Math.max(1, Math.ceil(box && box.height > 0 ? box.height : rect.height));
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.maxWidth = 'none';
  return { width, height };
}

function start(): void {
  const msg = document.getElementById('msg') as HTMLElement;
  const stage = document.getElementById('stage') as HTMLElement;
  let host = document.getElementById('svg-host') as HTMLElement;
  let renderer: Promise<Renderer> | undefined;
  let label = '';
  let count = 0;
  let warmedUp = false;
  // One render at a time: older mermaid keeps its render state global.
  let chain: Promise<void> = Promise.resolve();

  const post = (message: PaneMessage): void => {
    window.parent.postMessage(message, '*');
  };
  const show = (text: string, error = false): void => {
    msg.textContent = text;
    msg.className = error ? 'error' : '';
  };

  // Published versions leave scratch containers behind on error.
  const cleanUp = (id: string): void => {
    for (const sel of [`#d${id}`, `#${id}`, `#i${id}`]) {
      document.querySelectorAll(sel).forEach((el) => {
        if (!stage.contains(el)) el.remove();
      });
    }
  };

  async function render(m: Extract<ParentMessage, { type: 'render' }>): Promise<void> {
    document.documentElement.style.background = m.background;
    document.body.style.background = m.background;
    if (!renderer) {
      post({ type: 'error', message: 'No version loaded', requestId: m.requestId });
      return;
    }
    let draw: Renderer;
    try {
      draw = await renderer;
    } catch (e) {
      post({ type: 'error', message: errorMessage(e), requestId: m.requestId });
      return;
    }
    if (!warmedUp) {
      warmedUp = true;
      const warmUp = `compare-${++count}`;
      // A failure here shows again, with its message, in the timed render.
      await draw(warmUp, m.text, m.config).catch(() => undefined);
      cleanUp(warmUp);
    }
    const id = `compare-${++count}`;
    try {
      const t0 = performance.now();
      const svg = await draw(id, m.text, m.config);
      const ms = performance.now() - t0;
      if (typeof svg !== 'string' || !svg.includes('<svg')) {
        throw new Error('render() did not return an SVG');
      }
      const next = document.createElement('div');
      next.id = 'svg-host';
      next.innerHTML = svg;
      host.replaceWith(next);
      host = next;
      const el = next.querySelector('svg');
      if (!el) throw new Error('The render has no <svg>');
      const { width, height } = naturalSize(el);
      show('');
      // XML, so the parent can rasterise it as an <img> for the diff.
      post({
        type: 'rendered',
        svg: new XMLSerializer().serializeToString(el),
        width,
        height,
        ms,
        requestId: m.requestId,
      });
    } catch (e) {
      const message = errorMessage(e);
      host.innerHTML = '';
      show(`Render error (${label}):\n${message}`, true);
      post({ type: 'error', message, requestId: m.requestId });
    } finally {
      cleanUp(id);
    }
  }

  function overlay(dataUrl: string | null): void {
    let img = document.getElementById('overlay') as HTMLImageElement | null;
    if (!dataUrl) {
      img?.remove();
      return;
    }
    if (!img) {
      img = document.createElement('img');
      img.id = 'overlay';
      img.alt = '';
      stage.appendChild(img);
    }
    const target = img;
    target.onload = () => {
      // 1 CSS px per canvas px, aligned with the SVG.
      target.style.width = `${target.naturalWidth}px`;
      target.style.height = `${target.naturalHeight}px`;
    };
    target.src = dataUrl;
  }

  window.addEventListener('message', (event: MessageEvent<ParentMessage | null>) => {
    if (event.source !== window.parent) return;
    const m = event.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'load') {
      if (renderer) return; // one bundle per iframe
      label = m.bundle.label;
      show(`Loading ${label}…`);
      renderer = loadRenderer(m.bundle);
      renderer.then(
        () => {
          show('');
          post({ type: 'loaded' });
        },
        (e: unknown) => {
          const message = `Could not load ${label}: ${errorMessage(e)}`;
          show(message, true);
          post({ type: 'error', message, requestId: null });
        }
      );
    } else if (m.type === 'render') {
      chain = chain.then(() => render(m));
    } else if (m.type === 'overlay') {
      overlay(m.dataUrl);
    }
  });

  post({ type: 'ready' });
}

start();
