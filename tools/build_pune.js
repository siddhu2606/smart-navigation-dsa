// One-time tool: turns raw OpenStreetMap data (Overpass JSON, "out geom") into the same kind of grid the
// town generator makes, so every algorithm and the simulation run on it unchanged.
//   node tools/build_pune.js raw.json web/data/pune.json
// 600 x 600 cells, about 7 m wide (a 4.2 km square). Roads cost 1, footpaths 2, open ground 6; buildings and deep water are blocked.
const fs = require('fs');
const [raw, out] = process.argv.slice(2);
const osm = JSON.parse(fs.readFileSync(raw, 'utf8')).elements;

const BBOX = { s: 18.5000, w: 73.8281, n: 18.5380, e: 73.8679 };
const W = 600, H = 600;
const T = { GRASS: 0, ROAD: 1, BRIDGE: 2, DEEP: 7, BUILDING: 8, PATH: 14 };
const terrain = new Uint8Array(W * H), bid = new Uint16Array(W * H);
const toXY = (p) => [((p.lon - BBOX.w) / (BBOX.e - BBOX.w)) * W, ((BBOX.n - p.lat) / (BBOX.n - BBOX.s)) * H];

// ---- polygon fill (even-odd), rings = arrays of {lat, lon}
function fill(rings, set) {
  const edges = [];
  for (const ring of rings) {
    const pts = ring.map(toXY);
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (a[1] !== b[1]) edges.push(a[1] < b[1] ? [a, b] : [b, a]); }
  }
  let ys = edges.flatMap((e) => [e[0][1], e[1][1]]);
  if (!ys.length) return [];
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  const cells = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5, xs = [];
    for (const [a, b] of edges) if (yc >= a[1] && yc < b[1]) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); x++) { set(x, y); cells.push(y * W + x); }
  }
  return cells;
}

// ---- 4-connected line (so roads never leave diagonal gaps)
function line(pts, width, set) {
  for (let i = 0; i + 1 < pts.length; i++) {
    let [x0, y0] = pts[i].map(Math.floor), [x1, y1] = pts[i + 1].map(Math.floor);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      for (let a = 0; a < width; a++) for (let b = 0; b < width; b++) set(x0 + a, y0 + b);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy && e2 < dx) { set(x0 + sx, y0); }          // diagonal step: also fill a side cell
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
}

// ---- join the outer ways of a multipolygon relation into closed rings
function relationRings(rel) {
  const segs = rel.members.filter((m) => m.type === 'way' && m.geometry && m.geometry.length > 1).map((m) => m.geometry.slice());
  const rings = [], same = (a, b) => a.lat === b.lat && a.lon === b.lon;
  while (segs.length) {
    let ring = segs.pop(), grew = true;
    while (grew && !same(ring[0], ring[ring.length - 1])) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (same(ring[ring.length - 1], s[0])) ring = ring.concat(s.slice(1));
        else if (same(ring[ring.length - 1], s[s.length - 1])) ring = ring.concat(s.slice(0, -1).reverse());
        else if (same(ring[0], s[s.length - 1])) ring = s.slice(0, -1).concat(ring);
        else if (same(ring[0], s[0])) ring = s.slice(1).reverse().concat(ring);
        else continue;
        segs.splice(i, 1); grew = true; break;
      }
    }
    rings.push(ring);
  }
  return rings;
}

// ---- 1. water
for (const el of osm) {
  const tags = el.tags || {};
  const isWater = tags.natural === 'water' || tags.waterway === 'riverbank';
  if (isWater && el.type === 'way' && el.geometry) fill([el.geometry], (x, y) => { terrain[y * W + x] = T.DEEP; });
  if (isWater && el.type === 'relation') fill(relationRings(el), (x, y) => { terrain[y * W + x] = T.DEEP; });
}
for (const el of osm) {       // rivers drawn only as lines
  const tags = el.tags || {};
  if (el.type === 'way' && el.geometry && (tags.waterway === 'river' || tags.waterway === 'canal') && !(tags.area === 'yes'))
    line(el.geometry.map(toXY), 6, (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) terrain[y * W + x] = T.DEEP; });
}

