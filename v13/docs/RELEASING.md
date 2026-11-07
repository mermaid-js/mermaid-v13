# Releasing the v13 alpha

How Mermaid v13 packages are versioned and published, for contributors, the release master and agents. Releases are **manual** for now: the release master starts one when they want, as often as needed, either from a laptop or with the *Release alpha (manual)* workflow ([§5](#from-github-actions)). [§7](#7-ci-later-in-the-oss-repo) describes the CI flow planned for when v13 moves back to `mermaid-js/mermaid`.

Agents: the `release-alpha` skill (`.claude/skills/release-alpha/SKILL.md`) walks through §5 step by step.

## 1. What gets published

| Package | What it is | Users install it… |
| --- | --- | --- |
| `mermaid` | The API (`render`, `initialize`, `run`, `mount`, CLI) plus every first-party diagram, each loaded on first use. | for everything: `npm install mermaid@v13-alpha` |
| `mermaid/slim` | A subpath of `mermaid`, not a package: the same API with only the diagrams passed to `createMermaid({ diagrams })`. | to pick diagrams, with the `@mermaid-js/diagram-*` packages they want |
| `@mermaid-js/core` | The DOM-free engine: plugin contract, parser kit, layout, SVG writer, theme, config. | never directly; `mermaid` brings it |
| `@mermaid-js/diagram-flowchart` | The flowchart plugin (SVG, and text output from `/ascii`). | with `mermaid/slim` |
| `@mermaid-js/diagram-class` | The class diagram plugin (SVG; `classDiagram` and `classDiagram-v2`). | with `mermaid/slim` |
| `@mermaid-js/diagram-state` | The state diagram plugin (SVG; `stateDiagram` and `stateDiagram-v2`). | with `mermaid/slim` |
| `@mermaid-js/diagram-timeline` | The timeline plugin (SVG; `timeline`, `LR` and `TD`). | with `mermaid/slim` |
| `@mermaid-js/diagram-info` | The info diagram plugin (SVG and text; `info`). | with `mermaid/slim` |
| `@mermaid-js/diagram-pie` | The pie chart plugin (SVG; `pie`). | with `mermaid/slim` |
| `@mermaid-js/diagram-cynefin` | The Cynefin framework plugin (SVG; `cynefin-beta`). | with `mermaid/slim` |
| `@mermaid-js/diagram-quadrant` | The quadrant chart plugin (SVG; `quadrantChart`). | with `mermaid/slim` |
| `@mermaid-js/diagram-mindmap` | The mindmap plugin (SVG; `mindmap`). | with `mermaid/slim` |
| `@mermaid-js/diagram-gitgraph` | The git graph plugin (SVG; `gitGraph`, `LR`, `TB` and `BT`). | with `mermaid/slim` |
| `@mermaid-js/diagram-gantt` | The gantt chart plugin (SVG; `gantt`). | with `mermaid/slim` |
| `@mermaid-js/diagram-kanban` | The kanban board plugin (SVG; `kanban`). | with `mermaid/slim` |
| `@mermaid-js/plugin-interactions` | v12 click callbacks as an extension plugin. | when they use `click A callback` |

The private workspace packages (`bench`, `conformance`, `dev`, `tools/*`) are never published.

Every publish uses the npm dist-tag **`v13-alpha`**, never `latest`, so `mermaid@latest` stays on v12. The older `alpha` tag is not moved any more: on `mermaid` it held the v11 alphas, and it stays at `13.0.0-alpha.0`, the one build published under it. (npm also tags the very first version of a brand-new package `latest`. That is harmless for the `@mermaid-js/*` packages, which have no stable release.)

## 2. Versions

Each package has **its own version**, on the shared line `13.0.0-alpha.N`. Changesets is in pre mode with tag `alpha` (`.changeset/pre.json`), so every bump, patch, minor or major, gives the next `13.0.0-alpha.N` of that package. `N` counts that package's own releases, so different packages have different `N`s:

```
mermaid                          13.0.0-alpha.7
@mermaid-js/core                 13.0.0-alpha.3
@mermaid-js/diagram-flowchart    13.0.0-alpha.6
@mermaid-js/plugin-interactions  13.0.0-alpha.3
```

A package that has never been published starts at a hand-set `13.0.0-alpha.0` in its package.json, which is never published itself: its first changeset (a `patch`, "feat: first release of …") makes its first release `13.0.0-alpha.1`.

The packages depend on each other at **exact** versions (`workspace:*` in package.json, which `pnpm pack` writes as `13.0.0-alpha.6`). This has two effects:

- **A change re-releases everything that depends on it.** Changesets bumps every dependent whose pinned version no longer matches. `mermaid` depends on every diagram package and on core, so **any** release also releases a new `mermaid`, and `mermaid@v13-alpha` always holds the newest set.
- **A pinned version stays pinned.** `mermaid@13.0.0-alpha.7` always installs the same core and flowchart. With `^` ranges it would float onto newer alphas, which can break.

| Changeset names | `changeset version` releases |
| --- | --- |
| `@mermaid-js/diagram-flowchart` | flowchart, `mermaid` |
| `@mermaid-js/diagram-class` | class, `mermaid` |
| `mermaid` | `mermaid` |
| `@mermaid-js/core` | core, flowchart, class, interactions (they peer-depend on core), `mermaid` |
| `@mermaid-js/plugin-interactions` | interactions |

`fixed` and `linked` in `.changeset/config.json` are empty on purpose, and a spec (`tools/release/src/release-config.spec.ts`) keeps them that way.

`packages/mermaid/src/version.ts` holds the version `mermaid --version` and the error image report. `changeset version` does not touch it, so `pnpm release:sync-version` always runs right after it.

## 3. In your PR: add a changeset

Every PR that changes a published package adds a changeset:

```bash
pnpm changeset
```

- **Packages:** pick the packages whose code you changed. Don't add their dependents (`mermaid` for a flowchart fix): Changesets adds those.
- **Bump type:** `patch`. During the alpha every type gives the next `alpha.N`, and a single type keeps the changelogs consistent. Use `minor` only for a new feature you want called out. Never use `major`, since v13 already is the major.
- **Summary:** one line for the changelog, written for users ("Fix arrowheads on dotted edges"), not for reviewers.

It writes `.changeset/<random-name>.md`:

```md
---
'@mermaid-js/diagram-flowchart': patch
---

Fix arrowheads on dotted edges
```

A PR that only touches tests, docs, tools or private packages needs no changeset.

Never edit `version` in a package.json, `version.ts` or the CHANGELOG files by hand, and never run `changeset pre exit` (that ends the alpha).

## 4. Commands

| Command | Does | Changes |
| --- | --- | --- |
| `pnpm release:preflight` | Checks branch, clean tree, origin, pre mode, Node, npm login, GitHub token. Prints the release plan (from `changeset status`), the versions not yet on npm and the next step. | nothing |
| `pnpm changeset version` | Applies the pending changesets: bumps versions (dependents too), writes CHANGELOGs, records them in `pre.json`. | package.json, CHANGELOG.md, `.changeset/pre.json` |
| `pnpm release:sync-version` | Writes `packages/mermaid/src/version.ts` from package.json. | `version.ts` |
| `pnpm release:rehearse` | Copies the working tree, versions and builds it, publishes to a local Verdaccio, then installs both ways and runs the guide's snippets, the CLI, bundles and types, and installs the editor adapters and checks their per-type grammars load and stay lazy chunks (`--nodes a,b` to test several Node binaries). | nothing (temp dir) |
| `pnpm release:publish --target public …` | Packs every published package (alpha-version, exact-range, workspace-leak and dangling-export gates, LICENSE added), then `npm publish --tag v13-alpha` for **each version not on npm yet**. Already published versions are skipped, so only what `changeset version` bumped goes out, and a re-run after a failure finishes the set. | npm |
| `pnpm changeset tag` | Creates a git tag `<name>@<version>` for each package version that has none. | git tags |

`release:publish` options:

- `--gate <bench report.json>` checks the public alpha gate (R-PERF-1…4, R-REL-3) on a full bench report of this commit.
- `--skip-gate "<reason>"` publishes without enforcing the gate (D159). It prints the reason and the gate's checks on the **last known bench**: `--bench-report <file>`, else `packages/bench/dist/reports/latest.json`, else the newest successful *Nightly bench* report, downloaded with `gh`. The full bench takes up to an hour, and R-PERF-3 is below 50× on CI runners (D150), so manual releases use this. Example:
  ```
  Public alpha gate (R-PERF-1…4) SKIPPED by the release master: manual alpha
  Last known bench, not enforced: 2026-11-04T11:02:52.881Z on blacksmith-4vcpu-ubuntu-2404, commit 639b65a
  PASS R-PERF-1  Loaded size, core + flowchart (gzip): 71.5 KB fetched by the runner (limit 80 KB)
  FAIL R-PERF-3  Warm geomean vs mermaid@12.2.0 dagre: 31.56× over 161 common diagrams (need ≥ 50×)
  …
  ```
- `--no-provenance`: npm provenance needs CI (GitHub OIDC), so it is off for a laptop publish.
- `--otp <code>` passes a 2FA one-time password, for accounts that need one on publish.
- `--dry-run` packs and lists, publishes nothing.
- `--target private` publishes to GitHub Packages as `@mermaid-chart/*` instead (D28).

## 5. Manual release (release master)

### One-time setup

- npm publish rights on `mermaid` and the `@mermaid-js` scope.
- `gh auth login` with read access to this repository: the changelog (`@changesets/changelog-github`) looks up the PR and author of each changeset, and `changeset version` fails without a `GITHUB_TOKEN`.
- An npm login for publishing. Either set up the release token below and prefix npm commands with `mermaid-release` (no 2FA prompts), or `npm login` and pass `--otp <code>` to `release:publish`. One code covers a run if you are quick, and a re-run with a fresh code skips what is already published.
- Node from `.node-version` (`nvm use 24.16.0`), `pnpm install`.

### Each release

```bash
git switch mermaid-v13 && git pull
mermaid-release pnpm release:preflight # 1. what would ship, and the next step

pnpm check                             # 2. lint, typecheck, tests, deps, licenses, generated files

GITHUB_TOKEN=$(gh auth token) pnpm changeset version   # 3. version (the changelog looks up each PR)
pnpm release:sync-version
pnpm exec prettier --write .changeset "packages/*/package.json"
git add -A && git commit -m "chore(release): version packages"
git push origin mermaid-v13            #    or open a PR with this commit, merge it, pull

pnpm build                             # 4. build and rehearse what will ship
pnpm release:rehearse

mermaid-release pnpm release:publish --target public --no-provenance --skip-gate "manual alpha"   # 5. publish

pnpm changeset tag                     # 6. tag the released versions
git push origin --tags
```

`mermaid-release` runs the command with the release token ([npm release token](#npm-release-token)). Without it, drop the prefix and add `--otp <code>` to the publish.

Run `pnpm release:preflight` again at the end: it should say *Nothing to release*.

The version commit is pushed **before** publishing so that everything on npm is on the branch. If `mermaid-v13` doesn't accept direct pushes, merge the version commit through a PR, pull, and continue at step 4. Preflight then reports *Next: build and publish*.

### npm release token

The CI workflow, and optionally your laptop, publish with a granular npm token that bypasses 2FA. It is created once and replaced when it expires.

**Create it** on npmjs.com: avatar → *Access Tokens* → *Generate New Token* → *Granular Access Token*.

| Field | Value |
| --- | --- |
| Token name | `mermaid-v13-alpha-release` |
| Bypass two-factor authentication | checked: CI can't type a code |
| Allowed IP ranges | empty: GitHub runners have no fixed IPs |
| Packages and scopes | *Read and write*, *Only select packages and scopes*: package `mermaid` and scope `@mermaid-js` (the scope also covers packages the first publish creates) |
| Organizations | No access |
| Expiration | the longest npm allows for write tokens (currently 90 days); set a reminder to rotate it |

npm shows the token once. Then:

- **Allow tokens on `mermaid`.** Go to npmjs.com/package/mermaid/access → *Publishing access* and pick the option that allows a granular token with 2FA bypass. *Disallow tokens* rejects every token. Changing it needs an owner of the package.
- **CI:** `gh secret set NPM_TOKEN --env npm-alpha -R mermaid-js/mermaid-v13`. It prompts for the value, so the token stays out of your shell history.

**Laptop (optional).** The token goes into the macOS Keychain, not into a file, and your own `npm login` stays as it is. One-time setup:

1. Store the token. At *password data for new item*, paste the token (it doesn't echo) and press Enter:
   ```bash
   security add-generic-password -a "$USER" -s mermaid-npm-release -w
   security find-generic-password -s mermaid-npm-release -w | cut -c1-4   # prints npm_
   ```
2. Create a release-only npm config. It holds a placeholder, not the token; keep the single quotes:
   ```bash
   printf '//registry.npmjs.org/:_authToken=${MERMAID_NPM_TOKEN}\n' > ~/.npmrc-mermaid-release
   ```
3. Add this function to `~/.bashrc` (or `~/.zshrc`), then `source` that file:
   ```bash
   # Run one command with the Mermaid npm release token (kept in the macOS Keychain).
   mermaid-release() {
     MERMAID_NPM_TOKEN="$(security find-generic-password -s mermaid-npm-release -w)" \
     NPM_CONFIG_USERCONFIG="$HOME/.npmrc-mermaid-release" \
     "$@"
   }
   ```
4. Check it. The first time, macOS may ask whether `security` can read the item: choose *Always Allow*.
   ```bash
   mermaid-release npm whoami   # the token's owner
   npm whoami                   # your own login, unchanged
   ```

Prefix only the commands that talk to npm: `mermaid-release pnpm release:preflight` and `mermaid-release pnpm release:publish …`. Don't use `--otp` with the token.

**Replace it** before it expires, or straight away if it may have leaked. Generate a new token as above, then update both copies and revoke the old token on npmjs.com:

```bash
security add-generic-password -U -a "$USER" -s mermaid-npm-release -w   # -U replaces the stored value
gh secret set NPM_TOKEN --env npm-alpha -R mermaid-js/mermaid-v13
mermaid-release npm whoami                                               # check the new one
```

### From GitHub Actions

`.github/workflows/release-alpha.yml` runs the same steps on a runner, started by hand:

```bash
gh workflow run release-alpha.yml -f dry_run=true             # version, build, rehearse; push and publish nothing
gh workflow run release-alpha.yml -f dry_run=false            # release
gh workflow run release-alpha.yml -f dry_run=false -f gate_reason="hotfix, bench green last night"
```

You can also start it from the Actions tab: *Release alpha (manual)* → *Run workflow*. It runs preflight, `pnpm check`, then `changeset version` if changesets are pending (it commits `chore(release): version packages` itself), then build and rehearsal. Unless it's a dry run, it then pushes the version commit, publishes the versions not yet on npm and pushes the tags. The run summary lists what was published. A failed run is safe to re-run: versioning is a no-op once done, and published versions are skipped.

Because this repository is private, the workflow publishes without provenance and skips the bench gate, with the reason given on dispatch. `release.yml` (publish on every merge) stays off.

One-time setup:

- **Environment `npm-alpha`:** restrict it to branch `mermaid-v13`. Add required reviewers if each release should be approved before it starts.
- **Secret `NPM_TOKEN`, in that environment:** the [npm release token](#npm-release-token).
- **Secret `RELEASE_BOT_TOKEN`:** a token allowed to push to the protected `mermaid-v13` branch. Without it, the run uses the workflow's own token, which only works while the branch accepts its pushes.

### Example: a flowchart fix

1. The PR fixing the flowchart adds `'@mermaid-js/diagram-flowchart': patch` and is merged.
2. Preflight shows:
   ```
   `changeset version` would release:
     @mermaid-js/diagram-flowchart  13.0.0-alpha.5 → 13.0.0-alpha.6
     mermaid  13.0.0-alpha.6 → 13.0.0-alpha.7  (dependent)
   ```
3. After steps 3 to 6, npm has `@mermaid-js/diagram-flowchart@13.0.0-alpha.6` and `mermaid@13.0.0-alpha.7` (which pins `diagram-flowchart@13.0.0-alpha.6`). Both `v13-alpha` tags moved. `core` and `plugin-interactions` were skipped, because their versions are already on npm.

### When something goes wrong

- **Publish failed half way:** fix the cause and run the same `release:publish` again. Published versions are skipped, including ones the registry's cache still reports as missing.
- **"Not found" right after a publish:** npm's cache can answer 404 for a few minutes, longest for a package's very first version (about 3 minutes for the `@mermaid-js/*` packages on 13.0.0-alpha.0). Until the cache catches up, `npm install mermaid@v13-alpha` fails for users, because npm can't find the new dependencies. To check without the cache, request the tarball (`curl -I https://registry.npmjs.org/mermaid/-/mermaid-<version>.tgz`). Your npm "published" emails are also proof.
- **Tags missing on GitHub:** `git ls-remote --tags origin '*<version>'`. Create them on the released commit (`pnpm changeset tag` needs a git identity, because the tags are annotated) and push them. The workflow now checks each tag before and after pushing.
- **Versioned, never published** (preflight lists versions *not on the registry yet*): run steps 4 to 6. If changesets have been merged since, version first (step 3): a publish ships `HEAD`, and that code belongs under the new version. The unpublished alpha number is simply skipped.
- **A bad version is on npm:** never unpublish, and never reuse a number. Fix forward with a new changeset and release. Meanwhile point `v13-alpha` back with `npm dist-tag add mermaid@<good> v13-alpha`, and `npm deprecate mermaid@<bad> "<why>"`.
- **`latest` must never move.** If a publish ever touched it: `npm dist-tag add mermaid@<current v12> latest`.

## 6. Installing a release

- Everything: `npm install mermaid@v13-alpha --save-exact`.
- Pick diagrams: `npm install mermaid@v13-alpha @mermaid-js/diagram-flowchart@v13-alpha --save-exact`. The newest `mermaid` always pins the newest diagram packages, so the `v13-alpha` tags line up. To match an older `mermaid`, use the versions in `npm view mermaid@<version> dependencies`.
- Which build is installed: `npm ls mermaid @mermaid-js/core @mermaid-js/diagram-flowchart`.

## 7. CI later, in the OSS repo

Once v13 moves to `mermaid-js/mermaid`, the steps of §5 run in GitHub Actions. The same tools run, with no manual commands and with provenance.

**Branch.** v13 lives on its own long-lived branch (`v13`), not on `develop` or `master`. Pre mode is state of the branch (`.changeset/pre.json`): on `develop` it would turn every v12 release into an alpha. `baseBranch` in `.changeset/config.json` becomes `v13`. At the v13 stable release, `changeset pre exit` runs on `v13` and the branch merges into `develop`.

**Pull requests** target `v13`:

1. The contributor adds a changeset (§3). The Changesets bot (a GitHub app), if installed, comments when a PR that changes a published package has none.
2. CI runs `pnpm check`, `pnpm build`, the bench and visual jobs, and `pnpm release:rehearse`, so a PR that breaks packing, installing or the published types fails before merge.

**Merge to `v13`.** The release workflow runs `changesets/action` (as `mermaid-js/mermaid` already does for v12 on `master`):

- **Changesets pending:** it opens or updates a PR titled *Version Packages (alpha)*. The PR holds the result of step 3: bumped versions, dependents, CHANGELOGs and `version.ts` (the action's `version` script runs `changeset version && release:sync-version`). Each merged PR updates it. Nothing is published yet.
- **Version Packages PR merged** (no changesets pending, versions not on npm): the action's `publish` script runs `release:publish --target public --gate …` (or `--skip-gate`), then `changeset tag`. Provenance works through npm trusted publishing (OIDC), with no token. The action pushes the tags and creates GitHub releases.

So **an alpha goes out when the release master merges the Version Packages PR.** They can do this as often as they like, many times a day, without a bot pushing to a protected branch. To publish on every merge instead, the workflow runs `release:ensure-changeset` (which adds a `mermaid` patch when a merge brought no changeset) and publishes directly. That is today's `.github/workflows/release.yml`, which is turned off (`RELEASE_ALPHA` unset).

**Before the switch:**

- Add `mermaid-js/mermaid`'s release workflow as the npm trusted publisher of `@mermaid-js/core`, `@mermaid-js/diagram-flowchart`, `@mermaid-js/diagram-class` and `@mermaid-js/plugin-interactions` (it already is for `mermaid`).
- Set `repository.url` in every published package.json to `https://github.com/mermaid-js/mermaid`. npm provenance requires it to match the publishing repository, and the repository must be public.
- Set `changelog` in `.changeset/config.json` to repo `mermaid-js/mermaid`.
- Decide whether the release job runs the full bench (`--gate`, about an hour) or relies on the nightly bench (`--skip-gate`).

## 8. Where the code is

- `.changeset/config.json`, `.changeset/pre.json`: Changesets setup (independent versions, pre mode `alpha`).
- `tools/release/src/`:
  - `preflight*.ts`: preflight and release plan.
  - `version-file*.ts`: `version.ts` sync.
  - `manifest.ts`: published manifest, leak, exact-range and dangling-export gates.
  - `publish*.ts`: pack and publish.
  - `public-gate*.ts`: R-PERF gate.
  - `changesets*.ts`: `ensure-changeset`.
  - `rehearse-cli.ts`: local rehearsal (consumer fixtures in `tools/release/fixtures/rehearsal/`).
  - `adapters-check.ts`, `adapters-pack-cli.ts`: the editor adapters' pack-and-install checks (fixtures in `tools/release/fixtures/adapters/`); `pnpm exec tsx tools/release/src/adapters-pack-cli.ts` runs them without a registry, in `.tmp/adapters-pack-check/`.
- `.github/workflows/release-alpha.yml`: the manual release workflow (§5).
- `.github/workflows/release.yml`: the CI publish-on-merge flow (off).
