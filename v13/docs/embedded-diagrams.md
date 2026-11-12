# Embedded diagrams

> [!NOTE]
> New in Mermaid v13 (ADR-15).

A flowchart or state diagram can hold whole diagrams of any other type. Each one is drawn in a
box that acts as a single node: edges can point at the box, and the diagram inside is drawn on
its own.

```
flowchart LR
  Start --> login
  mermaid login["Login flow"] {
    sequenceDiagram
      User->>Server: credentials
      Server-->>User: token
  }
  login --> Dashboard
```

## Syntax

```
mermaid <id>["Title"] {
  <diagram>
}
```

- **`mermaid`** starts a block. The line must end with `{`.
- **`<id>`** names the box. It is required, so edges can point at it (`A --> login`), and it must
  be unique: no other node, state or block may use it.
- **`["Title"]`** is optional. It is shown in a strip at the top of the box.
- **The body** is a complete diagram. Its first line, after any blank lines, comments and front
  matter, must be a diagram type such as `sequenceDiagram`, `classDiagram` or `mindmap`.
- **`}`** on its own line closes the block. Braces inside the body are fine as long as they are
  balanced line by line, as they are in state composites, class bodies and ER entities.

A block may sit anywhere a node or state may, including inside a `subgraph` or a composite
state. `class`, `classDef` and `style` style the box:

```
flowchart TD
  subgraph Backend
    mermaid model["Data model"] {
      erDiagram
        USER ||--o{ ORDER : places
    }
  end
  classDef embedded stroke:#888,stroke-dasharray:4
  class model embedded
```

In a state diagram the box is a state:

```
stateDiagram-v2
  [*] --> Idle
  Idle --> checkout
  mermaid checkout["Checkout"] {
    flowchart LR
      Cart --> Pay --> Done
  }
  checkout --> [*]
```

## Where blocks can go

| Host | Can hold blocks |
|---|---|
| flowchart (`flowchart`, `graph`) | yes |
| state (`stateDiagram`, `stateDiagram-v2`) | yes |
| other types | not yet |

Any diagram type can be **inside** a block. Blocks can be nested if the inner diagram is a
flowchart or a state diagram, up to four levels deep.

## Folding

A block can be shown folded, as a small box with its title and type, using the same statement
that folds a subgraph. In a state diagram, `@{ view: collapsed }` is accepted on a block id only:

```
flowchart LR
  A --> login
  mermaid login["Login flow"] {
    sequenceDiagram
      User->>Server: credentials
  }
  login@{ view: collapsed }
```

A folded block is not parsed or rendered at all, so it costs almost nothing, and its diagram
type does not need to be installed. Errors inside it are not reported when rendering, but the
editor still shows them.

## Look and config

- The box has a border and a transparent background, which sets it apart from a subgraph.
- The diagram inside starts from the host's config, including the host's front matter and
  directives: it uses the host's theme, look and font, at its natural size. Options for its type
  set on the host (say `sequence.mirrorActors` in the host's front matter) apply to it too.
- Front matter at the top of a block can set diagram options (a section such as `sequence`), for
  example:

  ```
  mermaid login["Login flow"] {
    ---
    config:
      sequence:
        mirrorActors: false
    ---
    sequenceDiagram
      User->>Server: credentials
  }
  ```

  Anything outside a diagram section, such as the theme, `themeVariables`, `look`,
  `securityLevel` or `wrap`, cannot be changed from a block; it is ignored with a warning.
- Links, `click` callbacks and tooltips inside a block work as in a stand-alone diagram.

## Errors and limits

- A syntax error inside a block fails the whole diagram, and the error points to the line in your
  text.
- A block whose type isn't available fails the same way. The error names every block whose type
  is missing, so you can fix them all at once. With `mermaid/slim`, register every diagram type
  your blocks use.
- `maxTextSize` and `maxEdges` count the whole text, all blocks included.

## Text output

With `format: 'ascii'`, a block is drawn as a frame around the inner diagram's text output.
If the inner type has no text output yet, the frame shows the title and the type, with a
warning. A folded block is drawn like a folded subgraph (a box with `+` in its top-left corner and the title), plus a dotted divider and the inner type on a second line.
