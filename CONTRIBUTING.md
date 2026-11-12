# Contributing to Mermaid

This branch holds Mermaid v13. Start with these:

- [AGENTS.md](AGENTS.md): the rules to know before a first edit, the commands, and how issues and pull requests work here. It is written for coding agents and applies to people as well.
- [v13/docs/DESIGN.md](v13/docs/DESIGN.md) and [v13/docs/REQUIREMENTS.md](v13/docs/REQUIREMENTS.md): how v13 is built and what it must do.
- [v13/docs/RELEASING.md](v13/docs/RELEASING.md): changesets and releases.

## Structural checks (fallow)

[fallow](https://fallow.tools) checks the structure of a change: dead code, import cycles, the package boundaries, duplication and complexity. The `Structural audit` job runs it on every pull request, and the change cannot merge while it fails. It looks only at the files the change touches and fails only on findings the change introduces. Findings the branch already had are reported but do not fail it.

Run it before you push:

```bash
pnpm exec fallow audit --base mermaid-v13   # what CI runs; use the remote's name (e.g. origin/mermaid-v13) if that is your base
pnpm exec fallow                            # the whole tree: dead code, duplication and complexity
pnpm exec fallow architecture               # cycles and boundaries only
pnpm exec fallow explain <issue-type>       # what a finding means and how to fix it
```

For CRAP scores from real coverage, as CI computes them, run the tests first with `pnpm vitest run --coverage <paths>` and add `--coverage coverage/coverage-final.json`. Without it fallow estimates coverage from which tests import the file.

What it reports, and what fixes it:

| Finding | What it means | The fix |
| --- | --- | --- |
| Unused file, export or type | Nothing reachable from a package entry uses it | Delete it. An export used only by integrators belongs in the package's public entry (`src/index.ts`) |
| Unlisted or unused dependency | `package.json` and the imports disagree | Declare what you import; drop what you don't |
| Circular dependency, package cycle | Modules or packages import each other in a loop | Move the shared part into a module both can import |
| Boundary violation | An import crosses a package boundary (DESIGN §2): `core` imports nothing; a diagram or extension package imports only `@mermaid-js/core`; `mermaid` imports `core` and those packages | Import through the allowed package, or move the code to `core` |
| Complexity | A function over cyclomatic 20 or cognitive 15, or at CRAP 30 or more | Split it, or test it (CRAP falls with coverage) |
| Duplication | A block of code copied in more than one place | Share it: across diagram packages, through `core` |

Overrides and fixes:

- Fix the finding. That is the default.
- Code that is complex by nature gets a raised ceiling in `health.thresholdOverrides` in [.fallowrc.json](.fallowrc.json), with a `reason`. The layered and swimlane layouts have one. A function that grows past the ceiling is still reported. Ask the maintainer before you add one.
- A `// fallow-ignore-next-line <issue-type>` comment is for a false positive only, with the reason on the line above it.
- Do not add entries to the baselines in [.fallow-baseline/](.fallow-baseline/) by hand or re-save them to make a change pass; that loosens the gate. The maintainer re-saves them when findings are fixed.

The nightly `Nightly structure` workflow runs the whole tree against the baselines, with coverage from the full unit suite, and a type-aware dead-code pass; the report is the job summary.
