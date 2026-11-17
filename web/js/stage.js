// stage.js - where a map is drawn: the pixel-art town (our own camera) or the real map of Pune (Leaflet).
//
// Leaflet only draws the background and handles pan / zoom. All routing is done by our own C++ code on the
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

  // Landmarks of the real map: a hospital, shelters (schools, halls...) far apart, and a house near the middle.
  stage.pickPuneSites = function (map, seed, shelterCount) {
    const rng = new SN.RNG(String(seed) + '|pune'), W = map.W;
    const bs = map.buildings.slice(1).filter((b) => b.door >= 0);
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
    const houses = bs.filter((b) => b.kind === 'house');
    const cx = map.W / 2, cy = map.H / 2;
    houses.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    const fire = houses[rng.int(Math.min(40, houses.length))];
    return { hospital, shelters, fire };
  };

  // A surface = one canvas, plus (in real mode) a Leaflet map underneath it.
  //   lfDiv: the element Leaflet draws into.  interactive: may the user pan and zoom it?
  stage.Surface = class {
    constructor(cv, lfDiv, interactive) {
      this.cv = cv; this.div = lfDiv; this.interactive = !!interactive;
      this.cam = new SN.Camera(); this.lf = null; this.map = null; this.size = '';
    }

    // Call whenever the map (or the mode) changes.
    attach(map) {
      this.map = map;
      const box = this.cv.parentElement;
      if (stage.real && map.real) {
        box.classList.add('real');
        this.div.hidden = false;
        if (!this.lf) this.createLeaflet(map);
        else this.fit();
      } else {
        box.classList.remove('real');
        this.destroyLeaflet();
        this.cam.fit(map.W, map.H);
      }
    }

    createLeaflet(map) {
      const it = this.interactive;
      this.lf = L.map(this.div, { zoomControl: it, dragging: it, scrollWheelZoom: it, touchZoom: it, doubleClickZoom: false,
        boxZoom: false, keyboard: false, zoomSnap: 0.25, minZoom: 14, maxZoom: 19, attributionControl: true });
      this.lf.attributionControl.setPrefix(false);
      this.lf.setView([(map.bbox.s + map.bbox.n) / 2, (map.bbox.w + map.bbox.e) / 2], 16, { animate: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(this.lf);
      this.fit();
    }

    fit() {
      if (this.div.clientWidth < 10 || this.div.clientHeight < 10) return;       // hidden: fit later, when it has a size
      const b = this.map.bbox;
      this.lf.invalidateSize(false);
      this.lf.fitBounds([[b.s, b.w], [b.n, b.e]], { animate: false, padding: [4, 4] });
    }

    destroyLeaflet() {
      if (this.lf) { this.lf.remove(); this.lf = null; }
      this.div.hidden = true;
    }

    // The mapping cell -> canvas pixels for the current frame (or null if the canvas has no size yet).
    view() {
      const cv = this.cv;
      if (!SN.render.fitCanvas(cv)) return null;
      const map = this.map, W = map.W, H = map.H;
      if (!this.lf) return this.cam.view(cv.width, cv.height);
      const key = this.div.clientWidth + 'x' + this.div.clientHeight;
      if (key !== this.size) {                    // the box changed size (window, full screen, tab shown)
        this.size = key;
        if (this.interactive) this.lf.invalidateSize(false); else this.fit();
      }
      const dpr = cv.width / cv.clientWidth, b = map.bbox;
      const p0 = this.lf.latLngToContainerPoint([b.n, b.w]), p1 = this.lf.latLngToContainerPoint([b.s, b.e]);
      const s = ((p1.x - p0.x) / W) * dpr;
      return SN.render.makeView(cv.width, cv.height, W, H, s, p0.x * dpr, p0.y * dpr);
    }

    // canvas pixel (device) of a map-container point from a Leaflet event, as a cell index
    cellFromContainerPoint(pt, v) {
      const dpr = this.cv.width / this.cv.clientWidth;
      const x = Math.floor((pt.x * dpr - v.ox) / v.s), y = Math.floor((pt.y * dpr - v.oy) / v.s);
      return x < 0 || y < 0 || x >= v.W || y >= v.H ? -1 : y * v.W + x;
    }
  };

  SN.stage = stage;
})(globalThis.SN = globalThis.SN || {});
