---
'@mermaid-js/language-service': patch
---

feat: each `firstPartyFacets` row carries the detector's regex as `pattern`, and the `FirstPartyFacetId` type names the ids that have a language facet, so an editor integration can dispatch on the same headers as the service and key a per-type table by the facet ids.
