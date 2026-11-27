---
name: pr-perf-review
description: Measure what merging a pull request does to flowchart render speed, output and bundle size, and post the result as a comment on the pull request. Use when asked for a performance review of a PR, or invoked as /pr-perf-review followed by a PR number or link. Runs on host builder only, takes about 20 minutes, compares main against the PR merged into main with the perf harness's short profile.
---

# Performance review of a pull request

Argument: a pull request number or link of `mermaid-js/mermaid-v13`. Optional words after it:
`no post` (measure and show the comment, post nothing), `head` (compare against the PR's own head
instead of the merge result, see step 2).

The goal is one comment that tells the reviewer whether merging makes flowchart rendering faster
or slower, and by how much. The measurement is done by `tools/perf/compare.mjs` on the perf
harness branch; this skill finds the two commits, runs it, and posts its `comment.md`. Read
`v13/docs/perf/PROFILES.md` in the harness worktree if you need the method.

Invoking this skill is the user's approval to post one comment on that pull request. It is not
approval for anything else on GitHub.

## Fixed facts

- Host: `builder` only. The frozen sample of 5,000 flowcharts and the pinned toolchain live there.
- Harness worktree: `$MERMAID_PERF_HARNESS`, default `/home/dino/repos/mermaid-v13-perf-harness-short`
  (branch `chore/perf-short-profile`). The harness is not on main.
- Environment for every harness command:

  ```sh
  export PATH="/home/dino/repos/mermaid-v13-perf-r3/.tmp/perf-tools/bin:$HOME/.volta/tools/image/node/24.16.0/bin:$PATH"
  unset NODE_OPTIONS
  export MERMAID_PERF_HOST=builder MERMAID_PERF_LAB=/home/dino/repos/mermaid-perf-lab
  ```

- Timing lock shared by every measurement on the machine:
  `/home/dino/repos/mermaid-v13/.tmp/perf-r4-timing.lock`.

## 1. Check before measuring

Stop with a plain message, and measure nothing, if any of these fails.

1. `hostname` is `builder` and the harness worktree exists with `tools/perf/compare.mjs`. The
   harness worktree is clean (`git status --short` empty); never edit it from this skill.
2. Read the pull request:
   `gh pr view <n> --repo mermaid-js/mermaid-v13 --json number,title,state,url,baseRefName,headRefOid,isCrossRepository,mergeable,files`.
   - Base branch is not `mermaid-v13`: say so and stop.
   - `isCrossRepository` is true (a fork): building it runs its code on builder. Ask the user
     before going on, and go on only on a clear yes.
   - No changed file under `packages/`: the harness measures only `packages/`, so the result
     would be "no change". Tell the user and stop, unless they ask to run it anyway.
   - Closed or merged: say so and ask whether to measure it anyway.
3. No other measurement is running: `pgrep -af 'candidates.mjs|round.mjs|compare.mjs|run-checks.mjs'`
   prints nothing. If one is running, say which and stop; do not queue behind a formal run.

## 2. Pick the two commits

In the harness worktree:

```sh
git fetch origin mermaid-v13 "+refs/pull/<n>/head:refs/perf-review/<n>/head" "+refs/pull/<n>/merge:refs/perf-review/<n>/merge"
```

- Default, when the merge ref was fetched and `mergeable` is `MERGEABLE`: **head** is
  `refs/perf-review/<n>/merge` (GitHub's test merge of the PR into main) and **base** is its first
  parent (`<merge>^1`, the main commit it was merged into). This measures exactly what merging
  does, also when the PR branch is behind main. Check that `<merge>^2` equals `headRefOid`; if it
  does not, GitHub has not rebuilt the merge ref yet: wait a minute, fetch again, and after three
  tries fall back as below.
- Fallback, when the PR conflicts with main or has no merge ref, or the user passed `head`:
  **head** is the PR head and **base** is `git merge-base origin/mermaid-v13 <PR head>`. Say in the
  comment's footer line (step 4) that the PR was measured against the main commit it branched
  from, not current main.

Resolve both to full shas and tell the user which two commits will be compared.

## 3. Run the comparison, and stay silent

A running Claude session has invalidated measurements on this machine before. So: start the run
in the background, then make **no tool calls and write nothing** until it exits. Do not poll its
output, do not check status, do not start agents. Tell the user before starting that it takes
about 20 minutes (about 12 when the base commit was measured before) and that you will be silent.

```sh
cd "$HARNESS" && flock /home/dino/repos/mermaid-v13/.tmp/perf-r4-timing.lock \
  node tools/perf/compare.mjs --base <base sha> --head <head sha> --profile short \
  --out .tmp/pr-perf-review/<n>-<head sha, 9 chars>-<yyyymmdd-hhmm> \
  > .tmp/pr-perf-review/<n>-<...>.log 2>&1; echo "exit $?"
```

Create `.tmp/pr-perf-review/` first; the `--out` directory itself must not exist. Run this with
the Bash tool's `run_in_background` and wait for its completion notice.

Exit codes:

| Code | Meaning | What to do |
| --- | --- | --- |
| 0 | Verdict written | Step 4 |
| 2 | Refused (host, tools, sample, or a commit that does not build on the harness's main) | Report the message. If it names the harness's main, the PR is based on a main older than the harness: ask the author to merge main, or use `head` mode only if the message allows it |
| 3 | A side could not be prepared (install, graft or build) | Report the step and the log path it names. A PR that changes `packages/mermaid/src/api.ts` near the harness seam, or moves an instrumentation anchor, cannot be measured: say so; post nothing |
| 4 | Host never quiet, or runs stayed contaminated | Say what was busy (the log names it). Offer to retry later; post nothing |
| 5 | A measurement job failed, for example the PR breaks rendering of a timed diagram | Report it to the user. This is a finding about the PR: with the user's yes, post a short comment saying which diagrams fail, from the log |

Never retry by weakening anything (fewer blocks, skipping the quiet check, another profile).

## 4. Post the comment

1. Read `<out>/comment.md` and `<out>/summary.json`. Show the comment text to the user in the
   session.
2. Sanity checks before posting; on any failure show the user and do not post:
   - the two shas in the comment are the ones from step 2;
   - the comment contains a verdict line, the noise band, and the size table;
   - `summary.json` says the profile is `short` and the run was not contaminated.
3. Append one footer line to a copy of the comment, never to the harness's file:
   `Measured on builder by /pr-perf-review: main <base sha, 9 chars> against this pull request merged into it (<head sha, 9 chars>). Short screening profile; a long formal run is the delivery measure.`
   In fallback mode replace "this pull request merged into it" with "this pull request's head,
   which branches from that commit, not from current main".
4. Unless the user said `no post`:
   `gh pr comment <n> --repo mermaid-js/mermaid-v13 --body-file <copy>`.
   Post a new comment each time; do not edit or delete earlier ones.
5. Tell the user: the verdict in one sentence with the percentage, whether output changed, the
   size change, the link the `gh` command printed, the wall time, and the output directory.

## Rules

- Report what the comparison says. "No measurable change" is a result; do not round a figure
  inside the noise band into "slightly faster".
- The figure is for flowcharts only, from a short screening run. Do not present it as a formal
  round result, and do not use it to approve or block the pull request yourself.
- Do not commit, push, or change files in the harness worktree or in the pull request's branch.
- Do not include anything about the user or the machine beyond the host name `builder` in the
  comment.
- If two reviews are asked for, run them one after the other; the base side of the second is
  cached when main has not moved.
