# State spec #127: questions for the maintainer (all answered)

Answers (draft PR #195): 1 → **D126 A** (v12's actual values). 2 → **D126 A** (add `compositeBackground` to #193). 3 → **D127 C** (`state.layout` defaults to layered; ELK only when an author sets it, R-LAYOUT-7).

Nothing here blocks the final-review fixes, which are running now. Questions 1 and 2 block moving #160 out of draft, because the renderer has to adopt #192 first.

## 1. #192 / PR #193: which values for `compositeTitleBackground` and `altBackground`?

The ticket summarised them as "`clusterBkg` in redux; `mainBkg` and `#f0f0f0` in classic". v12 12.2.0's theme files (checked in `git show fa796a943:packages/mermaid/src/themes/`) actually have:

| Themes | compositeTitleBackground | altBackground |
| --- | --- | --- |
| redux, redux-color | `#f9f9fb` | `#f9f9fb` |
| redux-dark, redux-dark-color | `#16141f` (their `clusterBkg` is `#1e1a2e`) | `#16141f` |
| default, forest | `mainBkg` | `#f0f0f0` |
| dark | `mainBkg` | `#555555` |
| neutral | `mainBkg` | `#f4f4f4` |
| base | `mainBkg` | `tertiaryColor` |

- **A (recommended, what PR #193 does now):** v12's actual values, as above. The redux values are fixed literals, as in v12, so they don't follow a `clusterBkg` override.
- **B:** the ticket's literal mapping: `clusterBkg` in all four redux themes, and `mainBkg` / `#f0f0f0` in every classic theme. This is a small change to the theme specs and tests. It differs from v12 in redux-dark, dark and neutral.

## 2. #192 / PR #193: also add `compositeBackground`?

v12 has a third state variable, `compositeBackground`, for the composite body. v13 draws the body with `background`. That matches v12 everywhere except redux-dark and redux-dark-color, where v12 uses `#16141f` and v13 draws `#333333`.

- **A (recommended):** add it to PR #193 with v12's values, `background` everywhere and `#16141f` in redux-dark and redux-dark-color. It's about 6 lines plus tests, and it brings the redux-dark composite body back to v12.
- **B:** leave it out and list it in MIGRATION.md as a redux-dark difference.

## 3. `state.layout` default (from T5, #148)

v12's `state.layout` defaults to `elk`. T5 kept that default. With no ELK plugin registered (ELK is M3.5, D106), state draws with `layered` and gives no warning. It switches to ELK as soon as an ELK plugin is registered. MIGRATION.md describes this.

- **A (recommended):** keep it as it is. It's v12 parity, and it gives the right result once the ELK plugin ships.
- **B:** warn when the layout falls back from `elk` to `layered`, once per render, the way pitfall 22 says to warn about an option that can't be honoured.
- **C:** change the v13 default to `layered`. That changes a v12 default.

## 4. `A:::cls` that sets no class (from the final review fixes) — ANSWERED: D128, A, warn (`CLASS_NOT_APPLIED`)

In v12, `extract` applies `:::` only from top-level transitions. So `A:::cls` written on its own line (any scope), or `A:::cls` inside a composite, sets no class. v13 keeps that (parity), but gives no warning, while the review fixes added no-op warnings for the other ignored statements (`IGNORED_IN_COMPOSITE`, `LINK_NOT_DRAWN`, `SCALE_IGNORED`; pitfall 22).

- **A (recommended):** warn `CLASS_NOT_APPLIED` on the `:::cls` part, rendering stays the same as v12. This matches pitfall 22 and the other no-op warnings, and it's small.
- **B:** apply the class anyway, which changes v12 output for these inputs.
- **C:** leave it as is, silent, and list it in MIGRATION.md.
