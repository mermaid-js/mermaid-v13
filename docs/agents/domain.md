# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**, but the domain docs live under **`v13/docs/`**, not at the repo root. The domain is Mermaid v13; the v12 code still in the tree is reference only (v12 is used as an npm test oracle, R-ARCH-9).

## Before exploring, read these

The approved baseline (always present):

- **`v13/docs/GLOSSARY.md`**: the domain glossary. `/domain-modeling` adds terms as they are resolved.
- **`v13/docs/REQUIREMENTS.md`**: requirements by R-id (`R-<AREA>-<n>`); open items at the end.
- **`v13/docs/DESIGN.md`**: how v13 is built: packages, interfaces, M1 work breakdown (§15), ADR list (§16).
- **`v13/docs/DECISIONS.md`**: the decision log by D-id. Later rounds amend earlier rows; an amended row points to its replacement.
- **`v13/docs/decisions/`**: the decisions after D632, one file each (`D636.md`). `DECISIONS.md` gets no new rows. A new decision that replaces an earlier one says so.

Created lazily (may not exist yet):

- **`v13/docs/adr/`**: ADRs, numbered as in DESIGN.md §16 (ADR-1 … ADR-14). Read the ones touching the area you work in.

If a lazily created file doesn't exist, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. `/domain-modeling` (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them when terms or decisions actually get resolved, and writes them under `v13/docs/`.

## File structure

```
/
├── v13/docs/
│   ├── REQUIREMENTS.md
│   ├── DESIGN.md
│   ├── DECISIONS.md
│   ├── GLOSSARY.md          (lazily)
│   ├── adr/                 (lazily)
│   │   └── 0001-hand-written-parsers.md
│   └── research/
└── packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the glossary (`v13/docs/GLOSSARY.md`) and the names used in DESIGN.md (e.g. parser kit, `RenderContext`, `LayoutModel`, `SvgWriter`, extension plugin). Don't drift to synonyms.

If the concept you need isn't defined yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Cite and flag conflicts

Reference requirements and decisions by id (`R-PARSE-8`, `D52`, `ADR-3`) in issues, specs and PRs (R-REL-5).

If your output contradicts a requirement, a decision or an ADR, surface it explicitly rather than silently overriding:

> _Contradicts D52 (extension plugin hooks), but worth reopening because…_
