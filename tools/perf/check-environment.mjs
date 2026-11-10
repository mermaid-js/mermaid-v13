/** Untimed host preflight. This does not establish that a measurement window is quiet. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { 'node-only': { type: 'boolean' } } });
const validationProfile = values['node-only'] ? 'node' : 'full';

const root = fileURLToPath(new URL('../../', import.meta.url));
const nodePin = readFileSync(new URL('../../.node-version', import.meta.url), 'utf8').trim();
const managerPin = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  .packageManager.split('@')[1]
  .split('+')[0];
const checks = [];
checks.push({
  name: 'node',
  ok: process.version === `v${nodePin}`,
  expected: nodePin,
  actual: process.version,
});
const manager = spawnSync('pnpm', ['--version'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 10000,
});
checks.push({
  name: 'pnpm',
  ok: manager.status === 0 && manager.stdout.trim() === managerPin,
  expected: managerPin,
  actual: manager.stdout?.trim() || null,
  error: manager.error?.code ?? (manager.status === 0 ? null : 'VERSION_COMMAND_FAILED'),
});
const processes = spawnSync('ps', ['-A', '-o', 'pid='], { encoding: 'utf8', timeout: 5000 });
checks.push({
  name: 'process-inspection',
  ok: processes.status === 0,
  error: processes.status === 0 ? null : (processes.error?.code ?? processes.stderr.trim()),
});
const hardware = spawnSync('sysctl', ['-n', 'hw.memsize', 'hw.physicalcpu', 'hw.logicalcpu'], {
  encoding: 'utf8',
  timeout: 5000,
});
checks.push({
  name: 'hardware-inventory',
  ok: hardware.status === 0,
  actual: hardware.status === 0 ? hardware.stdout.trim().split('\n') : null,
  error: hardware.status === 0 ? null : (hardware.error?.code ?? hardware.stderr.trim()),
});
if (validationProfile === 'full') {
  const { chromium } = await import('@playwright/test');
  let browser;
  try {
    browser = await chromium.launch({ headless: true, timeout: 10000 });
    const page = await browser.newPage({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20"/></svg>'
    );
    const box = await page.locator('svg').evaluate((element) => {
      const measured = element.getBBox();
      return { width: measured.width, height: measured.height };
    });
    const screenshot = await page.screenshot();
    checks.push({
      name: 'chromium',
      ok: box.width === 10 && box.height === 20 && screenshot.length > 0,
      version: browser.version(),
      box,
      screenshotBytes: screenshot.length,
    });
  } catch (error) {
    const message = String(error);
    checks.push({
      name: 'chromium',
      ok: false,
      error: message.includes('Permission denied') ? 'PERMISSION_DENIED' : message.split('\n')[0],
    });
  } finally {
    await browser?.close();
  }
}
console.log(
  JSON.stringify(
    {
      purpose: 'environment preflight, not benchmark',
      validationProfile,
      browserValidation:
        validationProfile === 'node'
          ? 'unverified'
          : checks.find((check) => check.name === 'chromium').ok
            ? 'passed'
            : 'failed',
      checks,
    },
    null,
    2
  )
);
if (checks.some((check) => !check.ok)) process.exitCode = 1;
