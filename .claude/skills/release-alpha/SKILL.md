---
name: release-alpha
description: Release Mermaid v13 alpha packages (mermaid, @mermaid-js/*) to npm by hand, or check what a release would ship. Use when asked to release, publish or cut an alpha, to see what is pending, or to finish a release that failed half way. Runs the preflight and checks, versions with Changesets, rehearses on a local registry, publishes and tags, and asks before each step that leaves the machine.
---

# Release the v13 alpha

Follow `v13/docs/RELEASING.md` §5. Read it first if you haven't in this session: it explains the versioning (independent `13.0.0-alpha.N` per package, dependents re-released, exact pins) that you will report to the user.

Arguments: `dry run` (or `plan`) stops after step 4 and publishes nothing. `in CI` (or `on GitHub`) runs the release with the *Release alpha (manual)* workflow instead of on this machine: see *In CI* below.

## In CI

Run step 1 (preflight) locally for the plan, then ask before starting anything. Show the plan and whether it is a dry run.

```bash
gh workflow run release-alpha.yml -f dry_run=true          # or dry_run=false to release
gh run list --workflow release-alpha.yml --limit 1         # the run id
gh run watch <id> --exit-status
```

Report the run's summary (`gh run view <id>`): its published lines. A real run (`dry_run=false`) is an outward step: it needs a yes, like step 5. If the run waits for approval in the `npm-alpha` environment, tell the user. On failure, show the failing step (`gh run view <id> --log-failed`). Re-running is safe.

`@mermaid-js/layout-elk` refuses the CI token (`E403 … Two-factor authentication is required … automation token`), and it is re-released with every core change. A CI release then stops there: the version commit is pushed and the packages before it are out, but the rest are not, and nothing is tagged. Finish on this machine from step 5 (*Partial publish*). Warn the user about this before a real CI run, unless the npm setting has been changed (`v13/docs/RELEASING.md`, *npm release token*).

## Rules

- **Ask before every outward step**: pushing the version commit, `release:publish`, pushing tags. Show what will happen (packages and versions) and wait for a yes. A yes covers that step of this release only.
- Never pass `--force`, never `npm unpublish`, never `changeset pre exit`. Never edit versions, `version.ts` or CHANGELOGs by hand.
- `--skip-gate` needs a reason from the user. Offer `"manual alpha"`, and quote what they choose.
- npm auth: if the shell has a `mermaid-release` function (`type mermaid-release`), prefix `release:preflight` and `release:publish` with it. It runs them with the release token from the Keychain (`v13/docs/RELEASING.md`, *npm release token*), so no `--otp` is needed. Otherwise, if npm asks for a one-time password (`EOTP`), ask the user for a fresh code and re-run the same publish command with `--otp <code>`. Versions already published are skipped.
- `@mermaid-js/layout-elk` refuses the release token (`E403`, 2FA required), so it always needs the user's own login and `--otp`. Preflight checks the login through the token, not the user's own. Before asking for a code, run `npm whoami` without the prefix. An expired login answers a publish with `E404 Not Found - PUT`, and that wastes the code. If it fails, ask the user to run `! npm login`.
- A one-time code lasts about 30 seconds and works for one command. Ask for it right before the command that uses it.
- Never print, echo or log the token, and never write it to a file.
- On a failed check, stop and report it with its output. Don't work around it.
- Run commands from the repository root with the Node in `.node-version`.

## Steps

1. **Preflight.** Run `pnpm release:preflight`. Report its ✘ and ⚠ lines, the release plan and the next step.
   - *Nothing to release*: say so and stop.
   - ✘ lines: stop. Common fixes: `git pull`, `git stash` (ask first), `npm login`, `gh auth login`.
   - *Next: build and publish* (versioned earlier, never published): skip to step 4.

2. **Checks.** Run `pnpm check`. It must pass. If it fails, show the failing part and stop. Only the user can decide to release anyway.

3. **Version.** Explain the plan in plain words: which packages change because of a changeset, and which only because they depend on one (marked *dependent*). Then:
   ```bash
   GITHUB_TOKEN=$(gh auth token) pnpm changeset version
   pnpm release:sync-version
   pnpm exec prettier --write .changeset "packages/*/package.json"
   git add -A && git commit -m "chore(release): version packages"
   ```
   Show `git show --stat HEAD` and the new CHANGELOG entries. Ask to push: `git push origin mermaid-v13`. If the push is rejected by branch protection, tell the user to merge the commit through a PR, then continue from step 1 on the merged commit.

4. **Build and rehearse.**
   ```bash
   pnpm build
   pnpm release:rehearse
   ```
   Every check must be ✔. Report the bundle sizes it prints. If *guide snippets* fails on `Missing expected rejection`, ZenUML was ported: `tools/release/fixtures/rehearsal/full.mjs` and the specs use it as their `UNSUPPORTED_DIAGRAM` example, because every other v12 type has a package. Switch them to text no detector knows, ask the user before committing and pushing that change, then re-run the rehearsal. For `dry run`, stop here: say what would publish and that nothing left the machine. Also say that the version commit from step 3 is local, if it wasn't pushed. Ask whether to keep it or drop it (`git reset --hard HEAD~1`, only with a yes).

5. **Publish.** List each `name@version` that `release:preflight` reports as *not on the registry yet*, and ask for a yes. Then:
   ```bash
   mermaid-release pnpm release:publish --target public --no-provenance --skip-gate "<reason>"   # or without the prefix, plus --otp
   ```
   It first prints the last known bench (R-PERF-1…4, not enforced). It reads `packages/bench`'s local `latest.json` first, which may be an old partial run, so say where the numbers came from. Show those lines to the user, and say plainly when a check fails (for example R-PERF-3 below 50×). Save the output to a file (`> publish.log 2>&1`): npm's error is at the end of a long tarball listing, and npm may not keep a log of it. Report every `published:` and `already published:` line. On an error, show it.

   **Partial publish.** The script stops at the first failed package, usually layout-elk. To finish:
   - Check what is out with the tarball URL (`curl -o /dev/null -w '%{http_code}' https://registry.npmjs.org/@mermaid-js/<pkg>/-/<pkg>-<version>.tgz`), not `npm view`. For a brand-new package, `npm view` and the package page answer a cached 404 for about 5 minutes after the publish.
   - So a re-run of `release:publish` within those minutes tries to publish the new packages again and fails on them. Publish the remaining tarballs from `dist/release/public/` directly instead. This is the same command the script runs, with the user's login: `npm publish <tarball> --tag v13-alpha --registry https://registry.npmjs.org/ --access public --otp <code>`.
   - Don't rebuild or repack between attempts. Use the tarballs from the version commit's build.

   **The branch moved.** If other merges land on `mermaid-v13` after the version commit, don't rebase or rebuild before publishing: their code has no changeset in this release. Publish the build from the version commit, and push your own fixes afterwards with a rebase.

6. **Tag.** Tag the version commit, not whatever HEAD is now:
   ```bash
   git switch --detach <version commit> && pnpm changeset tag && git switch mermaid-v13
   git tag --points-at <version commit>    # one tag per released package
   ```
   Ask, then push only those tags: `git push origin $(git tag --points-at <version commit> | sed 's#^#refs/tags/#')`.

7. **Confirm.** Run `pnpm release:preflight` again: it should report *Nothing to release*. Run `npm view mermaid dist-tags`: `v13-alpha` should be the new version and `latest` still 12.x. Finish with the released `name@version` list and the install line: `npm install mermaid@v13-alpha --save-exact`. New packages can take a few minutes to appear (npm caches the 404). Check the tarball URL before reporting a failure, and `git ls-remote --tags origin` for the tags.

8. **Docs.** Offer to update the public alpha page: in the OSS repo mermaid-js/mermaid, edit `packages/mermaid/src/docs/intro/v13-alpha.md` and regenerate `docs/intro/v13-alpha.md` from it. Update the diagram list and table, text output, the *Alpha builds* table, and the example versions. Open the PR against `master` so the live site updates (#8704, #8734 are earlier ones), and only after the publish is complete. Check facts against the published build (`detectType`, `supportsFormat`), not the changelog alone.
