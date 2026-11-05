/**
 * The fixture diagram plugin (DESIGN §12.1): `fixturebox <label>` draws one box. It imports
 * nothing, so it installs without any other package.
 */
import { detector } from './detector.js';

const WIDTH = 120;
const HEIGHT = 40;

export const fixturebox = {
  id: 'fixturebox',
  layoutKind: 'custom',
  formats: ['svg'],
  detector,
  parse(text) {
    const label = text.replace(/^\s*fixturebox\b/, '').trim() || 'fixture';
    return {
      model: { label },
      ast: { id: 'fixturebox', type: 'FixtureBox', range: { start: 0, end: text.length } },
      diagnostics: [],
      symbols: [],
      statements: [],
    };
  },
  render(model, _layout, ctx, w) {
    w.open('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      id: ctx.idPrefix,
      viewBox: [0, 0, WIDTH, HEIGHT],
      class: 'fixturebox',
    });
    w.leaf('rect', {
      x: 1,
      y: 1,
      width: WIDTH - 2,
      height: HEIGHT - 2,
      fill: 'none',
      stroke: 'black',
    });
    w.open('text', { x: WIDTH / 2, y: HEIGHT / 2, 'text-anchor': 'middle' });
    w.text(model.label);
    w.close();
    w.close();
  },
};
