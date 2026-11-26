# Writing an extension plugin

An extension plugin changes how Mermaid v13 draws without adding a diagram type: it draws math or icons in labels, sketches outlines, binds click handlers, or lays out labels its own way. This guide is for the author of one, first-party or not. The contract is in [DESIGN.md](DESIGN.md) §12.2 and typed in `packages/core/src/pipeline/extensions.ts`; this guide says how to use it, what each part costs, and how to test.

The first-party extensions are the examples to read:

| Package | What it does | Parts of the API it uses |
| --- | --- | --- |
| `plugin-math` | Typesets `$$…$$` in labels | `inline` (a delimiter pair), `resources` |
| `plugin-icons` | Draws `fa:fa-…` in labels and icons outside them | `inline` (a pattern), `glyphs`, `postRender`, `resources`, `claims` |
| `plugin-hand-drawn` | Sketches outlines | `outline`, `postLayout`, `config` |
| `plugin-interactions` | Binds click callbacks and menus | `postParse`, `afterMount`, `claims` |
| `plugin-html-labels` | Draws labels as HTML in the mounted diagram | `label`, `afterMount`, `config` |

What the API cannot do yet is listed in [plugin-api-gaps.md](plugin-api-gaps.md).

## The smallest extension

```ts
import type { ExtensionPlugin } from '@mermaid-js/core';

export const shout: ExtensionPlugin = {
  id: 'shout',
  postLayout(laidOut, ctx) {
    if (laidOut.kind === 'graph') ctx.warn({ code: 'SHOUT', message: 'A graph was laid out.' });
    return laidOut;
  },
};
```

```ts
await mermaid.registerExternalDiagrams([shout]);
```

An extension is a plain object with an `id` and any of the parts below. It is registered in code, on one API object (`mermaid` or the result of `createMermaid()`). Registering an id again replaces the earlier extension and keeps its place in the order. A package can also declare the extension in its `package.json`, so that `@mermaid-js/plugin-autoload` and the bundler plugin find it (DESIGN §12.4):

```json
"mermaid": { "plugin": "extension", "id": "shout", "entry": "./dist/index.js", "export": "shout" }
```

Diagram text can never turn an extension on. Only the page that registers it can.

## Which part to use

Every part is optional. Parts run in registration order, and each gets the render's frozen context, so an extension cannot change the config.

| Part | Runs | Use it to | What it costs every render |
| --- | --- | --- | --- |
| `postParse(ast, ctx)` | After the parse | Read what the diagram text says (click callbacks) | **The full parse.** Without an AST reader, a draw parses lean (DESIGN §4.2). With one, every render pays for the AST and for `data-ast` on the drawn elements |
| `postLayout(laidOut, ctx)` | After layout | Read or adjust positions. Check `laidOut.kind` and `laidOut.diagram`; return the same `kind` | Little |
| `postRender(tree, ctx)` | After the draw | Edit the drawn SVG as a tree | **The tree writer.** Without this hook the writer streams a string. With it, the whole render builds a tree first, and core checks the allow-list again afterwards |
| `afterMount(el, result, state)` | When the SVG is in the page | Bind handlers, add DOM | Nothing until the diagram is mounted. Only `run()`, `mount()` and `result.bindFunctions(el)` call it |
| `inline` | During label layout | Draw a span of a label (`$$…$$`, `fa:fa-car`) as a measured SVG box | A regex search per label |
| `label` | During label layout | Lay out a whole label yourself | One call per label |
| `glyphs` | During the draw | Draw an icon a diagram places outside a label | One call per icon |
| `outline` | During the draw | Draw node, group and edge outlines another way | One call per outline, when `active` says so |
| `resources` | In `prepare()` | Load an engine or data lazily | One synchronous `missing()` call |
| `config` | At registration | Own config keys, defaults, aliases and theme variables | Nothing |
| `claims` | At registration | Say that you handle a feature, so core does not warn about it (`callbacks`, `menus`, `icons`) | Nothing |

