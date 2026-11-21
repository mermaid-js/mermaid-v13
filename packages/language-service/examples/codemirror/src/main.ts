/**
 * Example editor (D98): CodeMirror 6 with `mermaid()` from the adapter, and a live v13 SVG
 * preview. The cursor highlights the `[data-ast]` element of the innermost AST node under it;
 * clicking an element moves the cursor to that node's source.
 */
import { closeBrackets, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { foldGutter, foldKeymap } from '@codemirror/language';
import { lintGutter } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { mermaid, selectAst } from '@mermaid-js/language-service-codemirror';
import { createLanguageService } from '@mermaid-js/language-service';
import type { AstId } from '@mermaid-js/language-service';
import { initialize, render } from 'mermaid';

// The preview maps elements to AST nodes through `data-ast`, which mermaid draws only on request.
initialize({ output: { dataAst: true } });

const INITIAL = `flowchart LR
  A[Start] --> B{Ready?}
  B -- yes --> C[Ship it]
  B -- no --> D[Fix]
  subgraph review
    D --> E[Test]
    E --> B
  end
`;

const preview = document.getElementById('preview')!;
const status = document.getElementById('status')!;
let cursorIds: readonly AstId[] = [];
let renders = 0;

/** Outline the element of the innermost cursor id that the preview has. */
function highlight(): void {
  for (const el of preview.querySelectorAll('.ast-current')) el.classList.remove('ast-current');
  for (const id of cursorIds) {
    const el = preview.querySelector(`[data-ast="${CSS.escape(id)}"]`);
    if (el) {
      el.classList.add('ast-current');
      return;
    }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let latest = 0;
/** Render the text into the preview; a failed render keeps the last good one. */
async function renderPreview(text: string): Promise<void> {
  const mine = ++latest;
  try {
    const { svg } = await render(`preview-${mine}`, text);
    if (mine !== latest) return;
    preview.innerHTML = svg;
    renders++;
    status.textContent = `rendered ${renders}`;
    highlight();
  } catch (error) {
    if (mine === latest) status.textContent = `render error: ${(error as Error).message}`;
  }
}

/** Re-render 150 ms after the last edit. */
function schedulePreview(text: string): void {
  clearTimeout(timer);
  timer = setTimeout(() => void renderPreview(text), 150);
}

// No top-level await: the lazily loaded chunks (the facet, the config schema) import shared
// code from the entry chunk, which would wait on this module and deadlock.
async function start(): Promise<EditorView> {
  // One service could serve several editors; each editor's document closes with it.
  const service = createLanguageService();
  const uri = 'memory://example/diagram.mmd';
  const view = new EditorView({
    parent: document.getElementById('editor')!,
    state: EditorState.create({
      doc: INITIAL,
      extensions: [
        lineNumbers(),
        foldGutter(),
        lintGutter(),
        history(),
        closeBrackets(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap]),
        await mermaid({
          service,
          uri,
          onCursorAst: (ids) => {
            cursorIds = ids;
            highlight();
          },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) schedulePreview(u.state.doc.toString());
        }),
      ],
    }),
  });

  preview.addEventListener('click', (event) => {
    const el = (event.target as Element).closest('[data-ast]');
    const id = el?.getAttribute('data-ast');
    if (id) selectAst(view, id);
  });

  schedulePreview(INITIAL);
  Object.assign(window, { editor: view, service, uri });
  return view;
}

void start();
