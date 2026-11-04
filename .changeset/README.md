# Changesets

Mermaid v13 versions and publishes its packages with [Changesets](https://github.com/changesets/changesets), in pre mode (`alpha`). Each package has its own `13.0.0-alpha.N` version.

- **In a PR:** run `pnpm changeset`, pick the packages whose code you changed, choose `patch`, and write one changelog line for users.
- **Releasing:** see [v13/docs/RELEASING.md](../v13/docs/RELEASING.md).

Don't edit versions or `pre.json` by hand, and don't run `changeset pre exit`.
