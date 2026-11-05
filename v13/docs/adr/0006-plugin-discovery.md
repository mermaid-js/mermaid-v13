# ADR-6: Plugin manifest, discovery paths and detector order

Status: accepted (M3.5, spec #218). From D40 and D41, amended by D52 and D162–D167, with D169.
R-PLUG-3, R-PLUG-4, R-PLUG-5, R-PLUG-6, R-PLUG-7, R-ARCH-6. Design: DESIGN §12.1, §12.4.

## Context

v12 shipped every diagram type in one package and registered third-party diagrams only through
`registerExternalDiagrams`, after `mermaid` had loaded. v13 splits each type into its own
package (D25) and wants third-party and heavy plugins (ELK, math, community diagrams) to work by
installing them (R-PLUG-5), without any of them costing core size (R-PLUG-8). That needs three
things settled once for every environment: how a package says it is a plugin, where `mermaid`
finds such packages, and in what order their detectors run, since the order decides which type a
text gets and so is part of "syntax is sacred".

The first design (DESIGN §12.4 before M3.5) had a `mermaid/plugin` unplugin subpath, a CDN
script that called `globalThis.mermaid.registerExternalDiagrams` directly and "discovery order"
for detectors. The subpath would have given `mermaid` a third-party dependency (R-PERF-2), the
direct call needed `mermaid` to load first, and discovery order differs between file systems
and package managers.

## Decision

**Manifest (D40, D52).** A plugin is a package whose `package.json` has a `mermaid` key, read by
`readManifest` in `@mermaid-js/core`:

- `{ "plugin": "diagram", "id", "formats"?, "detector", "entry", "export"?, "ascii"? }`: the
  detector is a tiny module loaded eagerly; `entry` (and `ascii`, for text output) load on first
  detection. `formats` lets `supportsFormat` answer without loading the package.
- `{ "plugin": "extension", "id", "entry", "export"? }`: no detector; the entry loads when the
  plugin is activated.
- Layout manifests (`"plugin": "layout"`, `names`) come with #238; the discovery seam already has
  a `layout` arm that registers each name lazily.

Every path must resolve inside its package (D157's confinement, D165). A manifest that fails is
skipped with a `PLUGIN_SKIPPED` warning, never a thrown error.

**Discovery paths.** Every path feeds one internal seam (`addDiscovered` in
`mermaid/src/discovery.ts`):

| Path | Mechanism | D-id |
| --- | --- | --- |
| First-party | `mermaid` depends on every `@mermaid-js/diagram-*`; a generated table holds each detector and a lazy `import()`. Bundlers split per type. | D40, R-PLUG-4 |
| Node / SSR | The `node` export condition of `mermaid` scans on first use, on by default. Root: the nearest `package.json` at or above `process.cwd()`; only its `node_modules` top level and `@scope` folders, never ancestors; 5 s per discovery-time import. `initialize({ discovery: false })` turns it off. | D165 |
| Bundlers | `@mermaid-js/bundler-plugin` (unplugin), one line per bundler, runs the same scan at build time and replaces `mermaid/discovered` with the list. `mermaid` keeps first-party dependencies only. | D164 |
| CDN | ESM build with per-type chunks plus a classic loader `mermaid.min.js` (D162); chunks load only from `cdnBase` or the loader's `data-cdn-base` (D163, D41). Third-party scripts push onto `globalThis.mermaidPlugins`, in either load order. | D162, D163, D167 |
| Explicit | `registerExternalDiagrams()`, always available. | R-PLUG-6 |

Discovered extensions activate on discovery, `@mermaid-js/plugin-interactions` included: the
install is the opt-in, and diagram text can never enable a plugin (D169, R-PLUG-9).

**Detector order (D166).**

1. First-party detectors, in v12's registration order.
2. Discovered third-party detectors, sorted by package name, then id, by code unit.
3. Explicit `registerExternalDiagrams` detectors, in call order.

A discovered plugin with a first-party id or type is skipped with a warning. Replacing a
first-party type needs `registerExternalDiagrams(…, { replace: true })`, whose detector then
takes that type's first-party slot. Two packages with one id or layout name: the earlier package
wins. Explicit registration beats discovery. Extension hooks run in the same order.

## Consequences

- Output does not depend on the file system, the package manager or the order CDN scripts load
  in (R-ARCH-6); a new package can never change how an existing first-party text is read.
- An app's own install is trusted (unlike an opened clone, D157), so Node and bundler discovery
  run package code: detectors at discovery, entries on first use.
- `renderSync`, `detectType` and `supportsFormat` do not wait for first-use discovery; callers
  `await preload()` first.
- The `mermaid` CLI does not discover plugins yet, and the Vite dev-server path is unverified
  (follow-ups in `agents/runs/218/GAPS.md`).
- The CDN loader needs ES2022 module support (R-ARCH-8); there is no full non-lazy IIFE (D162).
