# 03 — `mermaid-v13-approches` bench harness (→ `packages/bench`, ticket #3)

Repo: `/Users/knsv/repos/mermaid-v13-approches` @ `43323c6` (2026-10-30). Package `research-mermaid-comparison`, MIT, private. Uses pnpm and Vite 8; Playwright 1.64 drives headless runs.
Deps: `mermaid@12.2.0`, `pele@1.12.0`, `ondine@0.0.3`, `@mermanjs/web-render@0.9.2`.

## Layout (`README.md` "Layout")
```
index.html, src/main.ts (589), src/style.css   comparison page: controls, summary, grid
runners/<name>.html                            one isolated page per renderer (mermaid, pele, ondine, merman)
src/runner/harness.ts (106)                    timing loop inside each runner iframe
src/runner/adapters/<name>.ts (18-25 each)     the only renderer-specific code: {version, init(opts), render(src,id)}
src/shared/protocol.ts (56)                    parent↔runner postMessage types
src/shared/normalize.ts (19)                   stripMermaidOnlyConfig: removes look:handDrawn / layout:elk (YAML + JSON-in-directive)
scripts/sync-corpus.mjs (117)                  ../mermaid → corpus/ + manifest.json
scripts/facts.mjs (60)                         license, dep counts, sanitizer bundled?, install size → src/generated/facts.json
scripts/bench.mjs (127)                        build, vite preview :4199, Playwright, reports/<stamp>.{json,md}
vite.config.ts (77)                            multi-page build + sizesPlugin → dist/sizes.json
reports/2026-10-30-mermaid-{default-elk,dagre}.{json,md}
```

## Corpus (158 diagrams)
- `corpus/<group>/*.mmd` + `corpus/manifest.json` (`syncedAt`, `mermaidCommit: 7b981f640c…`, `diagrams[]: {id, file, source, group, tier, lines, bytes, features[]}`).
- Groups and counts: `pr-check` 12, `nightly` 3, `dagre` 68, `shape-alias` 42, `v2` 7, `classic` 3, `icon` 10 (= 145 tiny/regular), `perf` 13 (large/huge, from `e2e/platform/dev-diagrams/performance/flowcharts/`, with duplicates `huge4` and `large3` dropped).
- Sources are this repo's `e2e/diagrams/flowchart/{pr-check,nightly-check/{.,dagre,shape-alias,v2,classic,icon}}`. `sync-corpus.mjs:22-31` excludes `visual-check/`, `handdrawn/`, `shape-themes/`, `redux-color-subgraphs/` and `elk-container-algorithms/`. Feature tags are regexes at `:33ff` (subgraph, classDef, style, linkStyle, shape-syntax, frontmatter, …).
- **After ticket #2 these e2e sources go away from the working tree**, so commit the 158 files plus the manifest into `packages/bench/fixtures/` (R-PERF-6 "fixtures committed"). Copying from `/Users/knsv/repos/mermaid-v13-approches/corpus/` is simplest. The `perf/` files are also in this repo at `e2e/platform/dev-diagrams/performance/flowcharts/` (16 files incl. dups).
- The #8635/the reference implementation set (7/50/500-node flowcharts, sequence, class) is **not** in this corpus. Take it from `pele/scripts/bench-mermaid.mjs:29-80` (see 02-reference-port.md).

## How it measures
- **Isolation**: each renderer runs in its own iframe at the *other* loopback name (`localhost` ↔ `127.0.0.1`). That makes it cross-site, so it gets its own process. Iframes are recreated every run.
- **Ready at** = `performance.now()` in the runner after `adapter.init()` resolves (`harness.ts:64-66`), i.e. ms from iframe navigation start until it can render, with a warm HTTP cache. **Init** = the `adapter.init()` time alone (dynamic import + init). `scriptStartAt` = when the runner script began.
- **Render time** (`harness.ts:48-60`): append `\n%% run <seq>\n` (defeats caches), `adapter.render`, `stage.innerHTML = svg`, `svg.getBBox()` (forces layout). One cold `first` sample, then a probe; warm samples are **batched** so each lasts ≥ 2 ms (`MIN_SAMPLE_MS=2`, `MAX_BATCH=500`), because browser timers are coarsened to about 0.1 ms. Sampling stops after `reps` or once `budgetMs` is spent. Reports median and p95.
- **Failures**: throw, timeout, or Mermaid's "Maximum text size in diagram exceeded" placeholder (`adapters/mermaid.ts:20-22`). "OK count" = cells with status ok.
- **Common set**: diagrams every selected renderer rendered OK. Σ warm/first and geomean use only this set.
- **Geomean speedup** (`src/main.ts:321-336` `computeSummary`): `exp(mean(log(time_mermaid / time_r)))` over the common set, with `timeOf(cell)` = warm median (falls back to first).
- **Size** (`vite.config.ts:9-52` `sizesPlugin`): raw, gzip-9 and brotli-11 for every built file. "Distributable" = closure of static + dynamic imports + referenced assets from a runner entry. **"Loaded"** = the files the runner actually fetched (Resource Timing entries with the runner's origin, `main.ts:295-298 loadedFiles`), summed from `sizes.json`. Production build only; dev mode shows raw decoded bytes.
- **Output constructs**: each SVG is scanned for `foreignObject`, `<style>`, `<script>`, `on*=`, `javascript:` (`SECURITY_PATTERNS`).
- Mermaid adapter options (`adapters/mermaid.ts`): `startOnLoad:false, htmlLabels`, `layout:'dagre'` when `mermaidLayout=dagre`, lifted limits `maxTextSize:1e7, maxEdges:1e6`. 12.x defaults to **ELK**, so the "frozen 12.2.0 dagre" baseline in #3 means `--mermaid-layout dagre`.

## How to run
```sh
cd /Users/knsv/repos/mermaid-v13-approches
pnpm install && pnpm exec playwright install chromium
pnpm build && pnpm preview          # http://127.0.0.1:4199 (real numbers); pnpm dev = :5199 (not representative)
pnpm bench [--no-build] [--headed] [--tiers tiny,regular] [--renderers mermaid,pele] [--group perf] \
           [--feature subgraph] [--filter huge] [--reps 20] [--budget 5000] [--timeout 30] \
           [--mermaid-layout dagre] [--html-labels false] [--lift-limits false] [--strip false]
```
`bench.mjs` polls `window.__bench.state/progress` every second, then calls `window.__bench.report()`, and writes `reports/<ISO-stamp>.{json,md}`. Markdown table columns: Ready at, Init, Loaded JS, Loaded WASM, OK/err/timeout, Σ warm (common), Σ first (common), vs Mermaid (geomean) (`bench.mjs:73-127`).

## Reference results (2026-10-30, Chromium 156, M4 Max, 158 diagrams, 20 reps)
Mermaid dagre: 213 KB gz fetched, Ready at 36 ms. The reference implementation: 62 KB, 10 ms, 158/158 OK, geomean 135× (vs ELK default) / 118× (vs dagre). Full tables: `README.md` "Results" and `reports/*.md`.

## Gaps for #3 (inferences)
- No per-stage (parse/measure/layout/serialise) timing exists. It has to be added in the v13 build behind a compile-time flag. The harness only times end-to-end.
- No CI gate logic, baselines or regression comparison exist. The harness is a report generator only.
- A v13 adapter is one ~20-line file in `src/runner/adapters/` plus `runners/v13.html` and a `RendererId` entry.
