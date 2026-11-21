/**
 * The DOM adapter in a real browser (#16): `run()` replaces `.mermaid` elements and puts the
 * error image in place of a failing diagram (R-API-6, R-ERR-3), `mount()` re-renders on resize
 * only with `availableWidth`, re-measures after a web font loads and leaves theme changes to
 * CSS (R-API-7, R-TEXT-5, R-THEME-3), and extension `afterMount` hooks run after insertion.
 */
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const VALID = 'flowchart LR\n  A[Start] --> B{Choice}\n  B -- yes --> C[(Store)]';
const WIDE =
  'flowchart LR\n  A[Alpha node] --> B[Bravo node] --> C[Charlie node] --> D[Delta node] --> E[Echo node] --> F[Foxtrot node]';
const BROKEN = 'flowchart LR\n  A[unclosed --> B';

async function open(page: Page): Promise<void> {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.mermaid?.run === 'function');
}

/** Adds `<pre class="mermaid">` elements with the given sources and returns nothing. */
async function addPres(page: Page, sources: string[]): Promise<void> {
  await page.evaluate((list) => {
    for (const [i, src] of list.entries()) {
      const pre = document.createElement('pre');
      pre.className = 'mermaid';
      pre.id = `d${i}`;
      pre.textContent = src;
      document.body.appendChild(pre);
    }
  }, sources);
}

