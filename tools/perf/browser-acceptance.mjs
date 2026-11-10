/** Required real Chromium acceptance. A blocked launch is a failure, never a skip. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import {
  createBrowserPin,
  verifyBrowserPin,
  capture,
  comparePixels,
  runBrowser,
  SETTINGS,
} from './browser.mjs';
import { compareOutput } from './gates.mjs';
import { buildArtifacts, verifyArtifacts } from './build.mjs';
import { digest, policySha256 } from './evaluate.mjs';
import { requirePrivate } from './common.mjs';

const { values } = parseArgs({
  options: { manifest: { type: 'string' }, out: { type: 'string' } },
});
if (!values.out) throw new Error('--out must name a fresh private evidence directory');
const out = resolve(values.out);
requirePrivate(out);
mkdirSync(out, { recursive: true });
try {
  const browserPin = await createBrowserPin();
  verifyBrowserPin(browserPin);
  writeFileSync(resolve(out, 'browser-pin.json'), JSON.stringify(browserPin, null, 2) + '\n', {
    flag: 'wx',
  });
  const manifest = values.manifest
    ? verifyArtifacts(values.manifest)
    : (await buildArtifacts({ out: resolve(out, 'build') })).manifest;
  const sources = [
    'graph TD\n A[Alpha] --> B[Beta]',
    'flowchart LR\n subgraph group\n A[One] --> B[Two]\n end',
  ];
  const records = sources.map((source, index) => ({ index, source }));
  const pins = {
    sampleSha256: digest(JSON.stringify(records)),
    browserSubsetSha256: digest('[0,1]'),
    baseSourceSha256: manifest.sourceDigest,
    headSourceSha256: manifest.sourceDigest,
    baseArtifactSha256: manifest.artifactDigest,
    headArtifactSha256: manifest.artifactDigest,
    policySha256,
  };
  const compared = await runBrowser({
    manifest,
    records,
    indices: [0, 1],
    out: resolve(out, 'aa'),
    pins,
    scope: 'rehearsal',
    browserPin,
  });
  assert(
    compared.pixels.records.every((r) => r.equal),
    'Small A/A exact pixels must agree'
  );
  assert.equal(compared.metrics.records.length, 6, 'Base, head and Pele split metrics required');
  const browser = await chromium.launch({
    headless: true,
    executablePath: browserPin.executablePath,
    args: SETTINGS.args,
    timeout: 10000,
  });
  try {
    const page = await browser.newPage({ viewport: SETTINGS.viewport, deviceScaleFactor: 1 });
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" id="m0" width="2" height="1"><rect id="m0-node" class="node" width="2" height="1" fill="white"/></svg>';
    await page.setContent(`<div id="mount">${svg}</div>`);
    const original = await capture(page);
    const changedId = svg.replace('m0-node', 'm0-other');
    await page.setContent(`<div id="mount">${changedId}</div>`);
    assert.equal(
      comparePixels(original, await capture(page)).equal,
      true,
      'An ID-only change keeps pixels'
    );
    assert.equal(
      compareOutput(svg, changedId, 0).surface.equal,
      false,
      'Protected ID-only change must fail'
    );
    await page.setContent(
      `<div id="mount">${svg.replace('</svg>', '<rect x="1" width="1" height="1" fill="black"/></svg>')}</div>`
    );
    const changed = await capture(page);
    assert.equal(comparePixels(original, changed).equal, false, 'One changed pixel must fail');
    for (const [name, image] of [
      ['base', original],
      ['one-pixel-change', changed],
    ])
      writeFileSync(resolve(out, `${name}.rgba`), Buffer.from(image.data), { flag: 'wx' });
  } finally {
    await browser.close();
  }
  const result = {
    complete: true,
    scope: 'rehearsal',
    acceptance: 'passed',
    tests: [
      'real Chromium A/A with Pele',
      'protected ID-only change rejected',
      'one-pixel change rejected',
      'font/browser/settings pins verified',
    ],
    performanceEvidence: false,
  };
  writeFileSync(resolve(out, 'acceptance.json'), JSON.stringify(result, null, 2) + '\n', {
    flag: 'wx',
  });
  console.log(JSON.stringify(result));
} catch (error) {
  const result = {
    complete: false,
    scope: 'rehearsal',
    acceptance: 'failed',
    error: String(error),
    performanceEvidence: false,
  };
  writeFileSync(resolve(out, 'acceptance.json'), JSON.stringify(result, null, 2) + '\n', {
    flag: 'wx',
  });
  console.error(JSON.stringify(result));
  process.exitCode = 1;
}
