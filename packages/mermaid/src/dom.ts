// cspell:words loadingdone
/**
 * The browser DOM adapter (DESIGN §3, §11, §12.2; R-API-6, R-API-7, R-ERR-3, D33, D49):
 * `run()` replaces `.mermaid` elements as v12 did, `mount()` keeps one element rendered.
 * Everything DOM lives here; core and the pure API never touch the document (R-ARCH-1).
 *
 * - A failing diagram is replaced by core's error image unless `suppressErrorRendering`.
 * - After the svg is inserted, `result.bindFunctions(el)` runs once: it is the extension
 *   `afterMount` entry point (#22).
 * - The browser measurer is `canvasMeasurer` (selected in `selectMeasurer`); a host's
 *   `--mermaid-fontFamily` on the element is what the svg draws with, so it is measured too.
 */
import { renderErrorSvg, type MermaidError } from '@mermaid-js/core';
import type { MermaidConfig } from '@mermaid-js/core/config';
import { resolveFontFamily } from '@mermaid-js/core/text';
import type { Prepared, RenderResult, SvgRenderOptions } from './api-types.ts';
import type { InitializeConfig } from './config-snapshot.ts';
import { toMermaidError } from './errors.ts';
import { VERSION } from './version.ts';

/** v12's `RunOptions`, unchanged (R-COMPAT-5). */
export interface RunOptions {
  /** Elements to render. Default `".mermaid"` (which matches v12's `pre.mermaid`). */
  querySelector?: string;
  /** The elements to render; `querySelector` is ignored when set. */
  nodes?: ArrayLike<HTMLElement>;
  /** Called after each diagram is rendered, with its id. */
  postRenderCallback?: (id: string) => unknown;
  /** Resolve instead of rejecting when a diagram fails. Default `false`. */
  suppressErrors?: boolean;
}

export interface MountOptions {
  /** Prefix of the ids in the output. Default `mermaid-<n>`. */
  id?: string;
  /** Per-mount integrator config, merged over `initialize()`'s. */
  config?: InitializeConfig;
  /** Draw placeholders for missing resources instead of failing. */
  placeholders?: boolean;
  /**
   * Fit the drawing to a width (R-LAYOUT-5). `true` uses the element's content width and
   * re-renders when it changes; a number is a fixed width. Off by default, and without it a
   * resize never re-renders.
   */
  availableWidth?: boolean | number;
}

/** A mounted diagram: re-rendered on resize (with `availableWidth`) and after fonts load. */
export interface Mounted {
  readonly element: HTMLElement;
  /** The last successful render. */
  readonly result: RenderResult | undefined;
  /** The error of the last render, when it failed. */
  readonly error: MermaidError | undefined;
  /** Settles with the first render. */
  readonly ready: Promise<RenderResult>;
  /** Renders new text into the element. */
  update(text: string): Promise<RenderResult>;
  /** Stops listening for resizes and font loads. The element keeps its content. */
  destroy(): void;
}

/** What the adapter needs from its API object. SVG only (D86): it never asks for text. */
export interface DomHost {
  prepare(text: string, options?: SvgRenderOptions): Promise<Prepared>;
  renderSync(text: string, options?: SvgRenderOptions): RenderResult;
  /** The `initialize()` config, read at the start of each call. */
  siteConfig(): Readonly<MermaidConfig>;
  onParseError(error: MermaidError): void;
}

/** v12's `utils.entityDecode`: decodes entities in the element's markup, keeps tags as text. */
export function entityDecode(html: string): string {
  const decoder = document.createElement('div');
  decoder.innerHTML = escape(html).replace(/%26/g, '&').replace(/%23/g, '#').replace(/%3B/g, ';');
  return unescape(decoder.textContent ?? '');
}

/** ts-dedent as v12 used it: drops the indentation common to every line after the first. */
export function dedent(text: string): string {
  let out = text.replace(/\r?\n[\t ]*$/, '');
  const indents = out.match(/\n(?:[\t ]+|(?!\s).)/g);
  if (indents) {
    // Only blanks count: a line that starts with text has no indent (as ts-dedent, v12).
    const min = Math.min(
      ...indents.map((m) => m.length - 1 - m.slice(1).replace(/[\t ]/g, '').length)
    );
    out = out.replace(new RegExp(`\\n[\\t ]{${min}}`, 'g'), '\n');
  }
  return out.replace(/^\r?\n/, '');
}

/** The diagram text of a `.mermaid` element, cleaned as v12's `run()` did. */
export function elementText(el: Element): string {
  return dedent(entityDecode(el.innerHTML))
    .trim()
    .replace(/<br\s*\/?>/gi, '<br/>');
}

/** The host's `--mermaid-fontFamily` on `el`, as per-call config so it is measured. */
function fontConfig(el: Element, base: InitializeConfig | undefined): InitializeConfig | undefined {
  let css = '';
  try {
    css = getComputedStyle(el).getPropertyValue('--mermaid-fontFamily').trim();
  } catch {
    return base;
  }
  if (!css) return base;
  const fontFamily = resolveFontFamily(undefined, css);
  const vars = (base?.themeVariables ?? {}) as Record<string, unknown>;
  return { ...base, themeVariables: { ...vars, fontFamily } };
}

