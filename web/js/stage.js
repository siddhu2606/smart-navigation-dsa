// stage.js - where a map is drawn: the pixel-art town (our own camera) or the real map of Pune (Leaflet).
//
// Leaflet only draws the background and handles pan and zoom. All routing is done by our own C++ code on the
// grid made from OpenStreetMap (tools/build_pune.js). The canvas on top of Leaflet draws the search,
// the people, the ambulances and the fire, using Leaflet only to convert a cell to a screen position.
(function (SN) {
  'use strict';

  const stage = { real: false, pune: null };

  // Load web/data/pune.json and turn it into the same kind of map object that mapgen.js makes.
  stage.loadPune = async function () {
    if (stage.pune) return stage.pune;
    const d = await (await fetch('data/pune.json')).json();
    const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const terrain = bytes(d.terrain), raw = bytes(d.bid), bid = new Int32Array(d.W * d.H);
    for (let i = 0; i < bid.length; i++) bid[i] = raw[i * 2] | (raw[i * 2 + 1] << 8);
    stage.pune = { W: d.W, H: d.H, seed: 'pune', terrain, base: terrain.slice(), bid, buildings: d.buildings,
      real: true, bbox: d.bbox, cellMeters: d.cellMeters, name: d.name };
    return stage.pune;
  };

  // Landmarks of the real map: a hospital, shelters (schools, halls...) far apart.
  stage.pickPuneSites = function (map, seed, shelterCount) {
    const rng = new SN.RNG(String(seed) + '|pune'), W = map.W;
    const cx = map.W / 2, cy = map.H / 2;
    // stay in the middle of the map, so the evacuation happens where the user is looking
    const bs = map.buildings.slice(1).filter((b) => b.door >= 0 && Math.hypot(b.x - cx, b.y - cy) < map.W * 0.3);
    const dist = (a, b) => Math.hypot((a.door % W) - (b.door % W), ((a.door / W) | 0) - ((b.door / W) | 0));
    const hospitals = bs.filter((b) => b.kind === 'hospital'), shelterPool = bs.filter((b) => b.kind === 'shelter');
    const hospital = hospitals.length ? hospitals[rng.int(hospitals.length)] : bs[rng.int(bs.length)];
    const shelters = [];
    for (let k = 0; k < shelterCount; k++) {
      let best = null, bd = -1;
      for (const b of shelterPool) {
        if (b === hospital || shelters.includes(b)) continue;
        const d = Math.min(dist(b, hospital), ...shelters.map((s) => dist(b, s))) + rng.next() * 6;
        if (d > bd) { bd = d; best = b; }
      }
      if (best) shelters.push(best);
    }
    // the first incident: a house near the middle
    const houses = bs.filter((b) => b.kind === 'house');
    houses.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    return { hospital, shelters, fire: houses[rng.int(Math.min(40, houses.length))] };
  };

  // Keep several Leaflet maps (the four race cards) at the same centre and zoom.
  stage.syncGroup = function (surfaces) {
    if (!stage.real) return;
    let lock = false;
    for (const s of surfaces) {
      s.lf.on('move', () => {
        if (lock) return;
        lock = true;
        const c = s.lf.getCenter(), z = s.lf.getZoom();
        for (const o of surfaces) if (o !== s && o.lf) o.lf.setView(c, z, { animate: false });
        lock = false;
      });
    }
  };

  // A surface = one canvas, plus (in real mode) a Leaflet map underneath it.
  stage.Surface = class {
    constructor(cv, lfDiv) {
      this.cv = cv; this.div = lfDiv;
      this.cam = new SN.Camera(); this.focus = null; this.lf = null; this.map = null; this.size = ''; this.needsFit = false;
    }

    // Call whenever the map (or the mode) changes.
    attach(map) {
      this.map = map;
      const box = this.cv.parentElement;
      if (stage.real && map.real) {
        box.classList.add('real');
        this.div.hidden = false;
        if (!this.lf) this.createLeaflet(map); else this.needsFit = true;
      } else {
        box.classList.remove('real');
        this.destroyLeaflet();
        this.cam.fit(map.W, map.H, this.focusPts());
      }
    }

    createLeaflet(map) {
      this.lf = L.map(this.div, { zoomControl: false, doubleClickZoom: false, boxZoom: false, keyboard: false, zoomSnap: 0.25,
        maxZoom: 21, attributionControl: true, maxBoundsViscosity: 1 });
      this.lf.attributionControl.setPrefix(false);
      this.lf.setView([(map.bbox.s + map.bbox.n) / 2, (map.bbox.w + map.bbox.e) / 2], 15, { animate: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '© OpenStreetMap contributors' }).addTo(this.lf);
      this.needsFit = true;
    }

    // focus = cells (e.g. start and goal) that should be in view when the map is reset
    focusPts() { const W = this.map.W; return this.focus ? this.focus.map((c) => [c % W, (c / W) | 0]) : null; }

    // Show the grid so that the view is always INSIDE it (no empty margin). With a focus the view starts centred on those cells.
    // 
    fit() {
      if (!this.lf || this.div.clientWidth < 10 || this.div.clientHeight < 10) return;
      const m = this.map, b = m.bbox, bounds = L.latLngBounds([b.s, b.w], [b.n, b.e]);
      this.lf.invalidateSize(false);
      const cover = Math.ceil(this.lf.getBoundsZoom(bounds, true) * 4) / 4;   // smallest zoom where the view fits in the grid
      let z = cover, centre = bounds.getCenter(), lo = cover;
      if (this.focus) {
        const ll = this.focus.map((c) => L.latLng(b.n - ((c / m.W | 0) + 0.5) / m.H * (b.n - b.s), b.w + ((c % m.W) + 0.5) / m.W * (b.e - b.w)));
        const fb = L.latLngBounds(ll);
        centre = fb.getCenter();
      }
      this.lf.setMinZoom(lo);
      this.lf.setMaxBounds(bounds);
      this.lf.setView(centre, z, { animate: false });
      this.needsFit = false;
    }

    // Show the whole grid in the panel.
    fitAll() {
      if (!this.lf) { this.cam.fitAll(this.map.W, this.map.H); return; }
      const b = this.map.bbox, bounds = L.latLngBounds([b.s, b.w], [b.n, b.e]);
      this.lf.invalidateSize(false);
      const z = Math.floor(this.lf.getBoundsZoom(bounds, false) * 4) / 4;
      this.lf.setMinZoom(z);
      this.lf.setView(bounds.getCenter(), z, { animate: false });
    }

    destroyLeaflet() {
      if (this.lf) { this.lf.remove(); this.lf = null; }
      this.div.hidden = true;
    }

    // map controls (+, -, fit), the same for both kinds of map
    zoom(factor) {
      if (this.lf) this.lf.setZoom(this.lf.getZoom() + Math.log2(factor), { animate: false });
      else this.cam.zoomBy(factor, this.cv.width, this.cv.height);
    }
    home() { if (this.lf) this.fit(); else this.cam.fit(this.map.W, this.map.H, this.focusPts()); }

    // Mouse wheel (and, if shouldPan is given, drag) on the canvas move our own camera (the town).
    // Leaflet does it itself in real mode.
    bindCamera(shouldPan) {
      const cv = this.cv;
      let drag = null;
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
        this.cam.zoomAt(cv.width, cv.height, (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr, e.deltaY < 0 ? 1.25 : 0.8);
      }, { passive: false });
      if (shouldPan) {
        cv.addEventListener('pointerdown', (e) => {
          if (!shouldPan(e)) return;
          cv.setPointerCapture(e.pointerId);
          drag = { x: e.clientX, y: e.clientY };
          e.stopImmediatePropagation();
        }, true);
        cv.addEventListener('pointermove', (e) => {
          if (!drag) return;
          const v = this.view(), dpr = cv.width / cv.getBoundingClientRect().width;
          if (v) this.cam.panBy((e.clientX - drag.x) * dpr, (e.clientY - drag.y) * dpr, v.s);
          drag.x = e.clientX; drag.y = e.clientY;
          e.stopImmediatePropagation();
        }, true);
        const end = () => { drag = null; };
        cv.addEventListener('pointerup', end, true);
        cv.addEventListener('pointercancel', end, true);
      }
      this.dragging = () => !!drag;
    }

    // The mapping cell -> canvas pixels for the current frame (or null if the canvas has no size yet).
    view() {
      const cv = this.cv;
      if (!SN.render.fitCanvas(cv)) return null;
      const map = this.map, W = map.W, H = map.H;
      if (!this.lf) return this.cam.view(cv.width, cv.height);
      const key = this.div.clientWidth + 'x' + this.div.clientHeight;
      if (key !== this.size) { this.size = key; this.needsFit = true; this.lf.invalidateSize(false); }
      if (this.needsFit) this.fit();
      const dpr = cv.width / cv.clientWidth, b = map.bbox;
      const p0 = this.lf.latLngToContainerPoint([b.n, b.w]), p1 = this.lf.latLngToContainerPoint([b.s, b.e]);
      const s = ((p1.x - p0.x) / W) * dpr;
      return SN.render.makeView(cv.width, cv.height, W, H, s, p0.x * dpr, p0.y * dpr);
    }

    // a point in the Leaflet container (from a Leaflet mouse event) as a cell index
    cellFromContainerPoint(pt, v) {
      const dpr = this.cv.width / this.cv.clientWidth;
      const x = Math.floor((pt.x * dpr - v.ox) / v.s), y = Math.floor((pt.y * dpr - v.oy) / v.s);
      return x < 0 || y < 0 || x >= v.W || y >= v.H ? -1 : y * v.W + x;
    }
  };

  SN.stage = stage;
})(globalThis.SN = globalThis.SN || {});
