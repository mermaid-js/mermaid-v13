// The DOM adapter in the mermaid package may use the DOM and talk to the console.
export function mount(svg: string): void {
  const host = document.createElement('div');
  host.innerHTML = svg;
  window.document.body.append(host);
  console.info('mounted');
}
