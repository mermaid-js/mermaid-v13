# Gaps (cross-ticket)

- **#30 → owner #33: a front matter that is one flow mapping does not recover.** In YAML tree mode an error anywhere in a root flow document (`{a: 1, a: 2}`) gives `root: null`, so no key in it gets a range. Block front matter recovers per entry. Fix in #33 only if a golden needs it (recover per flow entry in `Reader.flow`).
