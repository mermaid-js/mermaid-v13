/**
 * The CodeMirror example editor (D98, D99 (5), R-LANG-2): the production Vite build of
 * `packages/language-service/examples/codemirror`, driven like a user. Diagnostics after
 * the ~150 ms debounce, node-id completion, hover, folding a subgraph, and the live preview
 * wired both ways through `astAt` / `data-ast`.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startExample } from './example-server.ts';
import type { ExampleServer } from './example-server.ts';

// One build and one preview server for the file.
test.describe.configure({ mode: 'serial' });

let example: ExampleServer;
test.beforeAll(async () => {
  test.setTimeout(180_000);
  example = await startExample('codemirror');
});
test.afterAll(async () => {
  await example?.close();
});

interface EditorHandle {
  state: {
    doc: { toString(): string; length: number; lineAt(pos: number): { text: string } };
    selection: { main: { head: number } };
  };
  dispatch(spec: unknown): void;
  focus(): void;
  coordsAtPos(pos: number): { left: number; top: number; bottom: number } | null;
}
type EditorWindow = Window & { editor: EditorHandle };

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(example.origin);
  await expect(page.locator('#status')).toHaveText(/rendered/);
  await expect(page.locator('#preview svg')).toBeVisible();
  expect(errors).toEqual([]);
}

/** Put the cursor at the first occurrence of `text` plus `delta`. */
async function cursorAt(page: Page, text: string, delta = 0): Promise<void> {
  await page.evaluate(
    ([t, d]) => {
      const view = (window as unknown as EditorWindow).editor;
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf(t) + d } });
    },
    [text, delta] as const
  );
}

/** The example's initial text (packages/language-service/examples/codemirror/src/main.ts). */
const INITIAL = `flowchart LR
  A[Start] --> B{Ready?}
  B -- yes --> C[Ship it]
  B -- no --> D[Fix]
  subgraph review
    D --> E[Test]
    E --> B
  end
`;

const docText = (page: Page) =>
  page.evaluate(() => (window as unknown as EditorWindow).editor.state.doc.toString());

test('shows a diagnostic for a typed error, after the debounce', async ({ page }) => {
  await open(page);
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(0);
  // Dispatch the edit and look at the DOM 50 ms later, before the 150 ms debounce is over.
  const early = await page.evaluate(async () => {
    const view = (window as unknown as EditorWindow).editor;
    view.dispatch({ changes: { from: view.state.doc.length, insert: '  A --> (\n' } });
    await new Promise((r) => setTimeout(r, 50));
    return document.querySelectorAll('.cm-lintRange-error').length;
  });
  expect(early).toBe(0);
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);
  await page.locator('.cm-lintRange-error').hover();
  await expect(page.locator('.cm-tooltip-lint')).toContainText('Expected a node id');
});

test('completes a node id', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const view = (window as unknown as EditorWindow).editor;
    const end = view.state.doc.length;
    view.focus();
    view.dispatch({ selection: { anchor: end } });
  });
  await page.keyboard.type('  E --> ');
  // CodeMirror's explicit completion key: Ctrl-Space, Alt-` on macOS.
  await page.keyboard.press(process.platform === 'darwin' ? 'Alt+Backquote' : 'Control+Space');
  const list = page.locator('.cm-tooltip-autocomplete');
  await expect(list).toBeVisible();
  for (const id of ['A', 'B', 'C', 'D']) {
    await expect(list.locator('.cm-completionLabel', { hasText: new RegExp(`^${id}$`) })).toHaveCount(1);
  }
  // Pick an item without typing any of it: the whole id comes from the item's apply.
  await list.locator('.cm-completionLabel', { hasText: /^D$/ }).click();
  await expect(list).toBeHidden();
  expect(await docText(page)).toBe(`${INITIAL}  E --> D`);
});

test('hovers a node', async ({ page }) => {
  await open(page);
  const at = await page.evaluate(() => {
    const view = (window as unknown as EditorWindow).editor;
    const pos = view.state.doc.toString().indexOf('B{Ready?}');
    const c = view.coordsAtPos(pos)!;
    return { x: c.left + 3, y: (c.top + c.bottom) / 2 };
  });
  await page.mouse.move(at.x, at.y);
  const tip = page.locator('.cm-tooltip-hover');
  await expect(tip).toContainText('node');
  await expect(tip.locator('code').first()).toHaveText('B');
});

test('folds a subgraph', async ({ page }) => {
  await open(page);
  await expect(page.locator('.cm-line', { hasText: 'D --> E[Test]' })).toBeVisible();
  // The one fold marker: on the `subgraph review` line.
  const marker = page.locator('.cm-foldGutter [title="Fold line"]');
  await expect(marker).toHaveCount(1);
  await marker.click();
  await expect(page.locator('.cm-foldPlaceholder')).toBeVisible();
  await expect(page.locator('.cm-line', { hasText: 'D --> E[Test]' })).toHaveCount(0);
  await expect(page.locator('.cm-line', { hasText: /^\s*end$/ })).toBeVisible();
});

test('the cursor highlights its element in the preview', async ({ page }) => {
  await open(page);
  await cursorAt(page, 'C[Ship it]');
  await expect(page.locator('#preview .ast-current')).toHaveAttribute('data-ast', 'n:C');
  await cursorAt(page, 'D[Fix]');
  await expect(page.locator('#preview .ast-current')).toHaveAttribute('data-ast', 'n:D');
});

