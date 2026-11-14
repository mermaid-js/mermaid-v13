/**
 * The package version, read from this package's own `package.json` (one folder up from both
 * `src/` and `dist/`). The bin prints it for `--version`; `initialize` sends it as
 * `serverInfo.version`.
 */
import { readFileSync } from 'node:fs';

export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