// ---- 2. buildings
const buildings = [{ id: 0 }];
for (const el of osm) {
  if (!(el.tags && el.tags.building) || el.type !== 'way' || !el.geometry) continue;
  const id = buildings.length;
  const cells = fill([el.geometry], (x, y) => { terrain[y * W + x] = T.BUILDING; bid[y * W + x] = id; });
  if (!cells.length) {                    // tiny house: take the cell under its centre
    const c = el.geometry.map(toXY), cx = Math.floor(c.reduce((a, p) => a + p[0], 0) / c.length), cy = Math.floor(c.reduce((a, p) => a + p[1], 0) / c.length);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H || terrain[cy * W + cx] === T.DEEP) continue;
    terrain[cy * W + cx] = T.BUILDING; bid[cy * W + cx] = id; cells.push(cy * W + cx);
  }
  buildings.push({ id, name: el.tags.name || '', kind: 'house', x: 0, y: 0, w: 0, h: 0, cell: -1, door: -1, amenity: el.tags.amenity || '', _cells: cells });
}

// ---- 3. roads (painted over buildings and water, so the network stays connected)
const ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'road',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const PATHS = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway']);
const BIG = new Set(['motorway', 'trunk', 'primary', 'secondary', 'trunk_link', 'primary_link', 'secondary_link']);
let roadWays = 0;
for (const el of osm) {
  const hw = el.tags && el.tags.highway;
  if (el.type !== 'way' || !el.geometry || !hw || !(ROADS.has(hw) || PATHS.has(hw))) continue;
  if (el.tags.tunnel === 'yes' || el.tags.area === 'yes') continue;
  roadWays++;
  const isRoad = ROADS.has(hw), bridge = el.tags.bridge === 'yes';
  line(el.geometry.map(toXY), isRoad && BIG.has(hw) ? 2 : 1, (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x, t = terrain[i];
    if (!isRoad && (t === T.ROAD || t === T.BRIDGE)) return;           // a footpath never replaces a road
    terrain[i] = t === T.DEEP || bridge ? (isRoad ? T.BRIDGE : T.PATH) : isRoad ? T.ROAD : T.PATH;
    bid[i] = 0;
  });
}
// (a building cell overwritten by a road is no longer part of it)
for (const b of buildings) if (b.id) b._cells = b._cells.filter((c) => terrain[c] === T.BUILDING);

// ---- 4. doors: multi-source BFS from every road cell through open ground; each building uses its closest edge cell
const walkable = (t) => t === T.ROAD || t === T.BRIDGE || t === T.PATH;
const dist = new Int32Array(W * H).fill(-1), par = new Int32Array(W * H).fill(-1), queue = [];
for (let i = 0; i < W * H; i++) if (walkable(terrain[i])) { dist[i] = 0; queue.push(i); }
for (let h = 0; h < queue.length; h++) {
  const u = queue[h], x = u % W, y = (u / W) | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy, v = ny * W + nx;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || dist[v] >= 0 || dist[u] >= 14) continue;
    if (terrain[v] === T.BUILDING || terrain[v] === T.DEEP) continue;
    dist[v] = dist[u] + 1; par[v] = u; queue.push(v);
  }
}
let withDoor = 0;
for (const b of buildings) {
  if (!b.id) continue;
  if (!b._cells.length) { b._drop = true; continue; }
  let best = -1;
  for (const c of b._cells) {
    const x = c % W, y = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, v = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || terrain[v] === T.BUILDING || dist[v] < 0) continue;
      if (best < 0 || dist[v] < dist[best]) best = v;
    }
  }
  if (best < 0) continue;
  b.door = best;
  for (let c = best; c !== -1 && dist[c] > 0; c = par[c]) if (terrain[c] === T.GRASS) terrain[c] = T.PATH;
  withDoor++;
}

// ---- 5. only keep doors on the biggest connected walkable network
const comp = new Int32Array(W * H).fill(-1), sizes = [];
for (let s = 0; s < W * H; s++) {
  if (comp[s] >= 0 || !walkable(terrain[s])) continue;
  const q = [s]; comp[s] = sizes.length;
  for (let h = 0; h < q.length; h++) {
    const u = q[h], x = u % W, y = (u / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, v = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || comp[v] >= 0 || !walkable(terrain[v])) continue;
      comp[v] = comp[s]; q.push(v);
    }
  }
  sizes.push(q.length);
}
const main = sizes.indexOf(Math.max(...sizes));
for (const b of buildings) if (b.id && b.door >= 0 && comp[b.door] !== main) b.door = -1;