test.describe('run()', () => {
  test('on load, a broken diagram between two valid ones shows the error image and both valid ones render', async ({
    page,
  }) => {
    await page.goto('/run.html');
    await expect(page.locator('#last > svg')).toHaveCount(1);
    await expect(page.locator('#first > svg.mermaid-flowchart')).toHaveCount(1);
    await expect(page.locator('#last > svg.mermaid-flowchart')).toHaveCount(1);
    await expect(page.locator('#broken > svg.mermaid-error')).toHaveCount(1);
    await expect(page.locator('#broken')).toContainText('Syntax error in text');
    for (const id of ['first', 'broken', 'last']) {
      await expect(page.locator(`#${id}`)).toHaveAttribute('data-processed', 'true');
    }
    // The rendered svgs carry class `mermaid` too; they are never taken as sources.
    await page.evaluate(() => window.mermaid.run());
    await expect(page.locator('.mermaid svg svg')).toHaveCount(0);
  });

  test('carries on after a failure and rejects with the first MermaidError at the end', async ({
    page,
  }) => {
    await open(page);
    await addPres(page, [VALID, BROKEN, VALID]);
    const outcome = await page.evaluate(async () => {
      const seen: string[] = [];
      window.mermaid.setParseErrorHandler((e) => seen.push(e.code));
      try {
        await window.mermaid.run();
        return { rejected: false, seen };
      } catch (e) {
        const err = e as { name: string; code: string };
        return { rejected: true, name: err.name, code: err.code, seen };
      }
    });
    expect(outcome).toEqual({
      rejected: true,
      name: 'MermaidError',
      code: 'SYNTAX',
      seen: ['SYNTAX'],
    });
    await expect(page.locator('#d0 > svg.mermaid-flowchart')).toHaveCount(1);
    await expect(page.locator('#d1 > svg.mermaid-error')).toHaveCount(1);
    await expect(page.locator('#d2 > svg.mermaid-flowchart')).toHaveCount(1);
  });

  test('suppressErrors resolves; a processed element is skipped on the next run', async ({
    page,
  }) => {
    await open(page);
    await addPres(page, [BROKEN]);
    await page.evaluate(() => window.mermaid.run({ suppressErrors: true }));
    const first = await page.locator('#d0').innerHTML();
    await page.evaluate(() => window.mermaid.run({ suppressErrors: true }));
    expect(await page.locator('#d0').innerHTML()).toBe(first);
  });

  test('suppressErrorRendering leaves the failing element alone while render() still rejects', async ({
    page,
  }) => {
    await open(page);
    await addPres(page, [VALID, BROKEN]);
    const code = await page.evaluate(async (broken) => {
      window.mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true });
      await window.mermaid.run({ suppressErrors: true });
      try {
        await window.mermaid.render('x', broken);
        return 'resolved';
      } catch (e) {
        return (e as { code: string }).code;
      }
    }, BROKEN);
    expect(code).toBe('SYNTAX');
    await expect(page.locator('#d0 > svg')).toHaveCount(1);
    await expect(page.locator('#d1 > svg')).toHaveCount(0);
    await expect(page.locator('#d1')).toHaveText(BROKEN);
  });

  test('takes nodes, decodes entities and dedents the element text as v12', async ({ page }) => {
    await open(page);
    const ids = await page.evaluate(async () => {
      const div = document.createElement('div');
      div.innerHTML = '\n    flowchart LR\n      A["a &amp; b"] --&gt; B\n  ';
      document.body.appendChild(div);
      const calls: string[] = [];
      const other = document.createElement('div');
      other.textContent = 'flowchart LR\n  X --> Y';
      document.body.appendChild(other);
      await window.mermaid.run({ nodes: [div, other], postRenderCallback: (id) => calls.push(id) });
      return { calls, text: div.querySelector('svg .node text')?.textContent };
    });
    // v12's `mermaid-<n>` ids, one per diagram.
    expect(ids.calls).toEqual(['mermaid-0', 'mermaid-1']);
    expect(ids.text).toBe('a & b');
  });

  test('v12 init(config, element, callback) renders that element only (#764, D643)', async ({
    page,
  }) => {
    await open(page);
    await addPres(page, [VALID, VALID]);
    const calls = await page.evaluate(async () => {
      const seen: string[] = [];
      const el = document.getElementById('d1');
      if (!el) throw new Error('no #d1');
      await window.mermaid.init({ theme: 'dark' }, el, (id) => seen.push(id));
      return seen;
    });
    expect(calls).toHaveLength(1);
    await expect(page.locator('#d1 > svg.mermaid-flowchart')).toHaveCount(1);
    await expect(page.locator('#d0 > svg')).toHaveCount(0);
  });

  test('the v12 startOnLoad property stops contentLoaded() (#764, D643)', async ({ page }) => {
    await open(page);
    await addPres(page, [VALID]);
    // run() marks an element `data-processed` before its first await, so a run would show here.
    const processed = await page.evaluate(() => {
      window.mermaid.startOnLoad = false;
      window.mermaid.contentLoaded();
      return document.getElementById('d0')?.getAttribute('data-processed');
    });
    expect(processed).toBeNull();
    await page.evaluate(() => {
      window.mermaid.startOnLoad = true;
      window.mermaid.contentLoaded();
    });
    await expect(page.locator('#d0 > svg.mermaid-flowchart')).toHaveCount(1);
  });

  test('runs extension afterMount hooks after the SVG is in the element', async ({ page }) => {
    await open(page);
    await addPres(page, [VALID]);
    const seen = await page.evaluate(async () => {
      const calls: string[] = [];
      await window.mermaid.registerExternalDiagrams([
        {
          id: 'probe',
          afterMount(el: Element, result: { diagramType: string }) {
            calls.push(
              `${el.id}:${el.querySelector('svg') ? 'svg' : 'none'}:${result.diagramType}`
            );
          },
        },
      ]);
      await window.mermaid.run();
      return calls;
    });
    expect(seen).toEqual(['d0:svg:flowchart-v2']);
  });
});