Two rules follow from the cost column. Do not add `postParse` to read the config or to carry state: providers and drawers get the context without it. Do not add `postRender` to read something you produced yourself: note it while you produce it (see [State](#state)).

Text output (`format: 'ascii'`) never asks `inline`, `label`, `glyphs` or `outline`. `postLayout` still runs there, with `laidOut.units === 'cell'`.

## Output is checked

Everything an extension hands core is held to the SVG allow-list (R-SEC-2): the tags and attribute names in `packages/core/src/svg/allowlist.ts`. A box's `node`, a glyph, an outline drawer's output and the tree after `postRender` are all checked, and a failure rejects the render with `MermaidError('INTERNAL')` naming the extension and the part. There is no `foreignObject`, no `script`, no `on*` attribute, and a fixed set of `data-` attributes.

Build a fragment as a plain `{ tag, attrs, children }` tree. Values that the writer emits unescaped (colours, transforms, lengths, paths) have brand types; make them with core's functions (`translate`, `px`, `checkColor`, `pathBuilder` from `@mermaid-js/core/svg`), never with a cast.

What `render()` returns must stay inert with your extension registered. If you need something the allow-list does not have, such as HTML, put it into the mounted DOM in `afterMount`. That content is yours to make safe (D694): `plugin-html-labels` carries the HTML through the svg string as escaped text in a `<desc>`, and sanitizes it when it measures and again when it mounts, so a stored string is never trusted.

## State

An extension keeps no module state. A top-level `let` survives between renders and between `createMermaid()` instances, and the lint rule `mermaid/no-module-state` rejects it in first-party packages. There are two places for what one render needs to remember:

- **`ctx.state`** is your extension's own object for the render. Hooks, the label provider and the outline drawer get it in their context, and `afterMount` gets the same object as its third argument. This is how a provider hands something to `afterMount`.
- **`request.scratch`** is one object per render that every extension shares. Inline and glyph providers get it in their request, and hooks see it as `ctx.inline.scratch`. Key what you put there by your extension id. This is how `plugin-icons` notes, while it draws, what its `postRender` hook warns about.

Inline and glyph providers do not get the hook context yet, so they cannot read the config or `ctx.state`. That is an open gap.

A cache of a pure function (a `WeakMap` keyed by the pack object, a lazy `import()` handle) never changes output and is allowed. Say why in a comment.

## Labels

Label layout offers a label to extensions in two steps (DESIGN §5.3).

1. **Whole-label providers** (`label.box(raw, request, ctx)`, D695) are asked first, in registration order. `raw` is the label's source as written. The request has the font, the measurer, the wrap width (`maxWidth`), the markup mode (`markup`) and, when the diagram says, what the label names (`role`: `node`, `edge` or `group`, D699). Return an `InlineBox` to take the label, or `undefined` to leave it.
2. **Inline providers** then box spans of a label nobody took.

A whole-label provider that takes a label is responsible for all of it, including its math and icons. Call `request.inline(raw)` (D698): it boxes the label's inline spans with the render's inline providers and returns `{ source, boxes }`, where `source` is the label with a placeholder character where each box goes (`String.fromCharCode(PLACEHOLDER + i)`, from `@mermaid-js/core/text`). Lay out `source`, and draw `boxes[i].node` where placeholder `i` ended up. `inline()` also gives core's warnings for math and icons that nothing draws. If you do not call it, core is silent about them and you answer for them.

Decline whenever you cannot do better than core. `plugin-html-labels` declines without a DOM and when `ctx.deterministic` is true, because it measures with the browser. When every provider declines, the output must be byte for byte what it is without the extension. Test that.

`role` is new, and only flowchart sets it so far. Treat `undefined` as "unknown", not as an error.

## Loading lazily

`box()`, `glyph()` and `draw()` are synchronous, because layout and drawing are. An engine or a data file that loads later is a resource (R-API-2, D178):

- `resources.provides` lists what you can load, `missing(parse, request)` says which of it this diagram needs and has not loaded, and `load(resource)` loads one.
- `prepare()` and `render()` load what is missing first. `renderSync()` throws `NotLoadedError` naming it, or draws stand-ins when the caller asked for `placeholders`.
- While your engine has not loaded, the provider returns `undefined` and the span is drawn as written. `request.standIns` lists what the render is drawn without: if your engine is in it, do not warn, because the render already has.

`missing()` gets the lean parse. Read `request.labels()` and `request.icons()` when the diagram plugin provides them, and fall back to `someString(parse.model, test)`.

## Config

An extension's config keys live in its own fragment (`config`, D153): keys, defaults, aliases of legacy keys, and theme variables. Core knows them only while the extension is registered, and never names your package.

- First-party packages write `schema/config.fragment.yaml` and run `pnpm gen:config`, which writes `src/generated/config-fragment.ts` and the package's section of the config reference. A third party writes the `ConfigFragment` object by hand.
- An alias moves a legacy key to yours before the schema check, so `htmlLabels: false` reaches `html.labels`. An alias is not per diagram type. An alias from or to an integrator-only key is refused.
- Diagram text can set your keys. An integrator who wants otherwise lists your top-level key in `secure`. A fragment cannot make a key integrator-only by default yet.
- Read the config as `ctx.config`. Its type does not know your keys: narrow it yourself (`(ctx.config as { html?: { labels?: unknown } }).html`).
- When your package takes over a key that core removed, core's warning for that key cannot name your package (D153). For a first-party package, add the hint to `hint()` in `packages/mermaid/src/errors.ts`, as hand-drawn and HTML labels do (D700).

## Warnings and errors

Report a problem as a warning, never with `console` (R-ERR-4): `ctx.warn({ code, message })` in a hook, `request.warn(…)` in a provider. A provider's warnings are given once per render for each code and message, so warn where you meet the problem.

A throw in any part rejects the render with `MermaidError('INTERNAL')` and the message `Extension "<id>" failed in <part>: …`. Throw for a bug, and decline (`undefined`) for input you do not handle.

## Testing

Test through the public API, in Node, with no DOM shim (R-ARCH-1):

```ts
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid } from 'mermaid';

const m = createMermaid();
await m.registerExternalDiagrams([shout]);
const r = await m.render('x', 'flowchart LR\n  A --> B');
assertInert(r.svg);
```

What a spec for an extension should hold, with the first-party spec that shows it:

- **Declining changes nothing.** With the extension registered and declining, `r.svg` equals the svg without it (`plugin-html-labels/src/index.spec.ts`).
- **Text output is untouched** (`render(…, { format: 'ascii' })`).
- **The output stays on the allow-list.** `assertInert(r.svg)` for your own cases and for hostile input. `@mermaid-js/core/svg/testing` has the inputs: `PAYLOADS`, `V12_XSS_CASES`, and `hostileLabelSources()`, which gives both as flowcharts with the hostile text in a node label and an edge label.
- **Every diagram type still draws.** A first-party package runs the `pr-check` fixtures under `e2e/diagrams/` with the extension registered (`plugin-html-labels/src/corpus.spec.ts`, `plugin-hand-drawn/src/corpus.spec.ts`).
- **A fresh API object gives the same bytes**, which is how module state shows up.
- **Failures name the extension.**

Use `initialize({ deterministic: true })` in specs that compare output, unless the extension declines in a deterministic render.

### Code that needs a DOM

Node has no DOM, and the unit tests add none. Split the extension from what it needs of the browser: `plugin-html-labels` exports `extensionWith(env)` from `src/extension.ts`, where `env` is the document, the sanitizer, the measure and the mount. `src/index.ts` passes the browser's, and the specs pass stand-ins that record what they were asked. The logic is then tested in Node, and only the DOM code itself needs a browser.

The browser specs are in `e2e/dom/` (Playwright, behaviour only, no screenshots). The page script `e2e/dom/page.ts` puts each plugin on `window`: add yours there, or the spec waits for a global that never comes. Run them with `pnpm e2e:dom --project=chromium`. The server reuses a running one on its port, so in a second checkout set `MERMAID_DOM_PORT`.

## Size

Core has a byte budget (`packages/mermaid/size-budget.json`, R-PERF-1 and R-PERF-8), and an extension's code is outside it. A change to core's API for an extension is inside it, so measure before and after, and do not raise a limit. An extension should cost nothing until it is used: load engines lazily, and keep the entry small.

## A new first-party extension package

Besides the package itself (`packages/plugin-<name>`, with the `mermaid` manifest in its `package.json`):

- `tools/workspace/layout.spec.ts` and `tools/release/src/publish.spec.ts` list the packages.
- A runtime dependency needs the maintainer's agreement, an entry in `tools/check-deps/check-deps.ts`, and a `THIRD_PARTY_NOTICES` file.
- A changeset (`pnpm changeset`, `patch`), a README, and a row in [MIGRATION.md](MIGRATION.md) when it replaces something v12 had.
- A decision file for each choice that DESIGN does not already make.
