/**
 * The platform e2e harness (spec #218, T2): pack workspace packages and the fixture
 * plugins, install the tarballs into a copy of an example app under `e2e/platform/<app>/`,
 * build it and serve it. API and usage: v13/docs/agents/runs/218/tickets/222.md.
 */
export {
  ALLOW_BUILDS,
  appEnv,
  assertInstalledFromTarballs,
  installApp,
  installManifest,
  pnpmWorkspaceConfig,
} from './app.ts';
export type { InstalledApp, InstallOptions, PackageManager } from './app.ts';
export { cacheRoot } from './cache.ts';
export {
  FIXTURE_DIAGRAM,
  FIXTURE_EXTENSION,
  FIXTURES_DIR,
  PLATFORM_DIR,
  REPO_ROOT,
  packageHash,
  packageSources,
  packClosure,
  packPackages,
} from './pack.ts';
export type { Manifest, ManifestEdit, PackageSource, PackedPackage, PackOptions } from './pack.ts';
export { serveDir } from './serve.ts';
export type { ServeOptions, StaticServer } from './serve.ts';
export { assertLoadedOnly, chunkParts, chunkSources, partOf, recordScripts } from './chunks.ts';
export type { ChunkPart, LoadedExpectation, ScriptRecorder } from './chunks.ts';
