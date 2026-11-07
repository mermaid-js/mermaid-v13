/**
 * The Monaco example editor (#36, D98) in a real browser: the example is built with Vite
 * (which also proves the service's dynamic import of the flowchart facet builds) and served
 * with `vite preview`. Scenario as the CodeMirror example's: type an error and see the
 * diagnostic, complete a node id, hover, fold a subgraph, click the preview to move the
 * cursor; plus cursor → preview highlight and the Monarch front-matter state.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startExample } from './example-server.ts';
import type { ExampleServer } from './example-server.ts';

/** The parts of the page's globals the spec reads (set by the example's main.ts). */
interface EditorWindow {
  editor: {
    getValue(): string;
    getPosition(): { lineNumber: number; column: number };
    setPosition(p: { lineNumber: number; column: number }): void;
    setValue(text: string): void;
    executeEdits(
      source: string,
      edits: {
        range: {
          startLineNumber: number;
          startColumn: number;
          endLineNumber: number;
          endColumn: number;
        };
        text: string;
      }[]
    ): boolean;
    focus(): void;
    trigger(source: string, id: string, args: unknown): void;
    getScrolledVisiblePosition(p: { lineNumber: number; column: number }): {
      top: number;
      left: number;
      height: number;
    };
    getDomNode(): HTMLElement;
  };
  monaco: {
    editor: {
      getModelMarkers(filter: object): { message: string; startLineNumber: number }[];
      tokenize(text: string, languageId: string): { type: string; offset: number }[][];
    };
  };
}

// One build and one preview server for the file.
test.describe.configure({ mode: 'serial' });

let example: ExampleServer;
test.beforeAll(async () => {
  test.setTimeout(180_000);
  example = await startExample('monaco');
});
test.afterAll(async () => {
  await example?.close();
});

/** The Monarch token types of each line of `text` (the page's current definition). */
const tokenTypes = (page: Page, text: string) =>
  page.evaluate(
    (t) =>
      (window as unknown as EditorWindow).monaco.editor
        .tokenize(t, 'mermaid')
        .map((line) => line.map((x) => x.type)),
    text
  );

async function open(page: Page): Promise<void> {
  await page.goto(example.origin);
  await page.waitForFunction(() => 'editor' in window);
  await expect(page.locator('#preview svg')).toBeVisible();
  // The initial flowchart's Monarch file is loaded on demand (D134).
  await expect
    .poll(async () => (await tokenTypes(page, 'flowchart LR\n'))[0]?.[0])
    .toBe('keyword.mermaid-flowchart');
}

/** Put the cursor at `line`/`column` (1-based) and focus the editor. */
async function moveTo(page: Page, lineNumber: number, column: number): Promise<void> {
  await page.evaluate(
    (p) => {
      const { editor } = window as unknown as EditorWindow;
      editor.focus();
      editor.setPosition(p);
    },
    { lineNumber, column }
  );
}

/** The page coordinates of `line`/`column` in the editor. */
async function pointAt(page: Page, lineNumber: number, column: number) {
  return page.evaluate(
    (p) => {
      const { editor } = window as unknown as EditorWindow;
      const v = editor.getScrolledVisiblePosition(p);
      const box = editor.getDomNode().getBoundingClientRect();
      return { x: box.left + v.left + 3, y: box.top + v.top + v.height / 2 };
    },
    { lineNumber, column }
  );
}

const value = (page: Page) =>
  page.evaluate(() => (window as unknown as EditorWindow).editor.getValue());
const lineText = async (page: Page, line: number) => (await value(page)).split('\n')[line - 1];

test('typing an error shows its diagnostic', async ({ page }) => {
  await open(page);
  await moveTo(page, 9, 6); // after `  end`
  await page.keyboard.press('End');
  await page.keyboard.type('\n  Oops[unclosed');
  // Monaco may auto-close the bracket; take the `]` away again.
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await lineText(page, 10)).trim()).toBe('Oops[unclosed');
  await expect(page.locator('.squiggly-error').first()).toBeVisible();
  const markers = await page.evaluate(() =>
    (window as unknown as EditorWindow).monaco.editor.getModelMarkers({})
  );
  expect(markers.map((m) => m.message).join('\n')).toMatch(/Unclosed node label/);
  await expect(page.locator('#status')).not.toBeEmpty();
});

