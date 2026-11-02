/**
 * The contract between the viewer shell (`../viewer.ts`) and its tabs. Each tab is one custom
 * element in its own file in this folder (`dev-tab-<name>` in `<name>.ts`), extending
 * `ViewerTabElement`. The shell imports all four and renders each in its `sl-tab-panel`:
 *
 *     <dev-tab-code .ctx=${ctx} .active=${tab === 'code'}></dev-tab-code>
 *
 * - `ctx` is a fresh immutable snapshot on every shell update, so a tab's `updated(changed)`
 *   sees `changed.has('ctx')` and compares the fields it cares about with the previous value
 *   (`changed.get('ctx')`).
 * - Tabs act only through the `ctx` functions: they never fetch the file API or touch
 *   another tab. Their own URL or storage state goes through `../settings.ts`'s helpers, with
 *   their own keys.
 * - Tabs render into their own shadow root with Lit `static styles` (the Shoelace dark theme's
 *   CSS variables inherit into it), so no tab edits the shell's `www/dev/styles.css`.
 * - Every tab stays mounted; `active` says whether its panel is showing. Do expensive work
 *   (Compare's iframes, Profile's runs) only while active.
 * - The shell owns ←/→ (prev/next file) and skips key events from inputs, Shoelace controls,
 *   contenteditable and `.cm-editor` (`arrowAction`). A tab's own shortcuts (Compare's D) are a
 *   `document` keydown listener added in `connectedCallback` that checks `active`.
 */
import { LitElement } from 'lit';
import type { DevMermaid, RenderOutcome } from '../render.ts';
import type { RenderSettings, ViewerTab } from '../settings.ts';

export type { DevMermaid, RenderOutcome } from '../render.ts';
export type { RenderSettings, ViewerTab } from '../settings.ts';

export interface ViewerContext {
  /** The open file, relative to the explorer root (e.g. `flowchart/baseline/basic.mmd`). */
  readonly file: string;
  /** The file's text on disk, as last loaded or saved. */
  readonly source: string;
  /** The current text: `source` plus any unsaved edits. The shell renders this. */
  readonly text: string;
  /** `text !== source`. */
  readonly dirty: boolean;
  /** The file changed on disk while `dirty`; the shell kept the edits (`revert()` drops them). */
  readonly diskChanged: boolean;
  /** The selectors (theme, layout); `undefined` = not set. */
  readonly settings: RenderSettings;
  /** The shell's latest render of `text` with `settings`; `undefined` before the first. */
  readonly outcome: RenderOutcome | undefined;
  /** A shell render is running. */
  readonly rendering: boolean;
  /** The dev mermaid build `render` uses; it changes after a rebuild of the sources. */
  readonly build: number;
  /**
   * The last `/events` message: `seq` bumps on every one; `paths` are repo-relative posix
   * (absolute outside the checkout). The shell has already reloaded the file and re-rendered
   * as needed; tabs with their own renders (Compare, Profile) re-run on a new `seq`.
   */
  readonly event: {
    readonly seq: number;
    readonly time: number;
    readonly paths: readonly string[];
  };
  /** The last `goto` position (1-based); `seq` bumps on each call. The Code tab moves there. */
  readonly reveal:
    | { readonly seq: number; readonly line: number; readonly column: number }
    | undefined;

  /** Renders any text with the current build (default settings: `ctx.settings`). Never throws. */
  render(text: string, settings?: RenderSettings): Promise<RenderOutcome>;
  /** The current dev build: `module` (the whole public API, `@mermaid-js/core/timing` …) and a
   * ready `createMermaid()` instance. */
  mermaid(): Promise<DevMermaid>;
  /** Replaces `text` (unsaved edits); the shell re-renders and updates `dirty`. */
  setText(text: string): void;
  /** Writes `text` to disk (`PUT`). Resolves `false` and shows the banner on failure. */
  save(): Promise<boolean>;
  /** Drops unsaved edits and reloads the file from disk. */
  revert(): Promise<void>;
  /** Shows `tab`; with `at`, also sets `reveal` (e.g. a diagnostic opens Code at its line). */
  goto(tab: ViewerTab, at?: { readonly line: number; readonly column?: number }): void;
}

/** The base of every tab: the shell sets `ctx` and `active`. */
export class ViewerTabElement extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    active: { type: Boolean, reflect: true },
  };

  declare ctx: ViewerContext | undefined;
  declare active: boolean;

  constructor() {
    super();
    this.ctx = undefined;
    this.active = false;
  }
}
