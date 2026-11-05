/**
 * The fixture extension plugin (DESIGN §12.2): its `postRender` hook adds the class
 * `fixture-mark` to the root `<svg>` of every render.
 */
export const fixtureMark = {
  id: 'fixture-mark',
  postRender(tree) {
    const [svg] = tree.children(tree.root);
    if (svg === undefined) return;
    const cls = tree.getAttr(svg, 'class');
    tree.setAttr(svg, 'class', cls ? `${cls} fixture-mark` : 'fixture-mark');
  },
};
