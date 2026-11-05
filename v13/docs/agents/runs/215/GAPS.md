# Gaps — spec #215

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Shared contracts

- T0 #237 owns the inline-box run kind and the delimiter-provider registry on the extension contract. M2 #245 consumes it; read `tickets/237.md`.
- T0b #238 owns plugin config fragments and the `layout` manifest kind (`"mermaid": { "plugin": "layout", "names": [...], "entry", "export"? }`, agreed with #218; #238 changes `readManifest`). E2 #240 and E4 #242 consume it; read `tickets/238.md`.
- E1 #239 owns the sync elkjs call; E2 builds the package on it. M1 #244 owns the MathJax TeX→SVG engine; M2 packages it.

## Waiting on #218

- Activates-on-install checks (E2, E5, M3) need #218 T4 (#226). S1 #247 needs #218 T0 (#220).
