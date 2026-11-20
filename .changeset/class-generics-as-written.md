---
'@mermaid-js/diagram-class': patch
---

fix: a class generic is drawn as written whatever its type's name. `B~U~`, `List~Data~` and `+List~Style~ items` draw `B<U>`, `List<Data>` and `+List<Style> items` again, as in v12, instead of losing the type or reading it as bold, italic or underline. A tag you type in a member, such as `<br>` or `<b>`, is still read as markup.
