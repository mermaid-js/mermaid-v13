// cspell:words mathjax newcm boldsymbol mathbb mathcal mathfrak widehat Svgs
/**
 * Spike M1 #244 evidence: typesets the math corpus with `typeset` in Node and in Chromium,
 * Firefox and WebKit pages, and prints as JSON lines: byte identity with Node, time per
 * formula, the engine's bundle size, and how far each flattened box is, in pixels, from
 * MathJax's own SVG for the same TeX (drawn side by side in Chromium).
 *
 *   pnpm exec tsx --conditions=mermaid-source packages/plugin-math/scripts/spike-evidence.ts
 */
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';
import type { LiteElement } from '@mathjax/src/js/adaptors/lite/Element.js';
import { streamWriter, type SvgWriter } from '@mermaid-js/core/svg';
import type { MathBox, MathFragment } from '../src/engine.ts';
import { corpus, extra } from './corpus.ts';

// Timed first, so that nothing else has loaded MathJax yet.
const importStart = performance.now();
const { typeset } = await import('../src/engine.ts');
const importMs = performance.now() - importStart;
const firstStart = performance.now();
typeset('x', { ex: 8 });
const firstCallMs = performance.now() - firstStart;

const EX = 8;
const RUNS = 5;
const formulas = [...corpus, ...extra];
/**
 * MathJax's SVG output imports its default font (New Computer Modern) through the
 * `#default-font/*` package import; MathJax's own builds alias it. This points it at the TeX font.
 */
const texDefaultFont: Plugin = {
  name: 'tex-default-font',
  setup(b) {
    b.onResolve({ filter: /^#default-font\// }, (args) =>
      b.resolve(args.path.replace('#default-font/', '@mathjax/mathjax-tex-font/js/'), {
        kind: args.kind,
        resolveDir: args.resolveDir,
      })
    );
  },
};
const out = (line: unknown) => process.stdout.write(`${JSON.stringify(line)}\n`);

function write(w: SvgWriter, node: MathFragment): void {
  if (!node.children?.length) return w.leaf(node.tag, node.attrs);
  w.open(node.tag, node.attrs);
  for (const child of node.children) {
    if (typeof child === 'string') w.text(child);
    else write(w, child);
  }
  w.close();
}

/** The box as a standalone SVG document, through core's writer. */
function svgDocument(box: MathBox): string {
  const w = streamWriter();
  w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, box.width, box.height] });
  write(w, box.node);
  w.close();
  return w.finish();
}