export function createDomAdapter(host: DomHost) {
  let counter = 0;

  async function draw(text: string, options: SvgRenderOptions): Promise<RenderResult> {
    await host.prepare(text, options);
    return host.renderSync(text, options);
  }

  function showError(el: Element, error: MermaidError, suppress: unknown): void {
    if (!suppress) el.innerHTML = renderErrorSvg(error, { version: VERSION });
  }

  async function runThrows(options: RunOptions): Promise<void> {
    const conf = host.siteConfig();
    const nodes =
      options.nodes ?? document.querySelectorAll<HTMLElement>(options.querySelector ?? '.mermaid');
    // v12's InitIDGenerator counts from the seed's length when ids are deterministic; v13
    // always counts (v12's Date.now() ids could collide on one page).
    if (conf.deterministicIds) counter = conf.deterministicIDSeed?.length ?? 0;
    const errors: MermaidError[] = [];
    for (const el of Array.from(nodes)) {
      // v13's svg root has class `mermaid` too: a drawn diagram is never a source.
      if (el.getAttribute('data-processed') || el.closest('svg')) continue;
      el.setAttribute('data-processed', 'true');
      const id = `mermaid-${counter++}`;
      const text = elementText(el);
      let result: RenderResult;
      try {
        result = await draw(text, { id, config: fontConfig(el, undefined) });
      } catch (e) {
        const error = toMermaidError(e);
        showError(el, error, conf.suppressErrorRendering);
        errors.push(error);
        host.onParseError(error);
        continue;
      }
      try {
        el.innerHTML = result.svg;
        if (options.postRenderCallback) await options.postRenderCallback(id);
        result.bindFunctions?.(el);
      } catch (e) {
        errors.push(toMermaidError(e));
      }
    }
    if (errors.length > 0) throw errors[0];
  }

  /** v12's `run()`: renders every unprocessed `.mermaid` element, carrying on after failures. */
  async function run(options: RunOptions = { querySelector: '.mermaid' }): Promise<void> {
    try {
      await runThrows(options);
    } catch (e) {
      if (!options.suppressErrors) throw e;
    }
  }

  /** Renders `text` into `el` and keeps it rendered (R-API-7). */
  function mount(el: HTMLElement, text: string, options: MountOptions = {}): Mounted {
    const id = options.id ?? `mermaid-${counter++}`;
    const tracksWidth = options.availableWidth === true;
    let source = text;
    let shown: string | undefined;
    let result: RenderResult | undefined;
    let error: MermaidError | undefined;
    let destroyed = false;
    let lastWidth = -1;
    let queued: Promise<RenderResult> | undefined;
    let running: Promise<unknown> = Promise.resolve();

    const width = (): number | undefined => {
      if (typeof options.availableWidth === 'number') return options.availableWidth;
      if (!tracksWidth) return undefined;
      const cs = getComputedStyle(el);
      return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    };

    async function once(): Promise<RenderResult> {
      const availableWidth = width();
      if (availableWidth !== undefined) lastWidth = Math.round(availableWidth);
      const renderOptions: SvgRenderOptions = {
        id,
        config: fontConfig(el, options.config),
        ...(options.placeholders ? { placeholders: true } : {}),
        ...(availableWidth !== undefined ? { availableWidth } : {}),
      };
      try {
        const next = await draw(source, renderOptions);
        if (destroyed) return next;
        result = next;
        error = undefined;
        // Font loads and resizes often give the same drawing: leave the DOM alone then.
        if (next.svg !== shown) {
          el.innerHTML = next.svg;
          shown = next.svg;
        }
        // Bound even when the svg is the same: what extensions bind (menus, callbacks) is not
        // in the svg, so it can change on its own. The interactions plugin binds by content,
        // so the same interactions are not bound twice.
        next.bindFunctions?.(el);
        return next;
      } catch (e) {
        error = toMermaidError(e);
        if (!destroyed) {
          const suppress =
            options.config?.suppressErrorRendering ?? host.siteConfig().suppressErrorRendering;
          showError(el, error, suppress);
          if (!suppress) shown = undefined;
        }
        throw error;
      }
    }

    // One render at a time; requests made while one runs collapse into the next.
    function refresh(): Promise<RenderResult> {
      if (queued) return queued;
      const p = running.then(() => {
        queued = undefined;
        return once();
      });
      queued = p;
      running = p.catch(() => undefined);
      return p;
    }
    const background = (): void => {
      if (!destroyed) refresh().catch(() => undefined);
    };

    let observer: ResizeObserver | undefined;
    if (tracksWidth && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        const w = width();
        if (w !== undefined && Math.round(w) !== lastWidth) background();
      });
      observer.observe(el);
    }
    // A web font that finishes loading changes canvas widths (R-TEXT-5): measure again once
    // `fonts.ready` settles. WebKit fires `loading` but never `loadingdone`, so a load is
    // seen when it starts, and one already running at mount is waited for too.
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    const afterLoad = (): void => {
      fonts?.ready?.then(background, background);
    };
    fonts?.addEventListener?.('loading', afterLoad);
    if (fonts?.status === 'loading') afterLoad();

    const ready = refresh();
    ready.catch(() => undefined);

    return {
      element: el,
      get result() {
        return result;
      },
      get error() {
        return error;
      },
      ready,
      update(next: string) {
        source = next;
        return refresh();
      },
      destroy() {
        destroyed = true;
        observer?.disconnect();
        fonts?.removeEventListener?.('loading', afterLoad);
      },
    };
  }

  /**
   * v12's `contentLoaded`: runs `run()` unless `startOnLoad` is off. Failing diagrams show the
   * error image and reach `setParseErrorHandler`; nothing is thrown from the load handler.
   */
  function contentLoaded(): void {
    if (host.siteConfig().startOnLoad !== false) void run({ suppressErrors: true });
  }

  return { run, mount, contentLoaded };
}
