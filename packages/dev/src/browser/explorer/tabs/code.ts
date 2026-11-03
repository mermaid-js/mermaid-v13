/**
 * The Code tab (`dev-tab-code`, v12 `code-editor.ts`): CodeMirror 6 with
 * `codemirror-lang-mermaid` over the open file's text.
 *
 * - Edits go to `ctx.setText`, so the shell re-renders them before they are saved.
 * - Save (the button, or Mod-s anywhere while the tab shows) calls `ctx.save()`. The status
 *   (`[data-status]`) is `saved`, `dirty`, `saving` or `conflict`; `conflict` (the file
 *   changed on disk while dirty) also shows a warning with Revert.
 * - `ctx.goto('code', { line, column })` bumps `ctx.reveal`; the editor then moves the cursor
 *   there (1-based, clamped to the document), scrolls it into view and takes focus. A reveal
 *   that arrives while the tab is hidden waits until it shows. `position` reads the cursor.
 *
 * See `./context.ts` for what the shell passes in.
 */
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorSelection, EditorState, Prec } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import {
  flowchartTags,
  ganttTags,
  journeyTags,
  mermaid,
  mermaidTags,
  mindmapTags,
  pieTags,
  requirementTags,
  sequenceTags,
} from 'codemirror-lang-mermaid';
import { css, html, nothing, type PropertyValues } from 'lit';
import { ViewerTabElement, type ViewerContext } from './context.ts';

/** v12's palette, unchanged. */
const highlightStyle = HighlightStyle.define([
  {
    tag: [mermaidTags.diagramName, flowchartTags.diagramName],
    color: '#c4b5fd',
    fontWeight: '600',
  },
  {
    tag: [t.keyword, flowchartTags.keyword, ganttTags.keyword, journeyTags.keyword],
    color: '#7dd3fc',
  },
  { tag: [t.controlKeyword, sequenceTags.keyword2], color: '#fbbf24' },
  { tag: [t.modifier, flowchartTags.orientation, sequenceTags.position], color: '#c084fc' },
  {
    tag: [t.variableName, flowchartTags.nodeId, sequenceTags.nodeText, journeyTags.actor],
    color: '#93c5fd',
  },
  {
    tag: [
      t.string,
      flowchartTags.nodeText,
      flowchartTags.nodeEdgeText,
      pieTags.titleText,
      journeyTags.text,
      requirementTags.quotedString,
      ganttTags.string,
    ],
    color: '#86efac',
  },
  {
    tag: [t.number, flowchartTags.number, pieTags.number, requirementTags.number],
    color: '#fca5a5',
  },
  {
    tag: [t.contentSeparator, flowchartTags.link, flowchartTags.nodeEdge, sequenceTags.arrow],
    color: '#f59e0b',
  },
  {
    tag: [t.lineComment, flowchartTags.lineComment, pieTags.lineComment],
    color: '#64748b',
    fontStyle: 'italic',
  },
  { tag: [mindmapTags.lineText1, mindmapTags.lineText4], color: '#86efac' },
  { tag: [mindmapTags.lineText2, mindmapTags.lineText5], color: '#f9a8d4' },
  { tag: mindmapTags.lineText3, color: '#fbbf24' },
]);

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      color: 'var(--sl-color-neutral-900)',
      backgroundColor: 'var(--sl-color-neutral-0)',
      fontSize: '13px',
    },
    '.cm-scroller': {
      fontFamily: 'var(--sl-font-mono)',
      lineHeight: '1.55',
    },
    '.cm-content': { caretColor: 'var(--sl-color-primary-500)' },
    '.cm-cursor': { borderLeftColor: 'var(--sl-color-primary-500)' },
    '.cm-gutters': {
      backgroundColor: 'var(--sl-color-neutral-50)',
      color: 'var(--sl-color-neutral-500)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'rgb(255 255 255 / 4%)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgb(255 255 255 / 6%)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgb(56 189 248 / 25%)',
    },
  },
  { dark: true }
);

export type CodeStatus = 'saved' | 'dirty' | 'saving' | 'conflict';

const STATUS_LABELS: Readonly<Record<CodeStatus, string>> = {
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  conflict: 'Changed on disk',
};

