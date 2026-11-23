---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/language-service': patch
---

fix: an unknown curve name (`curve: bogus`, `linkStyle 0 interpolate bogus`) draws edges with the default curve, `rounded`, instead of S-curves, and still warns `CURVE_UNKNOWN`.
