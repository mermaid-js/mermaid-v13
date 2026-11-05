# Gaps — spec #218

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Shared contracts

- T1 owns the discovered-list seam (the one input Node scan T4, bundler module T5 and CDN queue T6 feed). Consumers read `tickets/221.md`.
- T2 owns the pack-and-install helper and the fixture plugins. Consumers read `tickets/222.md`.
- Layout manifests (from #215, D177, D171): #238 adds `"mermaid": { "plugin": "layout", "names": [...], "entry", "export"? }` and owns the `readManifest` change. The T1 seam and T4/T5/T6 must take layout manifests and register each name lazily (as `registerLayoutLoaders`); a discovered `elk`/`elk.*` takes over the built-in aliases; duplicate names resolve by package name (D166); explicit registration wins. Whichever of #238/#221 lands second adapts. The ELK package is `@mermaid-js/layout-elk` (D171), not `plugin-elk`.
- Keep stable for #215: T0's size spec/job (#247 builds on it) and T4's discovery (#215's install checks use it).

## T2 #222 (merged)

- [ ] Not yet verified in the Playwright image (docker was down for the implementer); the coordinator runs the platform specs there at close-out (T7).
- [ ] npm hoists auto-installed peers, so a missing dependency is caught only by the pnpm variant of the smoke app. Later apps should install with pnpm where the check matters.
- Platform cache lives in `<os tmpdir>/mermaid-v13-platform` (`MERMAID_PLATFORM_CACHE`); nothing prunes it.

## T3 #224 (merged)

- [ ] Not yet run in the Playwright image (close-out, T7).
- Cold runs fetch the four bundlers from the npm registry (network needed).
- Chunk attribution reads source maps (`e2e/platform/harness/chunks.ts`): T5 must keep source maps on in all four app configs.

## T4 #226 (merged)

- [ ] Not yet run in the Playwright image (T7).
- Follow-up (not this spec): the `mermaid` CLI does not discover plugins.
- Ancestor `node_modules` plugins are simply not found, no warning (D165 "never ancestors"); the ticket's "skipped with a warning" wording is read that way.
- `scanPlugins`/`findAppRoot` (`mermaid/node-scan`) are async; T5 awaits them in its unplugin hooks. Layout manifests are skipped with a warning until #238 lands (hook in `scanOne`).

## Cross-spec: #238 layout manifests (from #215, PR #255)

- #238 is merged into `feature/215_feature-plugins`, not yet `mermaid-v13`. Final shape: `"mermaid": { "plugin": "layout", "names": [...] (never layered/dagre), "entry", "id"?, "export"?, "config"? }`; `ManifestPlugin` gains `config?: ConfigFragment`; `registerExternalDiagrams` registers each name lazily with one shared entry load (details: `v13/docs/agents/runs/215/tickets/238.md` on that branch).
- [ ] Whichever of #218/#215 reaches `mermaid-v13` second adapts: the T1 seam's `layout` arm gains `config`, uses #238's entry resolution; T4 `scanOne` (hook comment), T5's generated module and T6's queue feed layout manifests. Our arm (`{kind:'layout', package, names, loader}`) is compatible; the change is additive.
