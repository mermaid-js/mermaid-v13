# @mermaid-js/plugin-autoload (v13 alpha)

Opt-in plugin discovery for Mermaid in Node. One `await` registers the plugins your app's `package.json` lists:

```js
import mermaid from 'mermaid';
import { autoload } from '@mermaid-js/plugin-autoload';

const warnings = await autoload(mermaid);
// ...then render as usual
```

`mermaid` itself registers no plugin it was not told about. `autoload` is how you tell it about all of them at once, from `package.json`, instead of one `registerExternalDiagrams` line per plugin. Node only: it reads files, so it has no browser build.

```sh
npm install @mermaid-js/plugin-autoload@v13-alpha mermaid-box mermaid-foo
```

## What it registers

`autoload(mermaid, { root? })` finds the app root: the nearest folder at or above `root` (default `process.cwd()`) whose `package.json` names a package or lists dependencies (a type-marker `dist/package.json` is walked past). It then looks only at the packages that `package.json` lists in `dependencies`, `devDependencies`, `optionalDependencies` or `peerDependencies`, in the app's own `node_modules` (never an ancestor folder's), and registers the ones with a `mermaid` manifest:

- diagram plugins, detected after the first-party types;
- extensions, such as `@mermaid-js/plugin-interactions`, activated now;
- layout packages, each of their names registered lazily.

A plugin must be listed in your `package.json` to be found. One that npm or Yarn hoisted as a dependency of another package is not read, so the set of plugins does not depend on the package manager. An npm alias is found under its key.

Packages register in package-name order (code-unit order, so the same on every file system), one `registerExternalDiagrams` call each, so detectors run in that order after the first-party ones. A first-party id or type is never replaced. When two packages claim the same diagram id, extension id or layout name, the first by package name keeps it and the other is skipped with a warning.

Call `autoload` before the first render. `mermaid`'s own Node entry also discovers plugins on its first render, until that is removed; `autoload` marks the instance it serves so the entry stands down, and an instance that already rendered has already discovered.

## Warnings, never a throw

`autoload` resolves to the warnings. It does not throw for a package's sake: a throwing or never-settling import, a bad manifest, a manifest path that leaves the package, a package the registry rejects, each give one `PLUGIN_SKIPPED` warning naming the package, and the other packages still register.

```js
for (const w of await autoload(mermaid)) console.warn(w.message);
```

Two more warnings are meant for a log and say why nothing was found: `PLUGIN_DISCOVERY_NO_PACKAGE_JSON` (no readable `package.json` at or above the folder: nothing is discovered) and `PLUGIN_DISCOVERY_NO_MODULES` (no `node_modules`). A package that is declared but not installed, or has no `mermaid` manifest, is not a plugin and gives no warning.

## Trust

You declared these packages, so their code is yours to run: detectors at registration, entries on first use. Even so, every manifest path (`entry`, `detector`, `ascii`, `config`) must resolve, symlinks followed, inside its package, and each import `autoload` makes while registering (a detector, a layout's config, an extension's entry) has a time limit, `importTimeoutMs` (default 5000 ms). A diagram's entry loads on first use with no limit.

## The command line

The `mermaid` bin uses this package for `--autoload`: `mermaid render diagram.mmd --format svg --autoload` registers your project's plugins. The bin imports `@mermaid-js/plugin-autoload` from your project at run time, only for that flag, and exits with an error naming it when it is not installed. For one or two plugins use `--plugin <package>` instead.

## The scan

`scanPlugins`, `findAppRoot`, `packageModule` and `FIRST_PARTY_IDS` are exported for tools that read plugin packages without registering them. The Mermaid language server uses them, so the editor and the renderer accept and skip the same packages (`@mermaid-js/language-server`, `plugins: true`).

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version, and install it with the newest `mermaid@v13-alpha`.
