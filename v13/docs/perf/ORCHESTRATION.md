# Codex agent orchestration

P23/P24 select Codex with GPT-6 Astra and reasoning effort assigned by role and hypothesis.
[orchestration.json](orchestration.json) is the machine-readable assignment source. The helper
`tools/perf/agent-assignment.mjs` resolves it into explicit spawn overrides; it does not launch work.
The coordinator applies these overrides on every dispatch. The benchmark scheduler and its
exclusive measurement lock remain separate work in [HARNESS.md](HARNESS.md).

## Dispatch

1. Finish round 0 and freeze the round base before dispatching optimization implementers. Harness
   preparation may use the harness-engineer role earlier. Dispatch only outside measurement windows.
2. Resolve the assignment, for example:

   ```sh
   volta run --node 24.16.0 node tools/perf/agent-assignment.mjs --role implementer --hypothesis 5a
   ```

3. Pass the resulting `spawnOverrides` as explicit fields on `spawn_agent`, adding a unique
   `task_name` and self-contained `message`. The message names the absolute worktree path, full
   base SHA, hypothesis claim, counter, kill condition, permitted files, checks, evidence locations
   and expected completion report. Each implementer owns one worktree; every command must use
   that directory explicitly when the subagent shares the coordinator's working directory.
4. Use `fork_turns: "none"` with explicit model/effort overrides. Supply the required context in
   the message and links to these documents. Full-history forks in this session's tool interface
   inherit the parent's settings and cannot receive model/effort overrides.
5. Record requested and actual model/effort, role, agent/session id and hypothesis in the round
   ledger. A missing model or unavailable override blocks dispatch; do not silently substitute.

For the current collaboration tool, a bounded implementation uses this shape:

```json
{
  "task_name": "round1_5a",
  "model": "gpt-6-astra",
  "reasoning_effort": "medium",
  "fork_turns": "none",
  "message": "<self-contained assignment with the explicit worktree and evidence paths>"
}
```

The generator, coordinator, reviewer and harness-engineer roles use high. Round-1 implementer
assignments are in the hypothesis table and JSON; new hypotheses must be classified before
dispatch. An implementation cannot choose medium simply because the coordinator used it before.
Review uses a separate context and high effort, including when the implementation used medium.

## Escalation

When a medium task encounters an unplanned design decision, persistent correctness failures or
an unexplained counter result, the implementer stops with an escalation report: current branch
and diff, checks/failures, evidence and the exact unresolved question. The coordinator ends that
worker's activity, preserves its worktree, and resolves a replacement assignment:

```sh
volta run --node 24.16.0 node tools/perf/agent-assignment.mjs \
  --role implementer --hypothesis 5a \
  --escalation-reason 'Blank-label behavior depends on an undocumented placeholder invariant'
```

Launch the replacement with high effort and the handoff. Sending a follow-up message saying
“think harder” does not change the worker's configured effort. Record the escalation and its
reason. Do not allow the old and replacement agents to write the worktree simultaneously.

## Measurement boundary

The coordinator joins workers and stops their builds/tests before entering a measurement window.
Generation, implementation, review and coordinator reasoning pause while the serial runner works.
Measurement, fit evaluation and ledger generation use scripts. Agent review can inspect those
results afterward but cannot override a failed gate. Global Codex configuration is unchanged;
these explicit assignments apply to this effort.

Official reference: [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
The explicit spawn settings prevent accidental inheritance of the parent's reasoning effort.
