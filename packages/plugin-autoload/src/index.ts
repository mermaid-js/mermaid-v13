/**
 * `@mermaid-js/plugin-autoload` (D589): `await autoload(mermaid)` registers the plugins the
 * app's `package.json` declares. Node only. The scan it is built on is exported too, with the
 * loader's import and detector helpers, for the language server and the bundler plugin.
 */
export {
  autoload,
  type AutoloadOptions,
  type AutoloadWarning,
  type PluginHost,
} from './autoload.ts';
export { detectorOf, IMPORT_TIMEOUT_MS, importWithin } from './load.ts';
export { FIRST_PARTY_IDS } from './generated/first-party-ids.gen.ts';
export {
  findAppRoot,
  packageModule,
  scanPlugins,
  type PackageModule,
  type ScanOptions,
  type ScannedPackage,
  type ScanResult,
  type ScanWarning,
} from './scan.ts';
