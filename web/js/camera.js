// A camera in map cells: centre (cx, cy) and zoom z, where z = 1 fits the whole map in a panel.
// Panels of different sizes that share one camera show the same region. "follow" eases the
// centre toward a target every frame; any manual pan or zoom turns it off.
(function (SN) {
  'use strict';
  const MAX_PX_PER_CELL = 72;

  class Camera {
    constructor() { this.cx = 0; this.cy = 0; this.z = 1; this.follow = false; this.target = null; this.W = 1; this.H = 1; }

    fit(W, H) { this.W = W; this.H = H; this.cx = W / 2; this.cy = H / 2; this.z = 1; this.follow = false; }

    // Screen mapping for a panel cw x ch device pixels: s = device pixels per cell.
    view(cw, ch) {
      const s = Math.min(cw / this.W, ch / this.H) * 0.98 * this.z;
      const ox = cw / 2 - this.cx * s, oy = ch / 2 - this.cy * s;
      return {
        s, ox, oy, cw, ch, W: this.W, H: this.H,
        x0: Math.max(0, Math.floor(-ox / s)), y0: Math.max(0, Math.floor(-oy / s)),
        x1: Math.min(this.W - 1, Math.ceil((cw - ox) / s)), y1: Math.min(this.H - 1, Math.ceil((ch - oy) / s)),
      };
    }

    zoomAt(cw, ch, px, py, factor) {
      const v = this.view(cw, ch);
      const wx = (px - v.ox) / v.s, wy = (py - v.oy) / v.s;
      const fitS = v.s / this.z;
      this.z = Math.max(0.5, Math.min(MAX_PX_PER_CELL / fitS, this.z * factor));
      const s = fitS * this.z;
      this.cx = wx - (px - cw / 2) / s; this.cy = wy - (py - ch / 2) / s;
      this.clamp(); this.follow = false;
    }

    zoomBy(factor, cw, ch) { this.zoomAt(cw, ch, cw / 2, ch / 2, factor); }

    panBy(dx, dy, s) { this.cx -= dx / s; this.cy -= dy / s; this.clamp(); this.follow = false; }

    clamp() { this.cx = Math.max(0, Math.min(this.W, this.cx)); this.cy = Math.max(0, Math.min(this.H, this.cy)); }

    // Recenter: snap to the target and keep following it.
    recenter() {
      if (!this.target) return;
      [this.cx, this.cy] = this.target;
      this.follow = true;
    }

    step() {
      if (!this.follow || !this.target) return;
      this.cx += (this.target[0] - this.cx) * 0.2;
      this.cy += (this.target[1] - this.cy) * 0.2;
    }
  }

  SN.Camera = Camera;
})(globalThis.SN = globalThis.SN || {});