test('completes a node id and a keyword from the service', async ({ page }) => {
  await open(page);
  await moveTo(page, 9, 6);
  await page.keyboard.press('End');
  await page.keyboard.type('\n  Done --> Bu');
  await page.keyboard.press('Control+Space');
  const widget = page.locator('.suggest-widget');
  const first = widget.locator('.monaco-list-row').first();
  await expect(first).toContainText('Build');
  // The service's kind for a node id (a variable), not a word-based suggestion's.
  await expect(first.locator('.codicon-symbol-variable')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lineText(page, 10)).trim()).toBe('Done --> Build');

  // A keyword the text does not contain: only the service offers it.
  await page.keyboard.type('\n  cli');
  await page.keyboard.press('Control+Space');
  const click = widget.locator('.monaco-list-row', { hasText: 'click' });
  await expect(click).toHaveCount(1);
  await expect(click.locator('.codicon-symbol-keyword')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lineText(page, 11)).trim()).toBe('click');
});

test('hover shows the node docs', async ({ page }) => {
  await open(page);
  const p = await pointAt(page, 5, 14); // `Ready` in `Start --> Ready{Ready?}`
  const hover = page.locator('.monaco-hover:not(.hidden)');
  // Monaco shows a hover after the pointer rests over a word; move in until it does.
  await expect(async () => {
    await page.mouse.move(p.x - 40, p.y + 60);
    await page.mouse.move(p.x, p.y, { steps: 5 });
    await expect(hover).toContainText('node', { timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(hover).toContainText('Ready');
});

test('folds a subgraph and the front matter with the service ranges', async ({ page }) => {
  await open(page);
  await moveTo(page, 7, 3); // `subgraph Ship`
  await page.evaluate(() =>
    (window as unknown as EditorWindow).editor.trigger('spec', 'editor.fold', {})
  );
  await expect(page.locator('.view-line', { hasText: 'Build --> Done' })).toHaveCount(0);
  // Indentation folding would not fold here: `---` and `title:` have the same indent.
  await moveTo(page, 1, 1);
  await page.evaluate(() =>
    (window as unknown as EditorWindow).editor.trigger('spec', 'editor.fold', {})
  );
  await expect(page.locator('.view-line', { hasText: 'title:' })).toHaveCount(0);
});

test('the cursor highlights the preview, and a click on the preview moves the cursor', async ({
  page,
}) => {
  await open(page);
  await moveTo(page, 5, 14);
  await expect(page.locator('#preview')).toHaveAttribute('data-active-ast', 'n:Ready');
  await expect(page.locator('#preview [data-ast="n:Ready"]')).toHaveClass(/ast-active/);

  await page.locator('#preview [data-ast="n:Done"]').click();
  const position = await page.evaluate(() =>
    (window as unknown as EditorWindow).editor.getPosition()
  );
  expect(position).toEqual({ lineNumber: 8, column: 15 }); // `Done` in `Build --> Done`
  await expect(page.locator('#preview')).toHaveAttribute('data-active-ast', 'n:Done');
});

test('Monarch reads front matter as front matter', async ({ page }) => {
  await open(page);
  const tokens = await page.evaluate(() =>
    (window as unknown as EditorWindow).monaco.editor.tokenize(
      "---\ntitle: it's (open\n---\nflowchart LR\n  A --> B\n",
      'mermaid'
    )
  );
  // Front matter is shared by every type: read before the type is known (D134).
  expect(tokens[0]?.[0]?.type).toBe('annotation.mermaid');
  expect(tokens[1]?.[0]?.type).toBe('variable.mermaid');
  expect(tokens[3]?.[0]?.type).toBe('keyword.mermaid-flowchart');
  expect(tokens[4]?.map((t) => t.type)).toContain('operator.mermaid-flowchart');
});

test('Monarch: front matter after blank lines or indented, and modes a line break ends', async ({
  page,
}) => {
  await open(page);
  const lastLine = (text: string) =>
    page.evaluate((t) => {
      const lines = (window as unknown as EditorWindow).monaco.editor.tokenize(t, 'mermaid');
      return lines[lines.length - 2]?.map((x) => x.type) ?? [];
    }, text);
  for (const text of [
    "\n---\ntitle: it's (open\n---\nflowchart LR\n  A --> B\n",
    "  ---\n  title: it's (open\n  ---\nflowchart LR\n  A --> B\n",
    // `graph` with no direction: its mode ends at the line break.
    'graph\n  A --> B\n',
  ]) {
    // `A --> B`: two node ids and an arrow, not one string or direction run.
    const types = (await lastLine(text)).filter((t) => t !== '');
    expect(types, JSON.stringify(text)).toEqual([
      'variable.mermaid-flowchart',
      'operator.mermaid-flowchart',
      'variable.mermaid-flowchart',
    ]);
  }
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
  radar: 'radar-beta\n  axis A, B\n',
  cynefin: 'cynefin-beta\n  complex\n    "Probe"\n',
};

/** The highlighter chunks the page has loaded (`<id>.monarch-<hash>.js`). */
const monarchChunks = (page: Page) =>
  page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => /\/(\w+)\.monarch-[\w-]+\.js$/.exec(e.name)?.[1])
      .filter((id): id is string => id !== undefined)
      .sort()
  );

/** The colour the first view line's `word` is painted in. */
const wordColour = (page: Page, word: string) =>
  page.evaluate((w) => {
    const span = [...document.querySelectorAll('.view-line span span')].find(
      (s) => s.textContent?.trim() === w
    );
    return span && getComputedStyle(span).color;
  }, word);

test('a flowchart-only page loads no other type’s Monarch file', async ({ page }) => {
  await open(page);
  expect(await monarchChunks(page)).toEqual(['flowchart']);
});

for (const [id, text] of Object.entries(TYPE_DOCS)) {
  test(`first paint colours a ${id} document with its own grammar`, async ({ page }) => {
    await open(page);
    await page.evaluate((t) => (window as unknown as EditorWindow).editor.setValue(t), text);
    await expect.poll(async () => (await tokenTypes(page, text))[0]?.[0]).toBe(`keyword.mermaid-${id}`);
    const types = (await tokenTypes(page, text)).flat().filter((t) => t !== '');
    expect(types.every((t) => t.endsWith(`.mermaid-${id}`))).toBe(true);
    // Painted: the header in the theme's keyword colour (vs: #0000ff).
    await expect.poll(() => wordColour(page, text.split(/\s/)[0]!)).toBe('rgb(0, 0, 255)');
    expect(await monarchChunks(page)).toContain(id);
  });
}

test('a type with no highlighter gets no first-paint colours, not flowchart’s', async ({
  page,
}) => {
  await open(page);
  const unported = 'requirementDiagram\n  element E {\n  }\n';
  await page.evaluate((t) => (window as unknown as EditorWindow).editor.setValue(t), unported);
  // Past the debounce that re-detects the model's type.
  await page.waitForTimeout(500);
  expect((await tokenTypes(page, unported)).flat().filter((t) => t !== '')).toEqual([]);
});

test('editing the header back after a type with no highlighter colours it again', async ({
  page,
}) => {
  await open(page);
  const header = (text: string, from: string) =>
    page.evaluate(
      ([t, f]) =>
        (window as unknown as EditorWindow).editor.executeEdits('e2e', [
          {
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: f.length + 1 },
            text: t,
          },
        ]),
      [text, from] as const
    );
  await page.evaluate(
    (t) => (window as unknown as EditorWindow).editor.setValue(t),
    TYPE_DOCS.flowchart!
  );
  await expect.poll(() => wordColour(page, 'flowchart')).toBe('rgb(0, 0, 255)');
  // `flowchart LR` → `requirementDiagram`: the same body is now a type with no Monarch file.
  await header('requirementDiagram', 'flowchart LR');
  await page.waitForTimeout(500);
  expect(await wordColour(page, 'requirementDiagram')).not.toBe('rgb(0, 0, 255)');
  // And back: re-picked from the edited line, coloured as a flowchart again.
  await header('flowchart LR', 'requirementDiagram');
  await expect.poll(() => wordColour(page, 'flowchart')).toBe('rgb(0, 0, 255)');
  const text = await page.evaluate(() => (window as unknown as EditorWindow).editor.getValue());
  expect((await tokenTypes(page, text))[0]?.[0]).toBe('keyword.mermaid-flowchart');
});
