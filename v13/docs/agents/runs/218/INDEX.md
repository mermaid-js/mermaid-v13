# Run notes — spec #218 (M3.5 plugin-loading platform)

Integration branch: `feature/218_plugin-platform` (worktree `.claude/worktrees/m35-platform-impl-d51ccd`), cut from `mermaid-js/mermaid-v13` at `060177736`, with D160–D169 (PR #219, merged as `b7e9076f5`); later synced with `mermaid-js/mermaid-v13`.

Tickets: T0 #220 size gates · T1 #221 registry rules · T2 #222 pack harness · T3 #224 bundle test (T2) · T4 #226 Node discovery (T1, T2) · T5 #228 bundler plugin (T1, T3) · T6 #230 CDN build (T1, T2) · T7 #232 close-out.

## Pointers (no code pasted)

- Registry: `packages/mermaid/src/registry.ts` (`Registry`, `FirstPartyEntry`, `LazyDiagram`, `ManifestPlugin`, `ExternalDiagram`, `kindOf`). First-party table: `packages/mermaid/src/generated/registry.gen.ts` (`gen:registry`, `tools/gen-config/src/registry-cli.ts`). Public API: `packages/mermaid/src/api.ts` (`createMermaid`), `index.ts`, `slim.ts`, `exports.ts`.
- Manifest reader: `readManifest` in `@mermaid-js/core` (grep `export function readManifest` in `packages/core/src`).
- Secure / integrator-only keys: `packages/core/src/config/resolve.ts:65` (the list), config schema + `gen:config` (`tools/gen-config/src/cli.ts`).
- Discovery prior art (D157): `packages/language-server/src/discover.ts` (`discoverFacets`, `DiscoverOptions`, confinement, 5 s import limit) and its spec.
- Bench: `packages/bench/src/build.ts` (`bundle()` esbuild options), `gates.ts:18` (`LIMITS`, `loadedGzipBytes`), the browser runner under `packages/bench/src/runner`, `report.ts`.
- e2e: `playwright.config.ts` (`testMatch`; `pnpm e2e` = projects `chromium` + `dev`). Prior art for building and serving an app from an e2e spec: `e2e/language/example-server.ts`. `e2e/platform/*.html` are parked v12 pages; new apps go in `e2e/platform/<app>/`.
- Interactions extension: `packages/plugin-interactions`.
- Deps rule: `tools/check-deps` (`pnpm check:deps`): `mermaid` depends on first-party only (R-PERF-2).
