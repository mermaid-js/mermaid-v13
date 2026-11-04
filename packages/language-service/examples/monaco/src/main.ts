/**
 * The example editor (D98): Monaco with the Mermaid language service, and a live v13 preview.
 * Moving the cursor outlines the preview elements of the AST node under it (`[data-ast]`,
 * innermost first); clicking a preview element moves the cursor to its source.
 */
import { registerMermaid, revealAst, trackAst } from '@mermaid-js/language-service-monaco';
import type { AstId } from '@mermaid-js/language-service';
import mermaid from 'mermaid';
import { monaco } from './monaco.ts';

const INITIAL = `---
title: It's a demo
---
flowchart LR
  Start --> Ready{Ready?}
  Ready -->|Yes| Build
  subgraph Ship [Ship it]
    Build --> Done
  end
`;

/**
 * Set up and render. Not top-level `await`: the lazily loaded chunks (facet, schema, diagram)
 * import from the entry chunk, and a top-level await there would wait on them forever.
 */
async function start(): Promise<void> {
  const { service } = await registerMermaid(monaco);

  monaco.editor.defineTheme('mermaid-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'node', foreground: '7a3e9d' },
      { token: 'subgraph', foreground: '0b6e4f', fontStyle: 'bold' },
      { token: 'class', foreground: 'a3500b' },
      { token: 'enumMember', foreground: '0070c1' },
    ],
    colors: {},
  });

  const editor = monaco.editor.create(document.getElementById('editor')!, {
    value: INITIAL,
    language: 'mermaid',
    theme: 'mermaid-light',
    'semanticHighlighting.enabled': true,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
  });

  const preview = document.getElementById('preview')!;
  const status = document.getElementById('status')!;
  let active: readonly AstId[] = [];

  /** Outline the preview elements of the innermost id at the cursor that has any. */
  function highlight(): void {
    const elements = [...preview.querySelectorAll<SVGElement>('[data-ast]')];
    for (const el of elements) el.classList.remove('ast-active');
    const id = active.find((a) => elements.some((el) => el.getAttribute('data-ast') === a));
    for (const el of elements)
      if (el.getAttribute('data-ast') === id) el.classList.add('ast-active');
    if (id === undefined) delete preview.dataset.activeAst;
    else preview.dataset.activeAst = id;
  }

  let renders = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function render(): Promise<void> {
    const n = ++renders;
    try {
      const { svg } = await mermaid.render('preview-svg', editor.getValue());
      if (n !== renders) return;
      preview.innerHTML = svg;
      status.textContent = '';
      highlight();
    } catch (error) {
      if (n === renders)
        status.textContent = error instanceof Error ? error.message : String(error);
    }
    if (n === renders) preview.dataset.rendered = String(n);
  }

  editor.onDidChangeModelContent(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void render(), 200);
  });
  trackAst(editor, service, (ids) => {
    active = ids;
    highlight();
  });
  preview.addEventListener('click', (event) => {
    const el = (event.target as Element).closest('[data-ast]');
    const id = el?.getAttribute('data-ast');
    if (id) revealAst(editor, service, id);
  });

  await render();
  // For the Playwright spec (e2e/browser/monaco-editor.spec.ts).
  Object.assign(window, { monaco, editor, service });
}

void start();