test.describe('mount()', () => {
  test('without availableWidth a resize does not re-render', async ({ page }) => {
    await open(page);
    const same = await page.evaluate(async (code) => {
      const el = document.createElement('div');
      el.style.width = '900px';
      document.body.appendChild(el);
      const m = window.mermaid.mount(el, code);
      await m.ready;
      const svg = el.firstElementChild;
      el.style.width = '200px';
      await new Promise((r) => setTimeout(r, 300));
      return svg !== null && el.firstElementChild === svg;
    }, WIDE);
    expect(same).toBe(true);
  });

  test('with availableWidth a resize re-renders to fit the new width', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(async (code) => {
      const el = document.createElement('div');
      el.style.width = '1600px';
      document.body.appendChild(el);
      const m = window.mermaid.mount(el, code, { availableWidth: true });
      const first = await m.ready;
      const svg = el.firstElementChild;
      el.style.width = '300px';
      const deadline = Date.now() + 3000;
      while (el.firstElementChild === svg && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return {
        replaced: el.firstElementChild !== svg,
        before: first.width,
        after: m.result?.width ?? 0,
      };
    }, WIDE);
    expect(out.replaced).toBe(true);
    expect(out.after).toBeLessThan(out.before);
    expect(out.after).toBeLessThanOrEqual(300);
  });

  test('changing a --mermaid-* variable re-themes without re-render', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(async (code) => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const m = window.mermaid.mount(el, code, { config: { theme: 'default' } });
      await m.ready;
      const svg = el.firstElementChild;
      const markup = el.innerHTML;
      const rect = () => getComputedStyle(el.querySelector('svg .node rect, svg .node path')!).fill;
      const before = rect();
      el.style.setProperty('--mermaid-mainBkg', '#ff0000');
      await new Promise((r) => setTimeout(r, 200));
      return {
        before,
        after: rect(),
        same: el.firstElementChild === svg && el.innerHTML === markup,
      };
    }, VALID);
    expect(out.before).toBe('rgb(236, 236, 255)'); // default theme mainBkg #ececff (D570)
    expect(out.after).toBe('rgb(255, 0, 0)');
    expect(out.same).toBe(true);
  });

  test('a failing diagram shows the error image and ready rejects', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(async (code) => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const m = window.mermaid.mount(el, code);
      const code2 = await m.ready.then(
        () => 'resolved',
        (e: { code: string }) => e.code
      );
      return { code: code2, error: el.querySelector('svg.mermaid-error') !== null };
    }, BROKEN);
    expect(out).toEqual({ code: 'SYNTAX', error: true });
  });

  test('update() re-renders with new text and destroy() stops resize re-renders', async ({
    page,
  }) => {
    await open(page);
    const out = await page.evaluate(
      async ({ a, b }) => {
        const el = document.createElement('div');
        el.style.width = '1600px';
        document.body.appendChild(el);
        const m = window.mermaid.mount(el, a, { availableWidth: true });
        await m.ready;
        await m.update(b);
        const afterUpdate = el.querySelectorAll('svg .node').length;
        m.destroy();
        const svg = el.firstElementChild;
        el.style.width = '300px';
        await new Promise((r) => setTimeout(r, 300));
        return { afterUpdate, same: el.firstElementChild === svg };
      },
      { a: VALID, b: WIDE }
    );
    expect(out).toEqual({ afterUpdate: 6, same: true });
  });
});

// A real font file, served late so the first render measures with the fallback (R-TEXT-5).
// Circles are not widened to minNodeWidth, so the drawing's width follows the label.
const FONT = [
  '/System/Library/Fonts/Supplemental/Courier New.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
].find((f) => existsSync(f));

// WebKit fires `loading` on document.fonts but never `loadingdone`; the second case drops
// `loadingdone` so every engine sees what WebKit does.
for (const dropLoadingDone of [false, true]) {
  test(`mount() re-measures after a late web font loads${dropLoadingDone ? ' (no loadingdone event)' : ''}`, async ({
    page,
  }) => {
    test.skip(!FONT, 'no monospace font file on this machine');
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    await page.route('**/late-font.ttf', async (route) => {
      await released;
      await route.fulfill({ body: readFileSync(FONT!), contentType: 'font/ttf' });
    });
    await open(page);
    const widthOf = (sel: string) =>
      page.evaluate((s) => document.querySelector(`${s} > svg`)!.getAttribute('viewBox'), sel);
    await page.evaluate(async (drop) => {
      if (drop) {
        document.fonts.addEventListener('loadingdone', (e) => e.stopImmediatePropagation());
      }
      const style = document.createElement('style');
      style.textContent = '@font-face { font-family: LateFont; src: url(/late-font.ttf); }';
      document.head.appendChild(style);
      const el = document.createElement('div');
      el.id = 'late';
      document.body.appendChild(el);
      const m = window.mermaid.mount(el, 'flowchart LR\n  A((iiiiiiii))', {
        config: { fontFamily: 'LateFont, serif' },
      });
      await m.ready;
      // The SVG asks for LateFont, which starts the (held) download.
      void document.fonts.load('16px LateFont');
    }, dropLoadingDone);
    const early = await widthOf('#late');
    release();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => widthOf('#late')).not.toBe(early);
    // The re-measured width is what a fresh mount measures with the font loaded.
    await page.evaluate(async () => {
      const el = document.createElement('div');
      el.id = 'fresh';
      document.body.appendChild(el);
      await window.mermaid.mount(el, 'flowchart LR\n  A((iiiiiiii))', {
        config: { fontFamily: 'LateFont, serif' },
      }).ready;
    });
    expect(await widthOf('#late')).toBe(await widthOf('#fresh'));
  });
}
