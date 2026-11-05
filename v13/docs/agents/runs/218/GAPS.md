# Gaps — spec #218

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Shared contracts

- T1 owns the discovered-list seam (the one input Node scan T4, bundler module T5 and CDN queue T6 feed). Consumers read `tickets/221.md`.
- T2 owns the pack-and-install helper and the fixture plugins. Consumers read `tickets/222.md`.
- Layout manifests (from #215, D177, D171): #238 adds `"mermaid": { "plugin": "layout", "names": [...], "entry", "export"? }` and owns the `readManifest` change. The T1 seam and T4/T5/T6 must take layout manifests and register each name lazily (as `registerLayoutLoaders`); a discovered `elk`/`elk.*` takes over the built-in aliases; duplicate names resolve by package name (D166); explicit registration wins. Whichever of #238/#221 lands second adapts. The ELK package is `@mermaid-js/layout-elk` (D171), not `plugin-elk`.
- Keep stable for #215: T0's size spec/job (#247 builds on it) and T4's discovery (#215's install checks use it).