test('clicking the preview moves the cursor', async ({ page }) => {
  await open(page);
  await page.locator('#preview [data-ast="n:E"]').click();
  const line = await page.evaluate(() => {
    const view = (window as unknown as EditorWindow).editor;
    const head = view.state.selection.main.head;
    return { text: view.state.doc.lineAt(head).text, rest: view.state.doc.toString().slice(head) };
  });
  expect(line.text).toContain('E[Test]');
  expect(line.rest.startsWith('E[Test]')).toBe(true);
  await expect(page.locator('#preview .ast-current')).toHaveAttribute('data-ast', 'n:E');
});

test('draws semantic tokens, and redraws them after an edit and after unfolding', async ({
  page,
}) => {
  await open(page);
  const node = (text: string) =>
    page.locator('.cm-content .cm-mermaid-node', { hasText: new RegExp(`^${text}$`) });
  await expect(node('A').first()).toBeVisible();
  await expect(page.locator('.cm-mermaid-subgraph', { hasText: 'review' })).toHaveCount(1);
  // Fold, then edit: the debounced rebuild decorates only the visible lines, and the new
  // node gets its class once the snapshot is in.
  await page.locator('.cm-foldGutter [title="Fold line"]').click();
  await expect(page.locator('.cm-foldPlaceholder')).toBeVisible();
  await page.evaluate(() => {
    const view = (window as unknown as EditorWindow).editor;
    view.dispatch({ changes: { from: view.state.doc.length, insert: '  Zed --> A\n' } });
  });
  await expect(node('Zed')).toHaveCount(1);
  // Unfolding decorates the lines that were hidden during that rebuild.
  await page.locator('.cm-foldPlaceholder').click();
  await expect(page.locator('.cm-line', { hasText: 'D --> E[Test]' })).toBeVisible();
  await expect(node('E').first()).toBeVisible();
});

test('closes the document in the shared service when the editor goes away', async ({ page }) => {
  await open(page);
  const open1 = await page.evaluate(() => {
    const w = window as unknown as EditorWindow & {
      service: { get(uri: string): unknown };
      uri: string;
    };
    const before = w.service.get(w.uri) !== undefined;
    (w.editor as unknown as { destroy(): void }).destroy();
    return { before, after: w.service.get(w.uri) !== undefined };
  });
  expect(open1).toEqual({ before: true, after: false });
});

// --- first paint per diagram type (D134, #190) ------------------------------------------

/** One document per v13 type; the header is the first word. */
const TYPE_DOCS: Record<string, string> = {
  flowchart: 'flowchart LR\n  A --> B\n',
  sequence: 'sequenceDiagram\n  Alice->>Bob: Hi\n',
  class: 'classDiagram\n  class Animal\n',
  state: 'stateDiagram-v2\n  [*] --> Idle\n',
  er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n',
  journey: 'journey\n  section Go to work\n  Make tea: 5: Me\n',
  quadrantChart: 'quadrantChart\n  x-axis Low --> High\n',
  timeline: 'timeline\n  section Early\n  2002 : LinkedIn\n',
  gitGraph: 'gitGraph\n  commit id: "A"\n  branch dev\n',
  pie: 'pie\n  "Dogs" : 386\n',
  info: 'info showInfo\n  title Version\n',
  mindmap: 'mindmap\n  root((Root))\n    A[Square]\n',
  gantt: 'gantt\n  section Build\n  Code :a1, 2024-01-01, 3d\n',
  packet: 'packet\n  0-15: "Source Port"\n',
  radar: 'radar-beta\n  axis A, B\n',
  cynefin: 'cynefin-beta\n  complex\n    "Probe"\n',
};

/** `defaultHighlightStyle`'s keyword colour (#708), which no semantic-token class sets. */
const KEYWORD = 'rgb(119, 0, 136)';

/** The colour the first line's header word is painted in, or `undefined` if not shown. */
const headerColour = (page: Page, word: string) =>
  page.evaluate((w) => {
    const line = document.querySelector('.cm-content .cm-line');
    const walker = document.createTreeWalker(line!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.textContent?.includes(w)) return getComputedStyle(n.parentElement!).color;
    }
    return undefined;
  }, word);

const setDoc = (page: Page, text: string) =>
  page.evaluate((t) => {
    const view = (window as unknown as EditorWindow).editor;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } });
  }, text);

/** The highlighter chunks the page has loaded (`<id>.parser-<hash>.js`). */
const parserChunks = (page: Page) =>
  page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => /\/(\w+)\.parser-[\w-]+\.js$/.exec(e.name)?.[1])
      .filter((id): id is string => id !== undefined)
      .sort()
  );

test('a flowchart-only page loads no other type’s highlighter', async ({ page }) => {
  await open(page);
  await expect.poll(() => headerColour(page, 'flowchart')).toBe(KEYWORD);
  expect(await parserChunks(page)).toEqual(['flowchart']);
});

for (const [id, text] of Object.entries(TYPE_DOCS)) {
  test(`first paint colours a ${id} document with its own grammar`, async ({ page }) => {
    await open(page);
    await setDoc(page, text);
    const header = text.split(/\s/)[0]!;
    await expect.poll(() => headerColour(page, header)).toBe(KEYWORD);
    // Loaded on demand, once the type showed up.
    expect(await parserChunks(page)).toContain(id);
  });
}

test('a type with no highlighter gets no first-paint colours, not flowchart’s', async ({
  page,
}) => {
  await open(page);
  await setDoc(page, 'requirementDiagram\n  element E {\n  }\n');
  // Past the debounce, so semantic tokens (none for requirementDiagram) would have come too.
  await page.waitForTimeout(500);
  expect(await headerColour(page, 'requirementDiagram')).not.toBe(KEYWORD);
  // Back to a flowchart: re-picked, coloured again.
  await setDoc(page, TYPE_DOCS.flowchart!);
  await expect.poll(() => headerColour(page, 'flowchart')).toBe(KEYWORD);
});
