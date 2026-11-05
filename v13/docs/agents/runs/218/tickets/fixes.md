# #218 integration fixes (final review + Playwright-image run)

Branch `feature/218_integration-fixes`.

## Linux (Playwright image) failures

- `ERR_PNPM_IGNORED_BUILDS` (bundle/bundler-plugin esbuild apps): apps run whatever `pnpm` the machine has (Homebrew pnpm 11 on macOS, corepack's latest, 12.x, in the image), and pnpm 11+ fail on any unapproved install script. The harness's generated `pnpm-workspace.yaml` now has `allowBuilds: { esbuild: true }` (`ALLOW_BUILDS`, `pnpmWorkspaceConfig` in `harness/app.ts`); pnpm 10.30, 11 and 12 read that key (11+ ignore `onlyBuiltDependencies`). Unit test in `e2e/helpers/platform-harness.spec.ts`.
- Missing `@mermaid-js/core` (pnpm) not caught on Linux, two holes: (1) the harness ran the build with pnpm's `.bin/esbuild` shim, which exports `NODE_PATH` with the monorepo's `node_modules/.pnpm/node_modules`, so esbuild resolved mermaid's undeclared import to the workspace `packages/core` (on macOS pnpm 11 fetched a registry copy of the peer, so the hash check threw first and hid it); (2) pnpm 12 hoists the auto-installed peer into the app's hidden `node_modules/.pnpm/node_modules`. Fixes: `appEnv` (exported) drops `NODE_PATH` and puts `<cache>/bin/esbuild` (a symlink to the real executable) first on PATH; `e2e/platform/smoke/pnpm-workspace.yaml` sets `hoist: false`. The check itself is unchanged. Unit test: `appEnv` in `platform-harness.spec.ts`.

## Review findings

- First use is bounded (`api.ts`): one limit (default 5 s, `discoverOnFirstUse(api, source, { timeLimitMs })`) covers the source and its registration; past it the draw goes on with `PLUGIN_DISCOVERY_FAILED` and the result registers when it settles. Covers the bundler list's bare `import()` (generate.ts unchanged). Node's first use waits at most 11 s (2 × the 5 s import limit + 1 s), so a slow package is still skipped by name first.
- `registerDiscovered` resolves every entry of a batch at once, then applies them in package order: N slow extensions wait one limit.
- Explicit beats discovered silently for every kind; a discovered extension whose id is explicit is not loaded (`extensionIdOf` reads the manifest id), also when the explicit one arrives while it loads.
- CDN: `cdn.ts` exports its own `createMermaid()` (queue + `cdnBase` initialize). The queue keeps, per build copy, every entry taken; each API object of the copy gets all of them, earlier ones too. `push` returns the count taken so far. Entries without `package` warn once per id (`console.warn`). A queue owned by another copy (`'mermaid:pluginQueueOwner'`) is left alone with one warning; that copy also keeps off `globalThis.mermaid` (marked `'mermaid:cdnCopy'`), removes its `load` listener and makes `contentLoaded` a no-op (the classic loader calls it too).
- Config: `discovery` text covers Node + the bundler list, not the CDN queue; `cdnBase` is a schema key (string, no default, so ids unchanged), so the reference row comes from `gen:config`.
- `NodeDiscoveryOptions.log`: every scan warning goes to it; `PLUGIN_DISCOVERY_NO_MODULES` goes only there.
- Bench: `measureCoreSize(budget?)` (`size-budget.ts`) = static closure of `size-budget.json` `core.entry`; `cli/bench.ts` and `cli/pr.ts` report it.
- Notes: 221.md (index.ts uses `discoverOnFirstUse(api, bundledSource)`), 228.md (`./discovered` stays public), GAPS (`language` not confined: `readManifest` drops it). DESIGN §12.4, MIGRATION and ADR-6 follow the new behaviour.

## Tests

registry-rules (stalled entry, stalled source, parallel loads, silent explicit), node-discovery (log, NO_MODULES to log only, parallel imports), cdn.spec (two API objects share the queue, push length, missing package, foreign queue, CDN createMermaid, second copy), core-size (`measureCoreSize`).

## Unmet

- A second copy loaded by its own classic loader still replaces `globalThis.mermaid` with that loader's stand-in (the loader runs before the copy can tell); it warns, and renders once.
