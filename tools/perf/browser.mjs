/* global Image, document, window, requestAnimationFrame -- Playwright evaluate callbacks execute in Chromium. */
/** Pinned Chromium render/insert/getBBox diagnostics and zero-tolerance RGBA gate. */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { platform, release } from 'node:os';
import { parseArgs } from 'node:util';
import { verifyArtifacts } from './build.mjs';
import { digest } from './evaluate.mjs';
import { envelope, verifyPairPins } from './gates.mjs';

async function evaluatePage(page, callback, argument) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(callback, argument),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Browser operation timed out after 30000 ms')),
          30000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export const SETTINGS = Object.freeze({
  viewport: { width: 1600, height: 1200 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  reducedMotion: 'reduce',
  locale: 'en-US',
  timezoneId: 'UTC',
  headless: true,
  args: ['--font-render-hinting=none', '--disable-lcd-text'],
  screenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
});
function fontInventory() {
  const paths =
    platform() === 'darwin'
      ? ['/System/Library/Fonts', '/Library/Fonts', resolve(process.env.HOME, 'Library/Fonts')]
      : [
          '/usr/share/fonts',
          '/usr/local/share/fonts',
          resolve(process.env.HOME, '.local/share/fonts'),
        ];
  const files = [];
  function walk(path) {
    for (const name of readdirSync(path).sort()) {
      const file = resolve(path, name);
      const stat = statSync(file);
      if (stat.isDirectory()) walk(file);
      else if (/\.(ttf|otf|ttc|woff2?)$/i.test(file))
        files.push({ path: file, sha256: digest(readFileSync(file)) });
    }
  }
  for (const path of paths) if (existsSync(path)) walk(path);
  if (!files.length) throw new Error('No pinned fonts found');
  return files;
}
export async function createBrowserPin() {
  const executablePath = chromium.executablePath();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: SETTINGS.args,
    timeout: 10000,
  });
  try {
    return {
      version: browser.version(),
      executablePath,
      executableSha256: digest(readFileSync(executablePath)),
      os: { platform: platform(), release: release() },
      fonts: fontInventory(),
      settings: SETTINGS,
    };
  } finally {
    await browser.close();
  }
}
export function verifyBrowserPin(pin) {
  if (
    !pin ||
    JSON.stringify(pin.settings) !== JSON.stringify(SETTINGS) ||
    pin.os?.platform !== platform() ||
    pin.os?.release !== release()
  )
    throw new Error('Browser settings/OS pin mismatch');
  if (digest(readFileSync(pin.executablePath)) !== pin.executableSha256)
    throw new Error('Browser executable pin mismatch');
  if (JSON.stringify(fontInventory()) !== JSON.stringify(pin.fonts))
    throw new Error('Font inventory pin mismatch');
}
export function comparePixels(base, head) {
  for (const value of [base, head])
    if (
      !Number.isSafeInteger(value.width) ||
      value.width <= 0 ||
      !Number.isSafeInteger(value.height) ||
      value.height <= 0 ||
      value.data.length !== value.width * value.height * 4
    )
      throw new Error('Invalid RGBA pixels');
  const hash = (value) =>
    digest(
      Buffer.concat([Buffer.from(`${value.width}:${value.height}:`), Buffer.from(value.data)])
    );
  const baseSha256 = hash(base);
  const headSha256 = hash(head);
  return { equal: baseSha256 === headSha256, baseSha256, headSha256 };
}
async function serve(manifests) {
  const permitted = new Set(manifests.flatMap((m) => m.artifacts.map((a) => a.path)));
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path === '/') {
      response.setHeader('content-type', 'text/html');
      response.end(
        '<!doctype html><html><head></head><body style="margin:0;background:white"><div id="mount"></div></body></html>'
      );
      return;
    }
    const file = path.slice(1);
    if (!permitted.has(file)) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.setHeader(
      'content-type',
      extname(file) === '.mjs' ? 'text/javascript' : 'application/octet-stream'
    );
    response.end(readFileSync(file));
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
export async function capture(page) {
  const png = await page.locator('#mount > svg').screenshot(SETTINGS.screenshot);
  return evaluatePage(
    page,
    async (encoded) => {
      const img = new Image();
      img.src = `data:image/png;base64,${encoded}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return {
        width: img.width,
        height: img.height,
        data: [...ctx.getImageData(0, 0, img.width, img.height).data],
      };
    },
    png.toString('base64')
  );
}
export async function runBrowser({
  manifest,
  headManifest = manifest,
  records,
  indices,
  out,
  policy,
  pins,
  scope = 'formal',
  browserPin = policy?.browser,
}) {
  const base = verifyArtifacts(manifest);
  const head = verifyArtifacts(headManifest);
  verifyPairPins(base, head, pins);
  verifyBrowserPin(browserPin);
  if (scope === 'formal' && (records.length !== 5000 || indices.length !== 500))
    throw new Error('Formal browser gate requires the fixed 500 of 5000');
  if (
    new Set(indices).size !== indices.length ||
    indices.some((x) => !Number.isInteger(x) || x < 0 || x >= records.length)
  )
    throw new Error('Invalid browser subset');
  if (!out) throw new Error('Private output directory is required for raw pixel evidence');
  mkdirSync(resolve(out, 'pixels'), { recursive: true });
  const { server, origin } = await serve([base, head]);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: browserPin.executablePath,
      args: SETTINGS.args,
      timeout: 10000,
    });
    if (browser.version() !== browserPin.version) throw new Error('Chromium version pin mismatch');
    const context = await browser.newContext({
      viewport: SETTINGS.viewport,
      deviceScaleFactor: 1,
      colorScheme: SETTINGS.colorScheme,
      reducedMotion: SETTINGS.reducedMotion,
      locale: SETTINGS.locale,
      timezoneId: SETTINGS.timezoneId,
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(origin + '/')
        ? route.continue()
        : route.abort()
    );
    const pages = [];
    for (const [kind, artifact] of [
      ['base', base.entries.v13.timing.entry],
      ['head', head.entries.v13.timing.entry],
      ['pele', base.entries.pele.timing.entry],
    ]) {
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await page.goto(origin);
      await evaluatePage(
        page,
        async ({ entry, source }) => {
          window.engine = await import(entry);
          window.engine.configure();
          await window.engine.setup(source);
          await document.fonts.ready;
        },
        { entry: `${origin}/${artifact}`, source: records[indices[0]].source }
      );
      pages.push({ kind, page });
    }
    const pixelRows = [];
    const measurements = [];
    for (const index of indices) {
      const images = {};
      for (const { kind, page } of pages) {
        await evaluatePage(
          page,
          async ({ source, index: diagramIndex }) => {
            await window.engine.setup(source);
            for (let warmup = 0; warmup < 3; warmup++) {
              window.engine.reset();
              window.engine.render(source, diagramIndex);
            }
            await document.fonts.ready;
          },
          { source: records[index].source, index }
        );
        const measurement = await evaluatePage(
          page,
          async ({ source, index: diagramIndex }) => {
            window.engine.reset();
            const start = performance.now();
            const svg = window.engine.render(source, diagramIndex);
            const rendered = performance.now();
            const mount = document.getElementById('mount');
            mount.innerHTML = svg;
            const inserted = performance.now();
            const root = mount.querySelector('svg');
            if (!root) throw new Error('Render did not produce SVG');
            const box = root.getBBox();
            const bounded = performance.now();
            await document.fonts.ready;
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            if (root.getAnimations({ subtree: true }).length)
              throw new Error('Animated output cannot pass a static pixel gate');
            return {
              renderMs: rendered - start,
              insertMs: inserted - rendered,
              getBBoxMs: bounded - inserted,
              box: { x: box.x, y: box.y, width: box.width, height: box.height },
            };
          },
          { source: records[index].source, index }
        );
        measurements.push({ index, kind, ...measurement });
        if (kind !== 'pele') images[kind] = await capture(page);
      }
      const raw = {};
      for (const kind of ['base', 'head']) {
        const path = resolve(out, 'pixels', `${index}-${kind}.rgba`);
        const data = Buffer.from(images[kind].data);
        writeFileSync(path, data, { flag: 'wx' });
        raw[kind] = {
          path,
          width: images[kind].width,
          height: images[kind].height,
          sha256: digest(data),
        };
      }
      pixelRows.push({ index, ...comparePixels(images.base, images.head), raw });
    }
    verifyArtifacts(base);
    verifyArtifacts(head);
    verifyBrowserPin(browserPin);
    const result = {
      pixels: envelope('pixels', pins, scope, {
        browserPinSha256: digest(JSON.stringify(browserPin)),
        indicesSha256: digest(JSON.stringify(indices)),
        records: pixelRows,
      }),
      metrics: {
        scope,
        method: 'separate render, DOM insertion, getBBox; Pele defaults; diagnostic only',
        records: measurements,
      },
      browserPin,
    };
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(resolve(out, 'browser.json'), JSON.stringify(result) + '\n', { flag: 'wx' });
    }
    return result;
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      pin: { type: 'boolean' },
      base: { type: 'string' },
      head: { type: 'string' },
      out: { type: 'string' },
      pins: { type: 'string' },
      'browser-pin': { type: 'string' },
      rehearsal: { type: 'boolean' },
      limit: { type: 'string' },
    },
  });
  if (values.pin) {
    writeFileSync(values.out, JSON.stringify(await createBrowserPin(), null, 2) + '\n', {
      flag: 'wx',
    });
  } else {
    const { readSample } = await import('./common.mjs');
    const sample = await readSample();
    if (values.limit && !values.rehearsal) throw new Error('Limit requires --rehearsal');
    await runBrowser({
      manifest: values.base,
      headManifest: values.head,
      records: sample.records,
      indices: values.limit ? sample.indices.slice(0, Number(values.limit)) : sample.indices,
      out: values.out,
      pins: JSON.parse(readFileSync(values.pins, 'utf8')),
      browserPin: JSON.parse(readFileSync(values['browser-pin'], 'utf8')),
      scope: values.rehearsal ? 'rehearsal' : 'formal',
    });
  }
}
