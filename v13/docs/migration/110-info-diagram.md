## Info diagram

The info parser accepts the v12 language (oracle parity over every e2e fixture and the v12 spec
strings; grammar in [syntax/info.md](./syntax/info.md)). An info diagram still draws one line,
the version. The differences:

- **The version** is `v` and the version of the `mermaid` package that renders it
  (`v13.0.0-alpha.1`), the same value as the root's `data-mermaid-version`. v12's `-tiny`
  suffix is gone: v13 has no tiny build.
- **`showInfo`** is accepted and draws nothing extra, as in v12, with no warning.
- **`title`**, in the text or the front matter, is drawn nowhere, as in v12 (D218).
  **`accTitle` and `accDescr`**, which v12 parsed and then ignored, now give the SVG its
  `<title>` and `<desc>` (D133).
- **Error messages** are new, as for flowchart, and every error is reported, not only the first.
- **`format: 'ascii'`** draws the same one line, `v13.0.0-alpha.1`, in both charsets. v12 had no
  text output.
- **Theme.** Info has no theme variables of its own. The line takes the shared `textColor` and
  `fontFamily`, as v12's root style gave it.
