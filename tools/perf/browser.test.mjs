/** Pure PNG/RGBA gate tests. Real Chromium acceptance is browser-acceptance.mjs, never skipped. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePixels } from './browser.mjs';
test('exact pixels: a one-channel one-pixel change fails without tolerance', () => {
  const base = { width: 2, height: 1, data: [0, 0, 0, 255, 255, 255, 255, 255] };
  assert.equal(comparePixels(base, base).equal, true);
  const head = structuredClone(base);
  head.data[4]--;
  assert.equal(comparePixels(base, head).equal, false);
});
test('different image dimensions fail even with same RGBA bytes', () => {
  const data = [0, 0, 0, 255, 255, 255, 255, 255];
  assert.equal(
    comparePixels({ width: 2, height: 1, data }, { width: 1, height: 2, data }).equal,
    false
  );
});
