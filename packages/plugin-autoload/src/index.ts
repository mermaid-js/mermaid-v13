/**
 * `@mermaid-js/plugin-autoload` (D589): `await autoload(mermaid)` registers the plugins the
 * app's `package.json` declares. Node only. The scan it is built on is exported too, for the
 * language server.
 */
export {
  autoload,
  type AutoloadOptions,
  type AutoloadWarning,
  type PluginHost,
} from './autoload.ts';
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