// ---- 6. building boxes, representative cell, kind (hospital / shelter) from OSM amenities
const amenityAt = (el) => {
  const p = el.type === 'node' ? el : el.geometry ? el.geometry[0] : (el.center || null);
  if (!p) return null;
  const [x, y] = el.geometry && el.type === 'way' ? toXY({ lat: el.geometry.reduce((a, q) => a + q.lat, 0) / el.geometry.length, lon: el.geometry.reduce((a, q) => a + q.lon, 0) / el.geometry.length }) : toXY(p);
  return [Math.floor(x), Math.floor(y)];
};
for (const b of buildings) {
  if (!b.id || b._drop) continue;
  let x0 = W, y0 = H, x1 = 0, y1 = 0, sx = 0, sy = 0;
  for (const c of b._cells) { const x = c % W, y = (c / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sx += x; sy += y; }
  b.x = x0; b.y = y0; b.w = x1 - x0 + 1; b.h = y1 - y0 + 1;
  const mx = sx / b._cells.length, my = sy / b._cells.length;
  b.cell = b._cells.reduce((p, c) => (Math.hypot(c % W - mx, ((c / W) | 0) - my) < Math.hypot(p % W - mx, ((p / W) | 0) - my) ? c : p), b._cells[0]);
}
const kindOf = (a) => (a === 'hospital' ? 'hospital' : ['school', 'college', 'community_centre', 'townhall', 'place_of_worship'].includes(a) ? 'shelter' : null);
for (const el of osm) {
  const a = el.tags && el.tags.amenity, k = a && kindOf(a);
  if (!k) continue;
  const at = amenityAt(el);
  if (!at || at[0] < 0 || at[1] < 0 || at[0] >= W || at[1] >= H) continue;
  let id = bid[at[1] * W + at[0]];
  if (!id) {                              // a point just outside a building: take the nearest building cell
    let bd = 99;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = at[0] + dx, y = at[1] + dy; if (x < 0 || y < 0 || x >= W || y >= H || !bid[y * W + x]) continue;
      if (Math.hypot(dx, dy) < bd) { bd = Math.hypot(dx, dy); id = bid[y * W + x]; }
    }
  }
  const b = buildings[id];
  if (b && b.id && b.door >= 0 && !(b.kind === 'hospital')) { b.kind = k; b.name = b.name || (el.tags.name || ''); }
}

const keep = buildings.filter((b) => !b.id || (!b._drop && b.door >= 0));
const idMap = new Map(keep.map((b, i) => [b.id, i]));
for (let i = 0; i < W * H; i++) if (bid[i]) { if (idMap.has(bid[i])) bid[i] = idMap.get(bid[i]); else bid[i] = 0; }
const final = keep.map((b, i) => (i === 0 ? { id: 0 } : { id: i, kind: b.kind, name: b.name, x: b.x, y: b.y, w: b.w, h: b.h, cell: b.cell, door: b.door }));
// buildings that lost their door stay blocked cells (bid 0) so nothing else breaks

const count = (k) => final.filter((b) => b.kind === k).length;
const b64 = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
const result = {
  name: 'Deccan Gymkhana and Shivajinagar, Pune', source: 'OpenStreetMap contributors (ODbL)',
  W, H, bbox: BBOX, cellMeters: Math.round((111320 * Math.cos(((BBOX.s + BBOX.n) / 2) * Math.PI / 180) * (BBOX.e - BBOX.w)) / W * 10) / 10,
  terrain: b64(terrain), bid: b64(bid), buildings: final,
};
fs.writeFileSync(out, JSON.stringify(result));
const tc = {}; for (const t of terrain) tc[t] = (tc[t] || 0) + 1;
console.log('road ways', roadWays, 'buildings', final.length - 1, 'hospitals', count('hospital'), 'shelters', count('shelter'), 'main network', sizes[main], 'of', sizes.reduce((a, b) => a + b, 0));
console.log('terrain cells', tc, 'cell meters', result.cellMeters, 'size KB', Math.round(fs.statSync(out).size / 1024));