const isSaveKey = (e: KeyboardEvent): boolean =>
  (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's';

export class CodeTab extends ViewerTabElement {
  static override properties = {
    ...ViewerTabElement.properties,
    saving: { state: true },
  };

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      box-sizing: border-box;
      padding: 8px 12px 12px;
      gap: 8px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      color: var(--sl-color-neutral-600);
    }
    .status::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-right: 6px;
      border-radius: 50%;
      background: var(--sl-color-success-500);
    }
    .status[data-status='dirty']::before,
    .status[data-status='saving']::before {
      background: var(--sl-color-warning-500);
    }
    .status[data-status='conflict']::before {
      background: var(--sl-color-danger-500);
    }
    .spacer {
      flex: 1;
    }
    .conflict {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      color: var(--sl-color-warning-900);
      background: var(--sl-color-warning-100);
      border: 1px solid var(--sl-color-warning-300);
    }
    .mount {
      flex: 1;
      min-height: 0;
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: 8px;
      overflow: hidden;
    }
  `;

  declare saving: boolean;

  #view: EditorView | undefined;
  /** Set while the editor is being given the shell's text, so it isn't echoed back. */
  #syncing = false;
  #revealSeq = 0;
  #pendingReveal: { line: number; column: number } | undefined;

  constructor() {
    super();
    this.saving = false;
  }

  /** The cursor, 1-based; `undefined` before the editor mounts. */
  get position(): { line: number; column: number } | undefined {
    const state = this.#view?.state;
    if (!state) return undefined;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    return { line: line.number, column: head - line.from + 1 };
  }

  get #status(): CodeStatus {
    if (this.saving) return 'saving';
    if (this.ctx?.diskChanged) return 'conflict';
    return this.ctx?.dirty ? 'dirty' : 'saved';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.#onDocumentKeyDown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#onDocumentKeyDown);
    this.#view?.destroy();
    this.#view = undefined;
  }

  /** Mod-s while the tab shows but the editor isn't focused (the editor's keymap handles it there). */
  #onDocumentKeyDown = (e: KeyboardEvent): void => {
    if (!this.active || e.defaultPrevented || !isSaveKey(e)) return;
    e.preventDefault();
    void this.#save();
  };

  async #save(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.saving) return;
    this.saving = true;
    try {
      await ctx.save();
    } finally {
      this.saving = false;
    }
  }

  protected override firstUpdated(): void {
    const parent = this.renderRoot.querySelector<HTMLElement>('.mount');
    if (!parent) return;
    this.#view = new EditorView({
      parent,
      root: this.renderRoot as ShadowRoot,
      doc: this.ctx?.text ?? '',
      extensions: [
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                void this.#save();
                return true;
              },
            },
          ])
        ),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        highlightActiveLine(),
        mermaid(),
        syntaxHighlighting(highlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !this.#syncing) this.ctx?.setText(update.state.doc.toString());
        }),
      ],
    });
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('ctx') && this.ctx) this.#onContext(this.ctx);
    if (changed.has('active') && this.active) this.#view?.requestMeasure();
    if (this.active && this.#pendingReveal) {
      const at = this.#pendingReveal;
      this.#pendingReveal = undefined;
      // The panel has just become visible: let it lay out before scrolling.
      requestAnimationFrame(() => this.#reveal(at));
    }
  }

  #onContext(ctx: ViewerContext): void {
    const view = this.#view;
    if (view && view.state.doc.toString() !== ctx.text) {
      const anchor = Math.min(view.state.selection.main.head, ctx.text.length);
      this.#syncing = true;
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: ctx.text },
          selection: { anchor },
        });
      } finally {
        this.#syncing = false;
      }
    }
    if (ctx.reveal && ctx.reveal.seq !== this.#revealSeq) {
      this.#revealSeq = ctx.reveal.seq;
      this.#pendingReveal = { line: ctx.reveal.line, column: ctx.reveal.column };
    }
  }

  #reveal({ line, column }: { line: number; column: number }): void {
    const view = this.#view;
    if (!view) return;
    const doc = view.state.doc;
    const target = doc.line(Math.min(Math.max(1, Math.trunc(line) || 1), doc.lines));
    const offset = Math.min(Math.max(1, Math.trunc(column) || 1) - 1, target.length);
    const pos = target.from + offset;
    view.dispatch({
      selection: EditorSelection.cursor(pos),
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    });
    view.focus();
  }

  override render() {
    const ctx = this.ctx;
    const status = this.#status;
    return html`
      <div class="toolbar">
        <span class="status" data-status=${status}>${STATUS_LABELS[status]}</span>
        <span class="spacer"></span>
        <sl-button
          size="small"
          data-action="save"
          title="Save to disk (Mod-s)"
          ?disabled=${!ctx || this.saving || status === 'saved'}
          @click=${() => void this.#save()}
        >
          <sl-icon slot="prefix" name="floppy"></sl-icon>
          Save
        </sl-button>
      </div>
      ${ctx?.diskChanged
        ? html`<div class="conflict" role="alert">
            The file changed on disk while you had unsaved edits. Save overwrites it; Revert loads
            the disk version.
            <sl-button size="small" @click=${() => void ctx.revert()}>Revert</sl-button>
          </div>`
        : nothing}
      <div class="mount"></div>
    `;
  }
}

customElements.define('dev-tab-code', CodeTab);
