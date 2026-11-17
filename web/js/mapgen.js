// Procedural city (map scenery only, not one of the course algorithms): block-grid generator.
// Junction per block -> link lattice neighbours -> carve a route only when existing roads force a big
// detour (straight carving with a turn penalty, bridges over water) -> fill blocks with buildings or
// parks -> connect every door with a footpath.
(function (SN) {
  'use strict';
  const T = SN.T;
  const PITCH = 22, ROAD_W = 3;

  function generate(W, H, seed) {
    const rng = new SN.RNG(seed), noise = new SN.Noise(rng.int(1e9)), wildN = new SN.Noise(rng.int(1e9));
    const V = W * H, terrain = new Uint8Array(V).fill(T.GRASS), bid = new Int32Array(V);
    const stats = {};
    nature(W, H, terrain, rng, noise, wildN);
    const juncs = junctions(W, H, terrain, rng, wildN);
    stats.routes = links(W, H, terrain, juncs, rng);
    const buildings = [{ id: 0 }];
    stats.blocks = fillBlocks(W, H, terrain, bid, buildings, rng);
    stats.doors = connectDoors(W, H, terrain, buildings);
    return { W, H, seed, terrain, base: terrain.slice(), bid, buildings, stats };
  }

  // Rivers (deep core, shallow banks, sand), forest belts where "wildness" is high.
  function nature(W, H, terrain, rng, noise, wildN) {
    const f = 3 / Math.min(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const wild = wildN.fbm(x * f + 5, y * f + 9, 4);
      if (wild > 0.62) terrain[y * W + x] = T.FOREST;
      else if (wild > 0.57 && noise.value(x * 0.3, y * 0.3) > 0.5) terrain[y * W + x] = T.FOREST;
    }
    const rivers = W >= 400 ? 2 : 1;
    for (let r = 0; r < rivers; r++) river(W, H, terrain, rng, noise, r);
  }

  function river(W, H, terrain, rng, noise, r) {
    const vertical = rng.chance(0.5), width = Math.max(2.2, W / 80);
    let x = vertical ? rng.range(W * 0.25, W * 0.75) : 0, y = vertical ? 0 : rng.range(H * 0.25, H * 0.75);
    const tx = vertical ? rng.range(W * 0.25, W * 0.75) : W - 1, ty = vertical ? H - 1 : rng.range(H * 0.25, H * 0.75);
    let ang = Math.atan2(ty - y, tx - x);
    for (let step = 0; step < (W + H) * 3; step++) {
      ang += (Math.atan2(ty - y, tx - x) - ang) * 0.06 + (noise.value(step * 0.04, r * 7) - 0.5) * 0.32;
      x += Math.cos(ang); y += Math.sin(ang);
      const R = Math.ceil(width + 2);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const px = Math.round(x + dx), py = Math.round(y + dy);
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const d = Math.hypot(dx, dy), i = py * W + px;
        if (d <= width * 0.6) terrain[i] = T.DEEP;
        else if (d <= width + 0.5) { if (terrain[i] !== T.DEEP) terrain[i] = T.SHALLOW; }
        else if (d <= width + 1.6 && terrain[i] !== T.DEEP && terrain[i] !== T.SHALLOW) terrain[i] = T.SAND;
      }
      if ((vertical && y >= H - 1) || (!vertical && x >= W - 1)) break;
    }
  }

  // One junction per block of the lattice, jittered, skipped in water and deep forest.
  function junctions(W, H, terrain, rng, wildN) {
    const cols = Math.max(2, Math.round(W / PITCH)), rows = Math.max(2, Math.round(H / PITCH));
    const grid = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = Math.round((i + 0.5) * W / cols + rng.range(-3, 3)), y = Math.round((j + 0.5) * H / rows + rng.range(-3, 3));
      const t = terrain[y * W + x];
      const ok = t !== T.DEEP && t !== T.SHALLOW && !(t === T.FOREST && rng.chance(0.75));
      grid.push(ok ? { i, j, x, y } : null);
    }
    return { cols, rows, list: grid };
  }

  // Candidate links: lattice neighbours (right, down). Shortest first. A link is built only if the
  // roads that already exist make the trip more than DETOUR times the straight-line distance.
  function links(W, H, terrain, J, rng) {
    const cand = [];
    const at = (i, j) => (i < J.cols && j < J.rows ? J.list[j * J.cols + i] : null);
    for (const a of J.list) {
      if (!a) continue;
      for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [2, 0], [0, 2]]) {
        const b = at(a.i + di, a.j + dj);
        if (!b) continue;
        const across = di + dj === 2 && (di === 2 || dj === 2); // skips over a hole (river, forest)
        if (across && at(a.i + di / 2, a.j + dj / 2)) continue;
        if (di + dj === 1 || across || rng.chance(0.08)) cand.push([a, b, Math.abs(a.x - b.x) + Math.abs(a.y - b.y)]);
      }
    }
    cand.sort((p, q) => p[2] - q[2]);
    let built = 0, skipped = 0;
    for (const [a, b, d] of cand) {
      const viaRoads = roadDistance(W, H, terrain, a.y * W + a.x, b.y * W + b.x);
      if (viaRoads <= 1.7 * d) { skipped++; continue; }
      carve(W, H, terrain, routeWithTurns(W, H, terrain, a, b));
      built++;
    }
    built += joinNetworks(W, H, terrain, J.list.filter(Boolean));
    return { built, skipped };
  }

  // If rivers split the roads into separate networks, join each to the largest at the nearest junctions.
  function joinNetworks(W, H, terrain, juncs) {
    let joined = 0;
    for (;;) {
      const comp = roadComponents(W, H, terrain);
      const groups = new Map();
      for (const j of juncs) { const c = comp[j.y * W + j.x]; if (c >= 0) { if (!groups.has(c)) groups.set(c, []); groups.get(c).push(j); } }
      if (groups.size <= 1) return joined;
      const sorted = [...groups.values()].sort((p, q) => q.length - p.length);
      let best = null, bd = Infinity;
      for (const a of sorted[0]) for (const g of sorted.slice(1)) for (const b of g) {
        const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y); if (d < bd) { bd = d; best = [a, b]; }
      }
      carve(W, H, terrain, routeWithTurns(W, H, terrain, best[0], best[1]));
      joined++;
    }
  }

  function roadComponents(W, H, terrain) {
    const comp = new Int32Array(W * H).fill(-1);
    let n = 0;
    for (let s = 0; s < W * H; s++) {
      if (comp[s] >= 0 || !isRoad(terrain[s])) continue;
      const q = [s]; comp[s] = n;
      for (let h = 0; h < q.length; h++) {
        const u = q[h], x = u % W, y = (u / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, v = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || comp[v] >= 0 || !isRoad(terrain[v])) continue;
          comp[v] = n; q.push(v);
        }
      }
      n++;
    }
    return comp;
  }

  function isRoad(t) { return t === T.ROAD || t === T.BRIDGE; }

  function roadDistance(W, H, terrain, s, t) {
    if (!isRoad(terrain[s]) || !isRoad(terrain[t])) return Infinity;
    const dist = new Int32Array(W * H).fill(-1), q = [s];
    dist[s] = 0;
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      if (u === t) return dist[u];
      const x = u % W, y = (u / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, v = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || dist[v] >= 0 || !isRoad(terrain[v])) continue;
        dist[v] = dist[u] + 1; q.push(v);
      }
    }
    return Infinity;
  }

  // A* over (cell, heading) with a penalty for turning, so roads run straight like FireRed routes.
  function routeWithTurns(W, H, terrain, a, b) {
    const D = [[1, 0], [0, 1], [-1, 0], [0, -1]], TURN = 9;
    const stepCost = (t) => (isRoad(t) ? 0.4 : t === T.FOREST ? 2.5 : t === T.SHALLOW ? 16 : t === T.DEEP ? 22 : t === T.SAND ? 1.5 : 1);
    const S = W * H * 4, g = new Float64Array(S).fill(Infinity), par = new Int32Array(S).fill(-1);
    const queue = new RoadQueue(), goal = b.y * W + b.x;
    const h = (c) => Math.abs(c % W - b.x) + Math.abs(((c / W) | 0) - b.y);
    for (let d = 0; d < 4; d++) { const s = (a.y * W + a.x) * 4 + d; g[s] = 0; queue.push(s, h(a.y * W + a.x)); }
    while (queue.size) {
      const st = queue.pop(), c = st >> 2, d = st & 3;
      if (c === goal) return unwind(par, st);
      const x = c % W, y = (c / W) | 0;
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (d + 2) % 4) continue;
        const nx = x + D[nd][0], ny = y + D[nd][1];
        if (nx < 2 || ny < 2 || nx >= W - 2 || ny >= H - 2) continue;
        const nc = ny * W + nx, ns = nc * 4 + nd, ng = g[st] + stepCost(terrain[nc]) + (nd !== d ? TURN : 0);
        if (ng < g[ns]) { g[ns] = ng; par[ns] = st; queue.push(ns, ng + h(nc)); }
      }
    }
    return [];
  }
  function unwind(par, st) { const out = []; for (let s = st; s >= 0; s = par[s]) out.push(s >> 2); return out.reverse(); }

  // 3-wide road along the route. Where the centre line crosses water it is a bridge; where only the
  // edge of the road touches water (a road along a bank), the bank is filled in as road.
  function carve(W, H, terrain, cells) {
    const water = (t) => t === T.DEEP || t === T.SHALLOW;
    for (const c of cells) {
      const x = c % W, y = (c / W) | 0, overWater = water(terrain[c]) || terrain[c] === T.BRIDGE;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const i = ny * W + nx;
        if (terrain[i] === T.BRIDGE) continue;
        terrain[i] = overWater && (water(terrain[i]) || terrain[i] === T.SAND) ? T.BRIDGE : T.ROAD;
      }
    }
  }

  // Regions enclosed by roads: most become rows of buildings, some become parks.
  function fillBlocks(W, H, terrain, bid, buildings, rng) {
    const seen = new Uint8Array(W * H);
    let blocks = 0, parks = 0;
    for (let i = 0; i < W * H; i++) {
      if (seen[i] || terrain[i] !== T.GRASS && terrain[i] !== T.SAND) continue;
      const region = flood(W, H, terrain, seen, i);
      if (region.length < 40 || region.length > PITCH * PITCH * 3) continue;
      blocks++;
      const onRoad = touchesRoad(W, H, terrain, region);
      if (!onRoad || rng.chance(0.14)) { park(W, H, terrain, region, rng); parks++; } else houses(W, H, terrain, bid, buildings, region, rng);
    }
    return { blocks, parks };
  }

  // Houses only go in blocks with road frontage (not on islands cut off by water).
  function touchesRoad(W, H, terrain, region) {
    let n = 0;
    for (const i of region) {
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && isRoad(terrain[ny * W + nx])) n++;
      }
    }
    return n >= 6;
  }

  function flood(W, H, terrain, seen, s) {
    const out = [s]; seen[s] = 1;
    for (let k = 0; k < out.length; k++) {
      const u = out[k], x = u % W, y = (u / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, v = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[v]) continue;
        if (terrain[v] !== T.GRASS && terrain[v] !== T.SAND) continue;
        seen[v] = 1; out.push(v);
      }
    }
    return out;
  }

  function park(W, H, terrain, region, rng) {
    const set = new Set(region);
    for (const i of region) if (rng.chance(0.28)) terrain[i] = T.FOREST;
    const xs = region.map((i) => i % W), ys = region.map((i) => (i / W) | 0);
    const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2), cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
    for (const i of region) { const x = i % W, y = (i / W) | 0; if ((x === cx || y === cy) && set.has(i)) terrain[i] = T.PATH; }
    for (const i of region) { const x = i % W, y = (i / W) | 0; if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) terrain[i] = T.PLAZA; }
  }

  // Rows of buildings with one-cell gaps, packed into the block, one cell back from the road.
  function houses(W, H, terrain, bid, buildings, region, rng) {
    const set = new Set(region);
    const inside = (x, y) => set.has(y * W + x) && [[0, 1], [1, 0], [0, -1], [-1, 0]].every(([dx, dy]) => set.has((y + dy) * W + x + dx));
    const xs = region.map((i) => i % W), ys = region.map((i) => (i / W) | 0);
    const x0 = Math.min(...xs) + 1, x1 = Math.max(...xs) - 1, y0 = Math.min(...ys) + 1, y1 = Math.max(...ys) - 1;
    for (let y = y0; y + 3 <= y1; ) {
      const h = rng.irange(3, 5);
      for (let x = x0; x + 3 <= x1; ) {
        const w = rng.irange(4, 7);
        let ok = true;
        for (let yy = y; yy < y + h && ok; yy++) for (let xx = x; xx < x + w; xx++) if (!inside(xx, yy)) { ok = false; break; }
        if (ok && inside(x + (w >> 1), y + h)) {
          const id = buildings.length;
          buildings.push({ id, x, y, w, h, kind: 'house', roof: rng.int(6), door: (y + h) * W + x + (w >> 1) });
          for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { terrain[yy * W + xx] = T.BUILDING; bid[yy * W + xx] = id; }
          x += w + 1;
        } else x += 1;
      }
      y += h + 1;
    }
  }

  // Every door gets a 1-wide footpath to the nearest road (breadth-first, around buildings).
  function connectDoors(W, H, terrain, buildings) {
    let connected = 0;
    for (const b of buildings) {
      if (!b.door) continue;
      const path = toRoad(W, H, terrain, b.door);
      if (!path) continue;
      for (const c of path) if (terrain[c] === T.GRASS || terrain[c] === T.SAND || terrain[c] === T.FOREST) terrain[c] = T.PATH;
      connected++;
    }
    return { connected, total: buildings.length - 1 };
  }

  function toRoad(W, H, terrain, s) {
    const par = new Map([[s, -1]]), q = [s];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      if (terrain[u] === T.ROAD || terrain[u] === T.BRIDGE) { const out = []; for (let c = u; c !== -1; c = par.get(c)) out.push(c); return out; }
      const x = u % W, y = (u / W) | 0;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const nx = x + dx, ny = y + dy, v = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || par.has(v)) continue;
        const t = terrain[v];
        if (t === T.BUILDING || t === T.DEEP || t === T.SHALLOW) continue;
        par.set(v, u); q.push(v);
      }
      if (q.length > 40000) return null;
    }
    return null;
  }

  // A tiny priority queue for laying out roads: one bucket per key (key * 10, rounded), smallest bucket first.
  class RoadQueue {
    constructor() { this.buckets = []; this.cur = 0; this.size = 0; }
    push(id, key) {
      const b = Math.max(0, Math.round(key * 10));
      (this.buckets[b] = this.buckets[b] || []).push(id);
      if (b < this.cur) this.cur = b;
      this.size++;
    }
    pop() {
      while (!(this.buckets[this.cur] && this.buckets[this.cur].length)) this.cur++;
      this.size--;
      return this.buckets[this.cur].pop();
    }
  }

  // cost per cell for the C++ engine (0 = blocked)
  function costArray(terrain) {
    const c = new Uint8Array(terrain.length);
    for (let i = 0; i < terrain.length; i++) c[i] = SN.COST[terrain[i]];
    return c;
  }

  // Landmarks for the Disaster Sim: a hospital (ambulance depot), shelters spread far apart, and a
  // building near the middle of the town where the fire starts.
  function pickSites(map, seed, shelterCount) {
    const rng = new SN.RNG(String(seed) + '|sites'), W = map.W;
    const bs = map.buildings.slice(1).filter((b) => b.door);
    for (const b of bs) b.kind = 'house';
    const dist = (a, b) => Math.hypot((a.door % W) - (b.door % W), ((a.door / W) | 0) - ((b.door / W) | 0));
    const hospital = bs[rng.int(bs.length)];
    hospital.kind = 'hospital';
    const shelters = [];
    for (let k = 0; k < shelterCount; k++) {
      let best = null, bd = -1;
      for (const b of bs) {
        if (b.kind !== 'house') continue;
        const d = Math.min(dist(b, hospital), ...shelters.map((s) => dist(b, s))) + rng.next() * 6;
        if (d > bd) { bd = d; best = b; }
      }
      best.kind = 'shelter';
      shelters.push(best);
    }
    const cx = map.W / 2, cy = map.H / 2;
    const houses = bs.filter((b) => b.kind === 'house');
    houses.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    const fire = houses[Math.min(houses.length - 1, rng.int(Math.max(1, Math.min(8, houses.length))))];
    return { hospital, shelters, fire };
  }

  SN.mapgen = { generate, costArray, pickSites };
})(globalThis.SN = globalThis.SN || {});
