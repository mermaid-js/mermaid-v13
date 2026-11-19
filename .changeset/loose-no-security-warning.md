---
'@mermaid-js/core': patch
---

`securityLevel: 'loose'`, the setting click callbacks need, no longer warns `SECURITY_LEVEL` ("no longer supported") on every render. For link URLs it still acts as `default`; `antiscript` and `sandbox` still warn.
