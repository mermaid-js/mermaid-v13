# Extension API gaps found by the HTML labels plugin

`@mermaid-js/plugin-html-labels` (spec #1278, D694 to D697) was built as a third party would build it: against the public extension API only, with every place that needed a change in core written down. It is the first extension that takes over something core does, where the others add SVG (`plugin-math`, `plugin-icons`, `plugin-hand-drawn`) or bind behaviour to the mounted diagram (`plugin-interactions`). This document lists what the API could not do, what the plugin did about it, and what is still open.

The extension API is described in [DESIGN.md](DESIGN.md) §12.2 and typed in `packages/core/src/pipeline/extensions.ts`.

## Verdict

The API is sound for what it was designed for. Typed, allow-listed output, the re-check after every hook, lazy resources, config fragments with aliases, and per-render state all worked as documented, and the plugin needed no workaround for any of them. Three things made the plugin possible with a small core change: label layout already hands label text to extensions in one place, the writer already draws a box an extension measured, and `afterMount` already gives an extension the mounted DOM with its own state.

It is not complete for an extension that replaces a core behaviour. The plugin needed one new hook and one new context field in core, 236 B gzipped (107,507 B to 107,743 B against a limit of 110,208 B). Eleven further gaps are listed below. None of them blocks this plugin, and each will meet the next plugin author.

## Closed by this work

| Gap | What it meant | What closed it |
| --- | --- | --- |
| No whole-label hook | Diagrams import `layoutLabel` statically, so an extension could only supply spans inside a label. A catch-all inline pattern would have worked, but registration order would then decide between it and the math and icon providers | `ExtensionPlugin.label` (D695): asked before inline spans, in registration order, first box wins |
| Providers get a thin request | An inline provider gets the font and the measurer, but not the wrap width, the markup mode, the config or the diagram id. A provider could reach the config only through a `postParse` hook, which forces the full parse for every render | The label provider's request adds `maxWidth` and `markup`, and it gets the hook context, as an outline drawer does (D655) |
| Two scratch objects | Providers write to `InlineRequest.scratch`, shared by every extension. `afterMount` reads the extension's own `state`. Nothing connects them without a `postParse` or `postRender` hook | The label provider gets `ctx.state`, the object `afterMount` gets |
| Integrator options are invisible | An extension could not tell that the integrator asked for a deterministic render, so one that measures with the DOM could not step aside | `RenderContext.deterministic` |

Inline providers and glyph providers still have the second and third gap. They can be given the hook context the same way when one of them needs it.

## Open

Ordered by how soon another plugin is likely to meet them.

1. **A plugin cannot say which role a label has.** The request does not say whether a label belongs to a node, an edge or a group. The plugin cannot give node and edge labels different classes, as v12 did (`nodeLabel`, `edgeLabel`), or align a group title differently. A `role` in `LabelOptions`, passed on in the request, would do it, at the cost of every diagram passing it.
2. **Providers do not compose.** A whole-label box hides the label from inline providers, and a provider cannot ask another to draw a nested span. So the plugin leaves a label with math or an icon to core (D697). A request field that boxes the inline spans of a string, returning their fragments, would let it embed them.
3. **A covering span silences core's warnings.** Core warns `MATH_NOT_RENDERED` or `ICON_NOT_RENDERED` only for a span no provider covers. A provider that takes a whole label and does not draw its math silences that warning. The plugin avoids it by declining such labels.
4. **No render-end or unmount hook.** The plugin measures each label in a hidden element that it adds to the page and removes again, once per label, because nothing tells it the render is over. With such a hook it could keep one element for the whole render.
5. **A removed core key cannot point to the plugin that takes it.** Core never names an optional package (D153), so `CONFIG_REMOVED_KEY` for `htmlLabels` says "the HTML labels plugin" and not its package name. `LOOK_REMOVED` has a hand-written hint in `mermaid` for the same reason (`packages/mermaid/src/errors.ts`). A fragment that aliases a removed key could contribute the hint.
6. **No plugin-owned `data-*` attribute.** The allow-list has a fixed set of `data-` attributes. The plugin marks its placeholders with a class and carries the label in a `<desc>`. A reserved prefix (`data-x-<plugin id>-…`) would let extensions mark their nodes without risking a clash with a diagram's classes.
7. **A plugin's config key cannot be integrator-only.** `INTEGRATOR_ONLY_KEYS` is fixed in core, and an alias to one of them is refused. An integrator can lock the plugin's key with `secure: ['html']` (checked: diagram text then warns `CONFIG_SECURE_KEY`), but the plugin cannot ask for that by default.
8. **`postRender` switches the whole render to the tree writer.** Any extension with that hook pays for it on every render. The plugin avoids the hook. A hook that only reads would not need the tree.
9. **A plugin cannot supply a measurer.** `measurer` is an integrator option. The label provider makes this less pressing, since an extension can now measure a label its own way.
10. **Label hooks do not reach every diagram.** Info, railroad, sankey, treeView and wardley draw their text themselves, as does secondary text in gantt, kanban, class, packet, quadrant, sequence, treemap and xychart. Math and icons miss the same text. This is a gap in the diagrams, not in the API.
11. **No authoring guide or test kit.** An extension author has DESIGN §12 and the source of the first-party plugins. Two things had to be found by reading tests: that a `postParse` hook forces the full parse, and that the browser specs in `e2e/dom` need the plugin added to a shared page script. The plugin's specs run it over a stand-in environment because Node has no DOM; a small kit (a fake `Env`-style seam, the fixture corpus, the XSS payloads) would save the next author that work.

## Not examined

The diagram-plugin API, plugin manifests and `@mermaid-js/plugin-autoload`, layout plugins and their per-layout extensions, and how the language service sees extension config. This plugin did not need to change any of them.
