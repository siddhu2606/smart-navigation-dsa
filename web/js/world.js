// The map as drawable images: a 1-pixel-per-cell Physical overview (FireRed palette) and a Logical
// base (cost as grey levels, blocked cells dark). Both are redrawn only where cells change.
(function (SN) {
  'use strict';
  const T = SN.T;

  function imageCanvas(W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    return { canvas: c, ctx, img: ctx.createImageData(W, H) };
  }

  class World {
    constructor(map) {
      this.map = map; this.W = map.W; this.H = map.H;
      this.phys = imageCanvas(this.W, this.H);
      this.logic = imageCanvas(this.W, this.H);
      for (let i = 0; i < this.W * this.H; i++) this.paint(i);
      this.phys.ctx.putImageData(this.phys.img, 0, 0);
      this.logic.ctx.putImageData(this.logic.img, 0, 0);
    }

    physColor(i) {
      const m = this.map, t = m.terrain[i];
      if (t !== T.BUILDING) return SN.OVERVIEW_RGB[t];
      const b = m.buildings[m.bid[i]] || {};
      const n = parseInt((SN.sprites.SPECIAL_ROOF[b.kind] || SN.sprites.ROOFS[b.roof || 0])[0].slice(1), 16);
      return [n >> 16, (n >> 8) & 255, n & 255];
    }

    paint(i) {
      const c = this.physColor(i), noise = (SN.sprites.hash(i % this.W, (i / this.W) | 0) & 15) - 8, k = i * 4;
      const p = this.phys.img.data;
      p[k] = c[0] + noise; p[k + 1] = c[1] + noise; p[k + 2] = c[2] + noise; p[k + 3] = 255;
      const cost = SN.COST[this.map.terrain[i]], l = this.logic.img.data;
      const g = cost ? 246 - Math.min(8, cost - 1) * 17 : 0;
      l[k] = cost ? g : 46; l[k + 1] = cost ? g : 52; l[k + 2] = cost ? g + 4 : 66; l[k + 3] = 255;
    }

    // repaint every cell (after the whole map changed back, e.g. a reset)
    repaintAll() {
      for (let i = 0; i < this.W * this.H; i++) this.paint(i);
      this.phys.ctx.putImageData(this.phys.img, 0, 0);
      this.logic.ctx.putImageData(this.logic.img, 0, 0);
    }

    refresh(cells) {
      if (!cells.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (const i of cells) {
        this.paint(i);
        const x = i % this.W, y = (i / this.W) | 0;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      for (const w of [this.phys, this.logic]) w.ctx.putImageData(w.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }
  }

  SN.World = World;
})(globalThis.SN = globalThis.SN || {});
