# Extension API gaps found by the HTML labels plugin

`@mermaid-js/plugin-html-labels` (spec #1278, D694 to D697) was built as a third party would build it: against the public extension API only, with every place that needed a change in core written down. It is the first extension that takes over something core does, where the others add SVG (`plugin-math`, `plugin-icons`, `plugin-hand-drawn`) or bind behaviour to the mounted diagram (`plugin-interactions`). This document lists what the API could not do, what the plugin did about it, what a follow-up closed, and what is still open and why. To write an extension, read [extension-plugins.md](extension-plugins.md).

The extension API is described in [DESIGN.md](DESIGN.md) §12.2 and typed in `packages/core/src/pipeline/extensions.ts`.

## Verdict

The API is sound for what it was designed for. Typed, allow-listed output, the re-check after every hook, lazy resources, config fragments with aliases, and per-render state all worked as documented, and the plugin needed no workaround for any of them. Three things made the plugin possible with a small core change: label layout already hands label text to extensions in one place, the writer already draws a box an extension measured, and `afterMount` already gives an extension the mounted DOM with its own state.

It is not complete for an extension that replaces a core behaviour. The plugin needed one new hook and one new context field in core, 288 B gzipped (107,507 B to 107,795 B against a limit of 110,208 B), and it left eleven gaps open. A follow-up (spec #1281, D698 to D701) checked each of them against the code, closed five for about 100 B more, and recorded why the other six stay open. None of those six blocks a plugin that exists today.

## Closed by the plugin (#1278)

| Gap | What it meant | What closed it |
| --- | --- | --- |
| No whole-label hook | Diagrams import `layoutLabel` statically, so an extension could only supply spans inside a label. A catch-all inline pattern would have worked, but registration order would then decide between it and the math and icon providers | `ExtensionPlugin.label` (D695): asked before inline spans, in registration order, first box wins |
| Providers get a thin request | An inline provider gets the font and the measurer, but not the wrap width, the markup mode, the config or the diagram id. A provider could reach the config only through a `postParse` hook, which forces the full parse for every render | The label provider's request adds `maxWidth` and `markup`, and it gets the hook context, as an outline drawer does (D655) |
| Two scratch objects | Providers write to `InlineRequest.scratch`, shared by every extension. `afterMount` reads the extension's own `state`. Nothing connects them without a `postParse` or `postRender` hook | The label provider gets `ctx.state`, the object `afterMount` gets |
| Integrator options are invisible | An extension could not tell that the integrator asked for a deterministic render, so one that measures with the DOM could not step aside | `RenderContext.deterministic` |

## Closed by the follow-up (#1281)

The numbers are from the #1280 checklist. Sizes are gzipped bytes of the loaded size (core plus flowchart), measured one change at a time.

| Gap | What it meant | What closed it | Bytes |
| --- | --- | --- | --- |
| 1. A provider cannot tell a label's role | The request did not say whether a label belongs to a node, an edge or a group, so the plugin could not give v12's `nodeLabel` and `edgeLabel` classes | `LabelOptions.role`, passed on as `LabelRequest.role` (D699). Optional, so diagram types adopt it one at a time; flowchart sets it. The plugin's wrapper carries v12's class | 27 |
| 2. Providers do not compose | A whole-label box hid the label from inline providers, so the plugin left a label with math or an icon to core (D697) | `LabelRequest.inline(text)` boxes a string's inline spans with the render's inline providers (D698). The plugin leaves room for each box in the HTML and draws the box's SVG there | 21 |
| 3. A covering span silences core's warnings | A provider that took a label and did not draw its math silenced `MATH_NOT_RENDERED` | `inline()` warns as label layout does. The contract is written down: a provider that takes a label calls it, or answers for the label's math and icons itself (D698) | 0 |
| 5. A removed core key cannot point to the plugin | `CONFIG_REMOVED_KEY` for `htmlLabels` said "the HTML labels plugin" and not its package name, because core never names an optional package (D153) | `mermaid` adds "register @mermaid-js/plugin-html-labels" while no fragment declares `html`, as it does for `LOOK_REMOVED` (D700). The report's idea that the fragment could carry the hint was wrong: the hint is needed exactly when the fragment is not registered | 49 |
| 11. No authoring guide or test kit | An author had DESIGN §12 and the first-party sources. Two things had to be found by reading tests: that `postParse` forces the full parse, and that a browser spec needs the plugin in the shared page script | [extension-plugins.md](extension-plugins.md): each part and what it costs, state, lazy loading, config, security, testing in Node and in a browser. `hostileLabelSources()` in `@mermaid-js/core/svg/testing` gives the hostile inputs as diagrams, which the plugin's Node spec and its browser spec each built by hand | 0 |

Gap 1 is closed in the API and for flowchart. The other diagram types do not set a role yet, so a provider gets `undefined` there. Class, state, ER and requirement are the next ones worth it, since v12 drew HTML labels in them.

## Open

Each was checked against the code in #1281. The verdicts are D701. Byte counts are estimates.

- **4. No render-end or unmount hook. Deferred.** Nothing tells an extension that a render is over. The plugin measures each label in a hidden element that it adds to the page and removes again, once per label. The gain from a hook is small for it: every label forces a reflow either way, and adding and removing the element is little next to that. An extension that must clean up can do it in a microtask, because a draw is synchronous. A hook costs about 60 to 90 B in core and should wait for a second extension that needs it.
- **6. No plugin-owned `data-*` attribute. Deferred, and Knut's call.** The allow-list has six fixed `data-` names. The plugin marks its placeholders with a class and carries the label in a `<desc>`, which works. A reserved prefix (`data-x-<plugin id>-…`) would let extensions mark their nodes without risking a clash with a diagram's classes, but it widens the allow-list of R-SEC-2, which is a security decision. About 60 to 100 B in core.
- **7. A plugin's config key cannot be integrator-only. Deferred.** `INTEGRATOR_ONLY_KEYS` is fixed in core, and an alias to one of them is refused. An integrator can lock the plugin's key with `secure: ['html']` (checked: diagram text then warns `CONFIG_SECURE_KEY`), but the plugin cannot ask for that by default. No plugin has a key that needs it: D696 decided that diagram text may set `html.labels`, as in v12. A `secure` list in the fragment is the obvious shape when one does.
- **8. `postRender` switches the whole render to the tree writer. Deferred.** Any extension with that hook pays for it on every render (`HookRun.editsTree`). `plugin-icons` is the only one, and it edits. A hook that only reads would not need the tree, but what it reads from a streamed document is a design question, not a small fix.
- **9. A plugin cannot supply a measurer. Rejected.** `measurer` is an integrator option by design: it decides every size in a diagram, and two extensions could not both supply one. An extension sizes its own output through the label provider and inline boxes.
- **10. Label hooks do not reach every diagram. Deferred to each diagram type.** This is a gap in the diagrams, not in the API, and math and icons miss the same text. The first report's list was wrong. Measured with a provider that boxes every label, over up to 40 `pr-check` and `baseline` fixtures of each type: no label reaches the hooks in gitgraph, info, railroad, sankey, treemap, treeView and wardley. In cynefin, gantt, packet and xychart, and in the lanes of a swimlane flowchart, some labels do and most of the text is drawn by the diagram itself.
- **Inline and glyph providers get no hook context.** Not one of the eleven, but noted by the first report. They cannot read the config or the extension's own state; the label provider and the outline drawer can. No first-party provider needs it: math has no config, and icons reads its packs from the request. About 100 B in core. Deferred until one does.
- **1, for the other diagram types.** See above.

## Not examined

The diagram-plugin API, plugin manifests and `@mermaid-js/plugin-autoload`, layout plugins and their per-layout extensions, and how the language service sees extension config. Neither piece of work needed to change any of them.
