// Seeded random number generator (mulberry32) and fractal value noise.
(function (SN) {
  'use strict';

  function hashSeed(s) {
    if (typeof s === 'number') return s >>> 0;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  class RNG {
    constructor(seed) { this.s = hashSeed(seed) || 0x9e3779b9; }
    next() {
      let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(n) { return Math.floor(this.next() * n); }
    range(a, b) { return a + this.next() * (b - a); }
    irange(a, b) { return a + this.int(b - a + 1); }
    pick(arr) { return arr[this.int(arr.length)]; }
    chance(p) { return this.next() < p; }
    fork(tag) { return new RNG((this.s ^ hashSeed(String(tag))) >>> 0); }
  }

  // Lattice value noise with smoothstep interpolation; deterministic per seed.
  class Noise {
    constructor(seed) {
      const r = new RNG(seed);
      this.perm = new Uint16Array(512);
      this.val = new Float32Array(256);
      const p = new Uint16Array(256);
      for (let i = 0; i < 256; i++) { p[i] = i; this.val[i] = r.next(); }
      for (let i = 255; i > 0; i--) { const j = r.int(i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }
    lattice(x, y) { return this.val[this.perm[(this.perm[x & 255] + y) & 511] & 255]; }
    value(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = this.lattice(xi, yi), b = this.lattice(xi + 1, yi);
      const c = this.lattice(xi, yi + 1), d = this.lattice(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    fbm(x, y, oct) {
      let sum = 0, amp = 1, f = 1, norm = 0;
      for (let o = 0; o < oct; o++) { sum += amp * this.value(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03; }
      return sum / norm;
    }
  }

  SN.RNG = RNG;
  SN.Noise = Noise;
  SN.hashSeed = hashSeed;
})(globalThis.SN = globalThis.SN || {});
