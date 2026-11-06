# Gaps (spec #294)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #380 T0 tree engine
- **Choice:** D284 names the field `DiagramPlugin.layout?: { default, aliases }`, but `layout` is already the plugin's layout method (`packages/core/src/pipeline/types.ts:160`, DESIGN §12.1). The field is `layoutEngine?: { default: string; aliases?: Record<string, string> }` instead; same semantics. DESIGN §12.1 and D284's wording follow in T0.
- **Choice:** the plugin default is applied as the plugin-defaults config layer (`packages/mermaid/src/config-snapshot.ts`, as `flowchart-elk` sets `layout: 'elk'`), above core defaults and below `initialize`, front matter and directives: that is "no layer sets `layout`" without a new registry field.

## #383 T1 lexer

## #386 T2 parser

## #387 T3 layout

## #388 T4 renderer

## #389 T6 language facet

## #390 T5 integration

## #328 icons I5

## #344 hand-drawn H4
