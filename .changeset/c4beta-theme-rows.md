---
'@mermaid-js/diagram-c4': minor
---

feat: c4-beta draws its elements as outlines in its own theme rows. `c4PersonColor`, `c4SoftwareSystemColor`, `c4ContainerColor`, `c4ComponentColor`, `c4InfrastructureNodeColor` and `c4ExternalColor` colour an element's text, and the matching `...Border` rows its outline, on the page's `background`. Light themes draw the prototype's colours; dark themes draw the same hues lightened until they read. A `style` for a kind, then the styles of an element's tags, still win. c4-beta no longer reads the `c4` section's `<kind>_bg_color` and `<kind>_border_color` keys, which stay legacy C4's; legacy C4 is unchanged.
