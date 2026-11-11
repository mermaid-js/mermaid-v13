/** Resolve explicit model/effort overrides for a Codex subagent. Does not launch an agent. */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    role: { type: 'string' },
    hypothesis: { type: 'string' },
    'escalation-reason': { type: 'string' },
  },
});
const policy = JSON.parse(
  readFileSync(new URL('../../v13/docs/perf/orchestration.json', import.meta.url), 'utf8')
);
if (!Object.hasOwn(policy.roles, values.role ?? ''))
  throw new Error(`Choose --role from: ${Object.keys(policy.roles).join(', ')}`);
if (values.role === 'implementer' && !values.hypothesis)
  throw new Error(
    'Implementers require --hypothesis; unclassified work must not default to medium'
  );
if (values.hypothesis && !Object.hasOwn(policy.round1, values.hypothesis))
  throw new Error('Unknown hypothesis: add its reviewed effort assignment to the policy first');
const hypothesis = values.hypothesis ? policy.round1[values.hypothesis] : undefined;
const initialEffort =
  values.role === 'implementer' ? hypothesis.effort : policy.roles[values.role].effort;
const escalationReason = values['escalation-reason'];
if (escalationReason !== undefined && !escalationReason.trim())
  throw new Error('Escalation requires a nonempty reason');
if (escalationReason !== undefined && initialEffort !== policy.escalation.from)
  throw new Error('This assignment already uses high effort');
console.log(
  JSON.stringify(
    {
      role: values.role,
      hypothesis: values.hypothesis ?? null,
      reason: hypothesis?.reason ?? `Role default: ${values.role}`,
      escalationReason: escalationReason ?? null,
      spawnOverrides: {
        model: policy.model,
        reasoning_effort: escalationReason ? policy.escalation.to : initialEffort,
        fork_turns: policy.forkTurns,
      },
    },
    null,
    2
  )
);
