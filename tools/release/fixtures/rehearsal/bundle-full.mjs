import mermaid from 'mermaid';
const { svg } = await mermaid.render('a', 'flowchart LR\n  A --> B');
document.body.innerHTML = svg;