// The same logic runs in Node and, stringified, in the page.
function measure(
  fn: (tex: string, o: { ex: number }) => unknown,
  list: string[],
  runs: number,
  ex: number
) {
  return list.map((tex) => {
    const output = JSON.stringify(fn(tex, { ex })); // also the warm-up call
    const times: number[] = [];
    for (let r = 0; r < runs; r++) {
      const start = performance.now();
      fn(tex, { ex });
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return { tex, output, medianMs: times[Math.floor(times.length / 2)] ?? 0 };
  });
}

/** MathJax's own SVG for the same TeX (same packages and font), with px sizes, for the pixel check. */
async function mathjaxSvgs(): Promise<string[]> {
  const { liteAdaptor } = await import('@mathjax/src/js/adaptors/liteAdaptor.js');
  const { RegisterHTMLHandler } = await import('@mathjax/src/js/handlers/html.js');
  const { mathjax } = await import('@mathjax/src/js/mathjax.js');
  const { TeX } = await import('@mathjax/src/js/input/tex.js');
  const { SVG } = await import('@mathjax/src/js/output/svg.js');
  const { MathJaxTexFont } = await import('@mathjax/mathjax-tex-font/js/svg.js');
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const input = new TeX({
    // The engine's packages; `mermaid-katex` is registered once the engine has started.
    packages: ['base', 'ams', 'boldsymbol', 'cancel', 'color', 'enclose', 'mermaid-katex'],
  });
  const output = new SVG({ fontCache: 'none', fontData: MathJaxTexFont });
  const doc = mathjax.document('', { InputJax: input, OutputJax: output });
  return formulas.map((tex) => {
    const box = typeset(tex, { ex: EX });
    const container: unknown = doc.convert(tex, {
      display: true,
      em: 2 * EX,
      ex: EX,
      containerWidth: 1e6,
    });
    const svg = adaptor.firstChild(container as LiteElement) as LiteElement;
    adaptor.setAttribute(svg, 'width', String(box.width));
    adaptor.setAttribute(svg, 'height', String(box.height));
    adaptor.removeAttribute(svg, 'style');
    return adaptor.outerHTML(svg);
  });
}

/** Draws both SVGs at 4× on canvases in the page and counts pixels whose coverage differs. */
async function pixelDiff(
  page: Page,
  pairs: { ours: string; theirs: string; w: number; h: number }[]
) {
  return page.evaluate(async (list) => {
    const SCALE = 4;
    const draw = async (svg: string, w: number, h: number) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(w * SCALE);
      canvas.height = Math.ceil(h * SCALE);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const results = [];
    for (const { ours, theirs, w, h } of list) {
      const a = await draw(ours, w, h);
      const b = await draw(theirs, w, h);
      let ink = 0;
      let off = 0;
      for (let i = 3; i < a.length; i += 4) {
        if ((a[i] as number) > 0 || (b[i] as number) > 0) ink++;
        if (Math.abs((a[i] as number) - (b[i] as number)) > 128) off++;
      }
      results.push({ inkPixels: ink, differing: off, ratio: ink ? off / ink : 0 });
    }
    return results;
  }, pairs);
}

async function main() {
  const node = measure(typeset, formulas, RUNS, EX);
  out({ host: `node ${process.version}`, importMs, firstCallMs, formulas: node.length });

  const entry = fileURLToPath(new URL('./spike-browser-entry.ts', import.meta.url));
  const engineEntry = fileURLToPath(new URL('../src/engine.ts', import.meta.url));
  for (const texDefault of [false, true]) {
    const sized = await build({
      entryPoints: [engineEntry],
      bundle: true,
      format: 'esm',
      minify: true,
      write: false,
      metafile: true,
      conditions: ['mermaid-source'],
      logLevel: 'silent',
      plugins: texDefault ? [texDefaultFont] : [],
    });
    const min = sized.outputFiles[0]!.contents;
    const inputs = Object.entries(sized.metafile.outputs)[0]![1].inputs;
    const share = (re: RegExp) =>
      Object.entries(inputs)
        .filter(([path]) => re.test(path))
        .reduce((s, [, v]) => s + v.bytesInOutput, 0);
    out({
      bundle: texDefault ? 'engine, #default-font → mathjax-tex' : 'engine, as published',
      minBytes: min.length,
      gzBytes: gzipSync(min, { level: 9 }).length,
      texFontMinBytes: share(/mathjax-tex-font/),
      newcmFontMinBytes: share(/mathjax-newcm-font/),
      mathjaxMinBytes: share(/@mathjax\+src|@mathjax\/src/),
      coreMinBytes: share(/packages\/core/),
    });
  }

  const bundle = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    write: false,
    conditions: ['mermaid-source'],
    logLevel: 'silent',
  });
  const script = bundle.outputFiles[0]!.text;
  const theirs = await mathjaxSvgs();
  const pairs = formulas.map((tex, i) => {
    const box = typeset(tex, { ex: EX });
    const ours = svgDocument(box).replace(
      '<svg ',
      `<svg width="${box.width}" height="${box.height}" `
    );
    return { ours, theirs: theirs[i] as string, w: box.width, h: box.height };
  });

  const rows = node.map(
    (r) => ({ tex: r.tex, node: Number(r.medianMs.toFixed(3)) }) as Record<string, unknown>
  );
  for (const type of [chromium, firefox, webkit]) {
    let browser;
    try {
      browser = await type.launch({ timeout: 60_000 });
    } catch (error) {
      out({ host: type.name(), launched: false, error: String(error).split('\n')[0] });
      continue;
    }
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>math spike</title>');
    await page.addScriptTag({ content: script });
    const result = await page.evaluate(
      ([fn, list, runs, ex]) => {
        const spike = (window as unknown as { __mathSpike: { typeset: never } }).__mathSpike;
        // tsx's esbuild wraps named functions in `__name(…)`; the page has no such helper.
        // eslint-disable-next-line @typescript-eslint/no-implied-eval -- spike harness
        const make = new Function('__name', `return (${fn})`) as (
          name: (f: unknown) => unknown
        ) => typeof measure;
        return make((f) => f)(spike.typeset, list, runs, ex);
      },
      [measure.toString(), formulas, RUNS, EX] as const
    );
    const same = result.map((r, i) => r.output === node[i]!.output);
    out({
      host: `${type.name()} ${browser.version()}`,
      formulas: result.length,
      sameBytesAsNode: same.every(Boolean),
      differentFromNode: formulas.filter((_, i) => !same[i]),
      medianMsSum: result.reduce((s, r) => s + r.medianMs, 0),
    });
    result.forEach((r, i) => (rows[i]![type.name()] = Number(r.medianMs.toFixed(3))));
    if (type === chromium) {
      await page.evaluate('globalThis.__name = (f) => f');
      const diffs = await pixelDiff(page, pairs);
      diffs.forEach((d, i) => (rows[i]!.pixelDiff = d));
    }
    await browser.close();
  }
  for (const row of rows) out(row);
}

await main();
