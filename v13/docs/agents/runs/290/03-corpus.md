# Journey corpus: `e2e/diagrams/journey/**/*.mmd`

**18 files: 11 `pr-check`, 7 `nightly-check`, `visual-check` empty** (only `.gitkeep`). Spec #290 says 12 / 6; the tree has 11 / 7. No `baseline/` folder yet. Every file has YAML front matter with a `description:`; config lives in front matter except the four classic theme files, which use an in-body `%%{init}%%` directive. Plus 7 `parse()` strings in v12 `journey.spec.js` (see 01).

Quirk tags: **NaN** score not a number · **''** empty actor (`Task: 5:`) · **noppl** task without actors (`Task: 5`) · **rep** repeated non-adjacent section · **empty** section with no tasks · **8sec** eight sections (v12 slot 7 wraps to `section-type-0`, D241) · **wrap** legend wrap past `maxLabelWidth` · **hyph** v12 per-char hyphenation · **widen** legend line > `leftMargin/2` widens the margin (D242) · **ws** untrimmed names/title (`title  X`, `name :`) · **acc** accTitle/accDescr · **multi** an actor in several tasks / several actors per task.

## pr-check (11)
| File | Config | Content | Hits |
| --- | --- | --- | --- |
| `pr-check/default-theme.mmd` | `%%{init: theme default}%%` | accTitle, accDescr, blank line, title, 2 sections (Go to work: 3 tasks, Go home: 2), `Do work: 1: Me, Cat` | acc, multi, score 1 and 3 |
| `pr-check/dark-theme.mmd` | `%%{init: theme dark}%%` | same body | acc, dark title (v12 `fill=""` → black, D248) |
| `pr-check/forest-theme.mmd` | `%%{init: theme forest}%%` | same body | acc |
| `pr-check/neutral-theme.mmd` | `%%{init: theme neutral}%%` | same body | acc |
| `pr-check/redux-theme.mmd` | `theme: redux` | title + 8 sections (Browse, Cart, Pay, Fulfil, Deliver, Support, Return, Close), 12 tasks, actors Visitor/Warehouse/Courier | 8sec |
| `pr-check/redux-dark-theme.mmd` | `theme: redux-dark` | same body | 8sec |
| `pr-check/redux-color-theme.mmd` | `theme: redux-color` | same body | 8sec, `bkgColorArray` fills |
| `pr-check/redux-dark-color-theme.mmd` | `theme: redux-dark-color` | same body | 8sec, 900-shade fills |
| `pr-check/should-render-a-user-journey-chart.mmd` | none | title, 2 sections, tasks at column 2 (same indent as `section`), `Sit down: 3` | multi |
| `pr-check/should-render-a-user-journey-diagram-when-usemaxwidth-is-false.mmd` | `journey.useMaxWidth: false` | title `E-Commerce`, 2 sections × 1 task, actor `Me` | useMaxWidth false (width/height attrs) |
| `pr-check/simple-test.mmd` | none | title + `section Order from website`, no tasks | empty: v12 draws no band, no task; legend empty; only title + activity line |

## nightly-check (7)
| File | Config | Content | Hits |
| --- | --- | --- | --- |
| `nightly-check/left-margin-150px.mmd` | `maxLabelWidth 320`, `useMaxWidth true` | title, Onboarding: 3 × `Name: n:` ; Engagement: 2 × `Name: n` | '', noppl (the `''` actor is the only legend row: nameless, `actorColours[0]`, D244) |
| `nightly-check/legend-diagram-spacing-long-labels.mmd` | `useMaxWidth true` | `title  Web hook life cycle` (two blanks), sections Darkoob, External Service, **Darkoob** again; `register slug : 5: Darkoob userf deliberately … maintained` (very long actor, two inner blanks); `: 5 :  External Service`; names with trailing blank | rep (3 bands in v12), wrap (default 360), widen, ws, multi |
| `nightly-check/single-word-hyphenation.mmd` | `maxLabelWidth 100` | `VeryLongWord: 5: Supercalifragilisticexpialidocious` | hyph (v12 emits `…-` pieces per `journeyRenderer.ts:66-80`; v13 breaks with no hyphen, D225), widen |
| `nightly-check/title-styling.mmd` | `titleColor '#2900A5'`, `titleFontFamily 'Times New Roman'`, `titleFontSize '5rem'` | title, 3 sections (Onboarding, Engagement, Retention), `Sign Up: 5: John, Shahir`; then a blank line and `size: 2rem` | **NaN**: `size: 2rem` is a 7th task in Retention, score `Number(' 2rem')` = NaN (v12 `cy="NaN"`, flat mouth; D226 draws it at 3, one `JOURNEY_SCORE` warning); title keys honoured; `5rem` via `fontSizePx` |
| `nightly-check/usemaxwidth-true.mmd` | `useMaxWidth true` | same body as the useMaxWidth-false file | useMaxWidth true (`width=100%`, `max-width`) |
| `nightly-check/whitespace-wrapping-no-hyphens.mmd` | `maxLabelWidth 200` | `TextWithSpaces: 5: Gustavo Fring is played by …` (one long multi-word actor) | wrap (word breaks, no hyphen), widen |
| `nightly-check/wrap-long-labels-multiline-margins.mmd` | `maxLabelWidth 320` | Onboarding: 3 tasks, each with its own long multi-word actor; Engagement: 2 tasks with no actors | wrap (3 multi-line legend rows: row advance `lines × 20`), widen, noppl |

## Not in the corpus (cover in generated/unit cases)
- Tasks before the first `section` (v12: section `''`, no band, fill `#CCC`, slot 0 for the next band).
- Score `0`, `7`, `10`, negative, `0x10`, blank (`Task: :A` → 0); `3` vs NaN mouth.
- `accDescr { … }` multiline (only in `journey.spec.js` L32-40, glued `}title`), `accTitle:` at line end, bare `title`/`section` taking the next line (spec #290 T1 list).
- `%%` mid-line (`T: 5 %% note`), `#` comments, `;`, CRLF, U+2028.
- Front-matter `title:` (D218), `<br>` in section/task names (`journey.spec.js` L66-69 section only), duplicate actor in one task (`A, A`: two dots in v12), integer-like actor names (`1`, `2`: v12 legend order differs from colour order), more than 6 actors (colours cycle), more than 9 actors (v12 bounds `nActors*50` exceed 450).
- Non-default `textPlacement` (`tspan`, `old`), `sectionFills`/`sectionColours` (D241/D225).
