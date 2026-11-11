/** Select an already-installed pnpm pin in a checkout-local launcher; no downloads or global edits. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { root, readJson } from './common.mjs';

if (process.version !== 'v24.16.0') throw new Error('Launch with volta run --node 24.16.0');
const version = readJson(resolve(root, 'package.json')).packageManager.split('@')[1].split('+')[0];
const stores = [
  resolve(homedir(), 'Library/pnpm/store/v11/links/@/pnpm', version),
  resolve(homedir(), '.local/share/pnpm/store/v10/links/@/pnpm', version),
];
const candidates = [process.env.PERF_PNPM_CLI].filter(Boolean);
for (const store of stores)
  if (existsSync(store))
    for (const directory of readdirSync(store))
      candidates.push(resolve(store, directory, 'node_modules/pnpm/bin/pnpm.cjs'));
const cli = candidates.find((path) => {
  if (!existsSync(path)) return false;
  const result = spawnSync(process.execPath, [path, '--version'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  return result.status === 0 && result.stdout.trim() === version;
});
if (!cli)
  throw new Error(
    `Installed pnpm ${version} CLI not found; set PERF_PNPM_CLI to its bin/pnpm.cjs path`
  );
const bin = resolve(root, '.tmp/perf-tools/bin');
mkdirSync(bin, { recursive: true });
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
writeFileSync(
  resolve(bin, 'pnpm'),
  `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(cli)} "$@"\n`,
  { mode: 0o755 }
);
console.log(
  JSON.stringify({ node: process.version, pnpm: version, cli, prependToPATH: bin }, null, 2)
);
