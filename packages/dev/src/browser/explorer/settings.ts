/**
 * The explorer's page state, outside Lit: URL params, localStorage, the render settings and
 * the ←/→ shortcut guard (v12 `diagram-viewer.ts:250-330`, `compare-versions.ts:224-449`).
 *
 * Tabs may use `readUrlParam` / `setUrlParams` / `readStorage` / `writeStorage` for their own
 * state (e.g. Compare's `left`/`right`/`diff`), with keys of their own. The shell owns `path`,
 * `file`, `tab`, `theme` and `layout`, and the `devExplorer.viewer.*` keys it writes below.
 */
import type { InitializeConfig } from '../mermaid.ts';

export type ViewerTab = 'diagram' | 'code' | 'profile' | 'compare';
/** In tab-strip order (v12's). */
export const VIEWER_TABS: readonly ViewerTab[] = ['diagram', 'code', 'profile', 'compare'];

export const isViewerTab = (v: unknown): v is ViewerTab =>
  typeof v === 'string' && (VIEWER_TABS as readonly string[]).includes(v);

/**
 * The selectors' values. `undefined` is "not set": the key is left out of the config, so the
 * diagram's front matter and mermaid's defaults decide.
 */
export interface RenderSettings {
  readonly theme?: string;
  readonly layout?: string;
}

/** The `<select>` value for "not set". */
export const UNSET = 'unset';

export function readUrlParam(name: string): string | null {
  return new URL(window.location.href).searchParams.get(name);
}

/** Sets (or, for `null`/`undefined`/'', removes) params in place: `history.replaceState`. */
export function setUrlParams(pairs: Readonly<Record<string, string | null | undefined>>): void {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(pairs)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  history.replaceState(history.state, '', url);
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes, or removes for `undefined`. */
export function writeStorage(key: string, value: string | undefined): void {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage may be off (private mode); the URL still carries the state.
  }
}

const KEY = { theme: 'devExplorer.viewer.theme', layout: 'devExplorer.viewer.layout' } as const;

/**
 * The settings from the URL, else localStorage, keeping only values this build offers (a
 * theme or layout v13 dropped is ignored rather than rendered as an unknown value).
 */
export function loadSettings(
  themes: readonly string[],
  layouts: readonly string[]
): RenderSettings {
  const pick = (name: keyof typeof KEY, allowed: readonly string[]): string | undefined =>
    [readUrlParam(name), readStorage(KEY[name])].find(
      (v): v is string => v !== null && allowed.includes(v)
    );
  return { theme: pick('theme', themes), layout: pick('layout', layouts) };
}

/** Saves to both the URL and localStorage. */
export function saveSettings(settings: RenderSettings): void {
  writeStorage(KEY.theme, settings.theme);
  writeStorage(KEY.layout, settings.layout);
  setUrlParams({ theme: settings.theme, layout: settings.layout });
}

/** The integrator config a render uses: only the keys that are set. */
export function renderConfig(settings: RenderSettings): InitializeConfig {
  return {
    ...(settings.theme ? { theme: settings.theme as InitializeConfig['theme'] } : {}),
    ...(settings.layout ? { layout: settings.layout } : {}),
  };
}

const DARK_THEMES = new Set(['dark']);

/**
 * The theme a render most likely uses, for the canvas background only: the selected one, else
 * a `theme:` in the front matter or an init directive.
 */
export function effectiveTheme(theme: string | undefined, source: string): string | undefined {
  return theme ?? /["']?\btheme["']?\s*:\s*["']?([\w-]+)/.exec(source)?.[1];
}

export const isDarkTheme = (theme: string | undefined): boolean =>
  theme === 'auto'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : theme !== undefined && DARK_THEMES.has(theme);

// Elements that own their keystrokes. Buttons are deliberately absent, so the arrows keep
// working right after clicking Prev/Next. `sl-tab` is the tab nav (arrows move between tabs);
// `sl-split-panel` moves its divider.
const KEY_OWNING_TAGS = new Set([
  'input',
  'textarea',
  'select',
  'sl-input',
  'sl-textarea',
  'sl-select',
  'sl-option',
  'sl-checkbox',
  'sl-switch',
  'sl-range',
  'sl-radio',
  'sl-radio-button',
  'sl-radio-group',
  'sl-menu',
  'sl-menu-item',
  'sl-dropdown',
  'sl-split-panel',
  'sl-tab',
]);

/**
 * `prev`/`next` for an unmodified ←/→ that no input, editor (contenteditable, CodeMirror's
 * `.cm-editor`) or Shoelace control on the event's composed path owns; otherwise `null`.
 */
const ARROW_ACTIONS: ReadonlyMap<string, 'prev' | 'next'> = new Map([
  ['ArrowLeft', 'prev'],
  ['ArrowRight', 'next'],
]);

export function arrowAction(e: KeyboardEvent): 'prev' | 'next' | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat || e.defaultPrevented) {
    return null;
  }
  const action = ARROW_ACTIONS.get(e.key);
  if (!action) return null;
  const owned = e
    .composedPath()
    .some(
      (n) =>
        n instanceof HTMLElement &&
        (KEY_OWNING_TAGS.has(n.tagName.toLowerCase()) ||
          n.isContentEditable ||
          n.classList.contains('cm-editor'))
    );
  return owned ? null : action;
}
