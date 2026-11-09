# Gaps and choices, spec #525

Unmet acceptance criteria and choices the spec and D-ids don't decide, under the ticket that owns each. Items that visibly change rendering for existing documents are marked **needs a D-id**.

## T0 #590

## T0b #591

## T0c #592

## T1 #594

## T2 #599

## T3 #607

## T4 #614

## T5 #618

- `DiagramManifest` (`tools/gen-config/src/registry.ts:67-85`) has no `layout` field, against the spec's manifest bullet. Choice: the default goes in `plugin.layoutEngine: { default: 'compass' }` (D284), as mindmap does; the manifest gets no new field. No rendering effect.
- `useWidth`/`useMaxWidth` have no architecture rows of their own; add them as venn does (`config.schema.yaml`).
- No existing spec asserts `UNSUPPORTED_DIAGRAM` for architecture; add `packages/mermaid/src/architecture.spec.ts` as venn did.

## T6 #619
