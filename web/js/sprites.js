// Procedural 16x16 pixel-art tiles and character sprites in a GBA-era top-down RPG style.
// Everything is drawn in code (no image assets), cached per variant.
(function (SN) {
  'use strict';
  const T = SN.T, TS = 16;

  function canvas(w, h) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingEnabled = false; return [c, ctx];
  }
  function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
  function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0; return (s >>> 8) / 16777216; }; }
  const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

  // ------------------------------------------------------------------ palettes
  const P = {
    grass: '#88d070', grassD: '#68b058', grassL: '#b0e890', grassB: '#58a048',
    tree: '#2f7f3b', treeD: '#1d5a2a', treeL: '#4fa850', treeH: '#88d070', trunk: '#7a5030', treeO: '#173f20',
    water: '#5890f0', waterD: '#4070d8', waterL: '#98c8f8', foam: '#e0f0ff',
    shallow: '#80b8f8', shallowL: '#b8e0ff',
    sand: '#f0dca0', sandD: '#d8c080',
    road: '#d0c8b4', roadD: '#b8b098', roadE: '#8c8470', lane: '#f0ecd8',
    path: '#d4b072', pathD: '#b08c52',
    plaza: '#e0d8c8', plazaD: '#c4baa6',
    plank: '#c08850', plankD: '#8a5a30', rail: '#5c3a1c',
    wall: '#f4ecd8', wallD: '#c8b898', win: '#80c0f0', winF: '#486080', door: '#8a5030',
    rubble: '#b0a088', stone: '#8c8c8c', stoneD: '#5c5c5c', stoneL: '#bcbcbc',
    burnt: '#4a4038', ash: '#6c6058', ember: '#f07028',
    outline: '#283028',
  };
  const ROOFS = [['#d85848', '#a83828', '#f08870'], ['#4878d8', '#3058a8', '#80a8f0'], ['#48a860', '#2f7a40', '#80d090'],
    ['#e09038', '#b06818', '#f8c070'], ['#9068c8', '#6848a0', '#b898e8'], ['#40a8a8', '#287878', '#80d8d8']];
  const SPECIAL_ROOF = { hospital: ['#f4f4f4', '#c8c8d0', '#ffffff'], shelter: ['#e86838', '#b04820', '#f8a070'], depot: ['#3868c8', '#244890', '#78a0e8'] };

  const cache = new Map();
  function cached(key, draw) {
    let c = cache.get(key);
    if (!c) { const [cv, ctx] = canvas(TS, TS); draw(ctx); c = cv; cache.set(key, c); }
    return c;
  }

  // ------------------------------------------------------------------ ground tiles
  function grass(ctx, v, base) {
    R(ctx, 0, 0, TS, TS, base || P.grass);
    const r = rnd(v * 7 + 3);
    for (let k = 0; k < 3; k++) {
      const x = 1 + Math.floor(r() * 13), y = 2 + Math.floor(r() * 12);
      R(ctx, x, y, 1, 2, P.grassD); R(ctx, x + 2, y, 1, 2, P.grassD); R(ctx, x + 1, y - 1, 1, 2, P.grassD);
    }
    for (let k = 0; k < 4; k++) R(ctx, Math.floor(r() * 16), Math.floor(r() * 16), 1, 1, P.grassL);
  }
  function sand(ctx, v) {
    R(ctx, 0, 0, TS, TS, P.sand); const r = rnd(v * 11 + 5);
    for (let k = 0; k < 7; k++) R(ctx, Math.floor(r() * 16), Math.floor(r() * 16), 1, 1, P.sandD);
  }
  function edges(ctx, mask, c, w) { // mask bits: 1 N, 2 E, 4 S, 8 W
    if (mask & 1) R(ctx, 0, 0, TS, w, c); if (mask & 4) R(ctx, 0, TS - w, TS, w, c);
    if (mask & 8) R(ctx, 0, 0, w, TS, c); if (mask & 2) R(ctx, TS - w, 0, w, TS, c);
  }
  // FireRed-style dirt road: packed dirt with pebbles and a ragged grass rim where it meets grass.
  function road(ctx, v, mask) {
    R(ctx, 0, 0, TS, TS, '#e6cf98');
    const r = rnd(v * 13 + 1);
    for (let k = 0; k < 6; k++) R(ctx, Math.floor(r() * 16), Math.floor(r() * 16), 1, 1, k % 2 ? '#cdb078' : '#f3e2b4');
    R(ctx, 2 + Math.floor(r() * 12), 2 + Math.floor(r() * 12), 2, 1, '#b89a64');
    for (const side of [1, 2, 4, 8]) {
      if (!(mask & side)) continue;
      for (let k = 0; k < TS; k += 4) {
        const bump = ((v + k) & 1) + 1;
        if (side === 1) { R(ctx, k, 0, 4, bump, '#88d070'); R(ctx, k, bump, 4, 1, '#b09060'); }
        if (side === 4) { R(ctx, k, TS - bump, 4, bump, '#88d070'); R(ctx, k, TS - 1 - bump, 4, 1, '#b09060'); }
        if (side === 8) { R(ctx, 0, k, bump, 4, '#88d070'); R(ctx, bump, k, 1, 4, '#b09060'); }
        if (side === 2) { R(ctx, TS - bump, k, bump, 4, '#88d070'); R(ctx, TS - 1 - bump, k, 1, 4, '#b09060'); }
      }
    }
  }
  function footpath(ctx, v, mask) {
    R(ctx, 0, 0, TS, TS, P.path); const r = rnd(v * 17 + 9);
    for (let k = 0; k < 6; k++) R(ctx, Math.floor(r() * 16), Math.floor(r() * 16), 1, 1, P.pathD);
    edges(ctx, mask, P.pathD, 1);
  }
  function plaza(ctx) {
    R(ctx, 0, 0, TS, TS, P.plaza);
    R(ctx, 0, 0, TS, 1, P.plazaD); R(ctx, 0, 8, TS, 1, P.plazaD); R(ctx, 0, 0, 1, 8, P.plazaD); R(ctx, 8, 8, 1, 8, P.plazaD);
    R(ctx, 3, 3, 2, 1, '#ece6da'); R(ctx, 11, 11, 2, 1, '#ece6da');
  }
  function water(ctx, f, mask, deep) {
    R(ctx, 0, 0, TS, TS, deep ? P.water : P.shallow);
    const wl = deep ? P.waterL : P.shallowL;
    const o = f * 3;
    R(ctx, (2 + o) % 14, 4, 4, 1, wl); R(ctx, (3 + o) % 14 + 1, 3, 2, 1, wl);
    R(ctx, (9 + o) % 14, 11, 4, 1, wl); R(ctx, (10 + o) % 14 + 1, 10, 2, 1, wl);
    if (deep) R(ctx, (6 + o) % 14, 8, 2, 1, P.waterD);
    edges(ctx, mask, P.foam, 2);
  }
  function bridge(ctx, mask) {
    R(ctx, 0, 0, TS, TS, P.plank);
    const vertical = (mask & 10) === 10; // water on E and W -> bridge runs N-S
    for (let k = 0; k < 16; k += 4) { if (vertical) R(ctx, 0, k, TS, 1, P.plankD); else R(ctx, k, 0, 1, TS, P.plankD); }
    if (mask & 1) R(ctx, 0, 0, TS, 2, P.rail); if (mask & 4) R(ctx, 0, 14, TS, 2, P.rail);
    if (mask & 8) R(ctx, 0, 0, 2, TS, P.rail); if (mask & 2) R(ctx, 14, 0, 2, TS, P.rail);
  }
  function tree(ctx, v) {
    grass(ctx, v, '#70b860');
    // canopy
    R(ctx, 4, 0, 8, 1, P.treeO); R(ctx, 2, 1, 12, 1, P.treeO); R(ctx, 1, 2, 14, 9, P.treeO); R(ctx, 2, 11, 12, 1, P.treeO); R(ctx, 4, 12, 8, 1, P.treeO);
    R(ctx, 4, 1, 8, 1, P.tree); R(ctx, 2, 2, 12, 9, P.tree); R(ctx, 3, 11, 10, 1, P.treeD); R(ctx, 2, 9, 12, 2, P.treeD);
    R(ctx, 4, 2, 5, 3, P.treeL); R(ctx, 3, 4, 3, 3, P.treeL); R(ctx, 5, 2, 2, 1, P.treeH); R(ctx, 4, 3, 1, 1, P.treeH);
    R(ctx, 9, 5, 3, 2, P.treeL); R(ctx, 10, 5, 1, 1, P.treeH);
    // trunk
    R(ctx, 6, 12, 4, 3, P.treeO); R(ctx, 7, 12, 2, 3, P.trunk); R(ctx, 5, 15, 6, 1, 'rgba(0,0,0,0.25)');
  }
  function rubble(ctx, v, dense) {
    R(ctx, 0, 0, TS, TS, dense ? '#8c7c68' : P.rubble); const r = rnd(v * 5 + 77);
    const n = dense ? 6 : 4;
    for (let k = 0; k < n; k++) {
      const x = Math.floor(r() * 12), y = Math.floor(r() * 12), s = 2 + Math.floor(r() * (dense ? 4 : 3));
      R(ctx, x, y, s + 1, s + 1, P.stoneD); R(ctx, x, y, s, s, P.stone); R(ctx, x, y, s - 1, 1, P.stoneL);
    }
    if (dense) { R(ctx, 2, 11, 11, 2, P.plankD); R(ctx, 2, 11, 11, 1, P.plank); R(ctx, 10, 2, 2, 9, P.plankD); }
  }
  function burnt(ctx, v) {
    R(ctx, 0, 0, TS, TS, P.burnt); const r = rnd(v * 3 + 41);
    for (let k = 0; k < 8; k++) R(ctx, Math.floor(r() * 16), Math.floor(r() * 16), 2, 1, P.ash);
    if (v % 3 === 0) R(ctx, Math.floor(r() * 14), Math.floor(r() * 14), 1, 1, P.ember);
  }
  function fire(ctx, f, v) {
    burnt(ctx, v);
    const sway = [0, 1, 0, -1][f], h = [11, 12, 10, 12][f];
    const cx = 8 + sway;
    R(ctx, cx - 5, 15 - h + 4, 10, h - 4, '#d83818');
    R(ctx, cx - 4, 15 - h + 2, 8, h - 3, '#f06820');
    R(ctx, cx - 3, 15 - h, 6, h - 2, '#f89830');
    R(ctx, cx - 2, 15 - h + 4, 4, h - 6, '#f8d848');
    R(ctx, cx - 1, 15 - h + 7, 2, h - 9, '#fff8c0');
    R(ctx, cx - 5 + ((f * 3) % 9), 2 + f, 1, 1, '#f8d848');
  }
  function smokePuff(ctx, f) {
    ctx.globalAlpha = 0.55;
    const o = f * 2;
    R(ctx, 2, (10 - o + 16) % 16, 6, 4, '#a8a8a8'); R(ctx, 3, (9 - o + 16) % 16, 4, 1, '#c8c8c8');
    R(ctx, 8, (4 - o + 16) % 16, 6, 5, '#989898'); R(ctx, 9, (3 - o + 16) % 16, 4, 1, '#c0c0c0');
    ctx.globalAlpha = 1;
  }

  // Building tiles: roof with stripes, outline on outer edges, a wall strip along the bottom row.
  function buildingTile(ctx, roof, mask, wallRow, door, v) {
    const [base, dark, light] = roof;
    if (wallRow) {
      R(ctx, 0, 0, TS, 4, dark); R(ctx, 0, 4, TS, 12, P.wall); R(ctx, 0, 14, TS, 2, P.wallD);
      if (door) { R(ctx, 4, 6, 8, 10, P.outline); R(ctx, 5, 7, 6, 9, P.door); R(ctx, 9, 11, 1, 1, '#f8d848'); R(ctx, 3, 5, 10, 1, dark); }
      else if (v % 3 !== 2) { R(ctx, 4, 6, 8, 6, P.winF); R(ctx, 5, 7, 6, 4, P.win); R(ctx, 5, 7, 2, 1, '#e0f0ff'); R(ctx, 7, 7, 1, 4, P.winF); }
      if (mask & 8) R(ctx, 0, 0, 1, TS, P.outline); if (mask & 2) R(ctx, 15, 0, 1, TS, P.outline);
      R(ctx, 0, 15, TS, 1, P.outline);
      return;
    }
    R(ctx, 0, 0, TS, TS, base);
    for (let y = 3; y < 16; y += 4) R(ctx, 0, y, TS, 1, dark);
    if (mask & 1) { R(ctx, 0, 0, TS, 1, P.outline); R(ctx, 0, 1, TS, 2, light); }
    if (mask & 8) { R(ctx, 0, 0, 1, TS, P.outline); R(ctx, 1, 0, 1, TS, light); }
    if (mask & 2) { R(ctx, 15, 0, 1, TS, P.outline); R(ctx, 14, 0, 1, TS, dark); }
  }

  // Returns the tile canvas for cell i. map.under holds the terrain beneath smoke.
  function tileFor(map, i, frame) {
    const W = map.W, H = map.H, t = map.terrain[i], x = i % W, y = (i / W) | 0;
    const v = hash(x, y) & 7;
    const nb = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= W || ny >= H ? -1 : map.terrain[ny * W + nx]; };
    const maskOf = (pred) => (pred(nb(0, -1)) ? 1 : 0) | (pred(nb(1, 0)) ? 2 : 0) | (pred(nb(0, 1)) ? 4 : 0) | (pred(nb(-1, 0)) ? 8 : 0);
    switch (t) {
      case T.GRASS: return cached('g' + v, (c) => grass(c, v));
      case T.FOREST: return cached('t' + (v & 3), (c) => tree(c, v & 3));
      case T.SAND: return cached('s' + v, (c) => sand(c, v));
      case T.ROAD: { const m = maskOf((n) => n === T.GRASS || n === T.FOREST || n === T.SAND || n === T.BUILDING); return cached('r' + v + '_' + m, (c) => road(c, v, m)); }
      case T.PATH: { const m = maskOf((n) => n === T.GRASS || n === T.FOREST); return cached('p' + v + '_' + m, (c) => footpath(c, v, m)); }
      case T.PLAZA: return cached('pl', plaza);
      case T.DEEP: case T.SHALLOW: {
        const m = maskOf((n) => n !== T.DEEP && n !== T.SHALLOW && n !== -1 && n !== T.BRIDGE);
        const f = (frame + (x >> 3) + (y >> 3)) % 3;
        return cached('w' + t + '_' + f + '_' + m, (c) => water(c, f, m, t === T.DEEP));
      }
      case T.BRIDGE: { const m = maskOf((n) => n === T.DEEP || n === T.SHALLOW); return cached('b' + m, (c) => bridge(c, m)); }
      case T.BUILDING: {
        const id = map.bid[i], b = map.buildings[id] || {};
        const roof = SPECIAL_ROOF[b.kind] || ROOFS[b.roof || 0];
        const same = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < W && ny < H && map.bid[ny * W + nx] === id && map.terrain[ny * W + nx] === T.BUILDING; };
        const m = (same(0, -1) ? 0 : 1) | (same(1, 0) ? 0 : 2) | (same(0, 1) ? 0 : 4) | (same(-1, 0) ? 0 : 8);
        const wallRow = !same(0, 1);
        const door = wallRow && b.door === i + W;
        const key = 'B' + (b.kind || 'h') + (b.roof || 0) + '_' + m + (wallRow ? 'w' : '') + (door ? 'd' : '') + (wallRow ? v % 3 : '');
        return cached(key, (c) => buildingTile(c, roof, m, wallRow, door, v));
      }
      case T.RUBBLE: return cached('ru' + (v & 3), (c) => rubble(c, v & 3, false));
      case T.DEBRIS: return cached('de' + (v & 3), (c) => rubble(c, v & 3, true));
      case T.BURNT: return cached('bu' + v, (c) => burnt(c, v));
      case T.FIRE: { const f = (frame + v) & 3; return cached('f' + f + '_' + (v & 3), (c) => fire(c, f, v & 3)); }
      default: return cached('g0', (c) => grass(c, 0));
    }
  }
  function smokeTile(frame, i) { const f = (frame + (i & 3)) & 3; return cached('sm' + f, (c) => smokePuff(c, f)); }

  // ------------------------------------------------------------------ characters
  // look: {skin, hair, shirt, pants, shoe, cap, long, extra}
  const SKIN = '#f8c8a0', SHOE = '#583818', EYE = '#202028';
  function drawPerson(ctx, look, dir, frame) {
    const skin = look.skin || SKIN, hair = look.hair, shirt = look.shirt, pants = look.pants || '#384878';
    const shirtD = shade(shirt, -0.25), shoe = look.shoe || SHOE;
    const step = frame === 0 ? 0 : frame === 1 ? 1 : -1;
    if (look.extra === 'wheelchair') return drawWheelchair(ctx, look, dir, frame);
    if (dir === 0 || dir === 1) {
      // legs
      const lL = step === 1 ? 1 : 2, lR = step === -1 ? 1 : 2;
      R(ctx, 5, 12, 2, lL, pants); R(ctx, 9, 12, 2, lR, pants);
      R(ctx, 5, 12 + lL, 2, 1, shoe); R(ctx, 9, 12 + lR, 2, 1, shoe);
      // body
      R(ctx, 5, 8, 6, 4, shirt); R(ctx, 5, 11, 6, 1, shirtD);
      if (look.extra === 'belly') { R(ctx, 4, 9, 8, 3, shirt); R(ctx, 5, 11, 6, 1, shirtD); }
      const aL = step === 1 ? 2 : 3, aR = step === -1 ? 2 : 3;
      R(ctx, 4, 8, 1, aL, shirt); R(ctx, 11, 8, 1, aR, shirt);
      R(ctx, 4, 8 + aL, 1, 1, skin); R(ctx, 11, 8 + aR, 1, 1, skin);
      // head
      R(ctx, 4, 2, 8, 6, skin); R(ctx, 5, 1, 6, 1, skin);
      if (dir === 0) {
        R(ctx, 4, 1, 8, 3, hair); R(ctx, 5, 1, 6, 1, hair); R(ctx, 4, 4, 1, 2, hair); R(ctx, 11, 4, 1, 2, hair);
        if (look.long) { R(ctx, 3, 3, 1, 6, hair); R(ctx, 12, 3, 1, 6, hair); }
        R(ctx, 6, 5, 1, 2, EYE); R(ctx, 9, 5, 1, 2, EYE);
        if (look.extra === 'glasses') R(ctx, 5, 5, 6, 1, '#101010');
      } else {
        R(ctx, 4, 1, 8, 6, hair); R(ctx, 5, 7, 6, 1, shade(skin, -0.15));
        if (look.long) { R(ctx, 3, 3, 1, 7, hair); R(ctx, 12, 3, 1, 7, hair); R(ctx, 5, 7, 6, 2, hair); }
      }
      if (look.cap) { R(ctx, 4, 1, 8, 2, look.cap); R(ctx, 5, 0, 6, 1, look.cap); if (dir === 0) R(ctx, 3, 3, 10, 1, shade(look.cap, -0.3)); }
      if (look.extra === 'bandage') { R(ctx, 4, 2, 8, 1, '#f8f8f8'); R(ctx, 9, 2, 1, 1, '#e03030'); }
      if (look.extra === 'cane') { R(ctx, 13, 9, 1, 6, '#8a5a30'); R(ctx, 12, 9, 1, 1, '#8a5a30'); }
      if (look.extra === 'glasses') { R(ctx, 13, 8, 1, 7, '#f0f0f0'); R(ctx, 13, 14, 1, 1, '#e03030'); }
    } else {
      // side view facing left (dir 2); right is mirrored by the caller
      if (step === 0) { R(ctx, 6, 12, 3, 2, pants); R(ctx, 5, 14, 4, 1, shoe); }
      else { R(ctx, 4, 12, 2, 2, pants); R(ctx, 9, 12, 2, 2, pants); R(ctx, 3, 14, 3, 1, shoe); R(ctx, 9, 14, 3, 1, shoe); }
      R(ctx, 6, 8, 4, 4, shirt); R(ctx, 6, 11, 4, 1, shirtD);
      if (look.extra === 'belly') R(ctx, 5, 9, 1, 3, shirt);
      const ax = step === 0 ? 7 : step === 1 ? 6 : 8;
      R(ctx, ax, 8, 2, 3, shirtD); R(ctx, ax, 11, 2, 1, skin);
      R(ctx, 4, 2, 7, 6, skin); R(ctx, 3, 5, 1, 2, skin);
      R(ctx, 5, 1, 6, 2, hair); R(ctx, 8, 2, 3, 5, hair); R(ctx, 4, 2, 2, 1, hair);
      if (look.long) R(ctx, 9, 3, 3, 7, hair);
      R(ctx, 5, 5, 1, 2, EYE);
      if (look.extra === 'glasses') R(ctx, 4, 5, 3, 1, '#101010');
      if (look.cap) { R(ctx, 4, 1, 7, 2, look.cap); R(ctx, 2, 3, 4, 1, shade(look.cap, -0.3)); }
      if (look.extra === 'bandage') { R(ctx, 4, 2, 7, 1, '#f8f8f8'); R(ctx, 7, 2, 1, 1, '#e03030'); }
      if (look.extra === 'cane') R(ctx, 3, 9, 1, 6, '#8a5a30');
      if (look.extra === 'glasses') { R(ctx, 2, 8, 1, 7, '#f0f0f0'); R(ctx, 2, 14, 1, 1, '#e03030'); }
    }
  }
  function drawWheelchair(ctx, look, dir, frame) {
    const skin = SKIN, hair = look.hair, shirt = look.shirt;
    const spoke = frame % 2 ? '#a0a0a0' : '#707070';
    if (dir === 0 || dir === 1) {
      R(ctx, 3, 8, 10, 2, '#707078'); // seat back / frame
      R(ctx, 5, 8, 6, 4, shirt); R(ctx, 4, 9, 1, 2, skin); R(ctx, 11, 9, 1, 2, skin);
      R(ctx, 5, 12, 6, 2, look.pants || '#384878'); R(ctx, 5, 14, 2, 1, SHOE); R(ctx, 9, 14, 2, 1, SHOE);
      R(ctx, 1, 9, 3, 6, '#383840'); R(ctx, 12, 9, 3, 6, '#383840'); R(ctx, 2, 11, 1, 2, spoke); R(ctx, 13, 11, 1, 2, spoke);
      R(ctx, 4, 2, 8, 6, skin); R(ctx, 5, 1, 6, 1, skin);
      if (dir === 0) { R(ctx, 4, 1, 8, 3, hair); R(ctx, 6, 5, 1, 2, EYE); R(ctx, 9, 5, 1, 2, EYE); }
      else R(ctx, 4, 1, 8, 6, hair);
    } else {
      R(ctx, 4, 10, 9, 5, '#383840'); R(ctx, 5, 11, 7, 3, spoke); R(ctx, 7, 12, 3, 1, '#383840');
      R(ctx, 11, 6, 2, 6, '#707078');
      R(ctx, 6, 8, 5, 3, shirt); R(ctx, 3, 10, 4, 2, look.pants || '#384878'); R(ctx, 2, 12, 2, 2, SHOE);
      R(ctx, 5, 2, 7, 6, skin); R(ctx, 6, 1, 6, 2, hair); R(ctx, 9, 2, 3, 5, hair); R(ctx, 6, 5, 1, 2, EYE);
    }
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f));
    return '#' + ((1 << 24) | (ch[0] << 16) | (ch[1] << 8) | ch[2]).toString(16).slice(1);
  }
  function outline(ctx, color) {
    const img = ctx.getImageData(0, 0, TS, TS), d = img.data, out = new Uint8ClampedArray(d);
    const [r, g, b] = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const i = (y * TS + x) * 4; if (d[i + 3]) continue;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= TS || ny >= TS) continue;
        if (d[(ny * TS + nx) * 4 + 3] > 200) { edge = true; break; }
      }
      if (edge) { out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255; }
    }
    ctx.putImageData(new ImageData(out, TS, TS), 0, 0);
  }

  const sheets = new Map();
  // Returns canvases[dir][frame] (dir 0 down, 1 up, 2 left, 3 right).
  function characterSheet(key, look) {
    let s = sheets.get(key); if (s) return s;
    s = [];
    for (let dir = 0; dir < 4; dir++) {
      s.push([0, 1, 2].map((frame) => {
        const [c, ctx] = canvas(TS, TS);
        drawPerson(ctx, look, dir === 3 ? 2 : dir, frame);
        outline(ctx, '#202020');
        if (dir === 3) {
          const [m, mctx] = canvas(TS, TS); mctx.translate(TS, 0); mctx.scale(-1, 1); mctx.drawImage(c, 0, 0); return m;
        }
        return c;
      }));
    }
    if (look.tint) {
      for (const row of s) for (let f = 0; f < 3; f++) {
        const [c, ctx] = canvas(TS, TS); ctx.drawImage(row[f], 0, 0);
        ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = 0.5; R(ctx, 0, 0, TS, TS, look.tint);
        row[f] = c;
      }
    }
    sheets.set(key, s); return s;
  }

  const HERO = { hair: '#3a2818', shirt: '#2ea0a0', pants: '#304070', cap: '#e04838' };
  function heroSheet(tint) { return characterSheet('hero' + (tint || ''), Object.assign({}, HERO, { tint })); }

  // Evacuee appearances for the Disaster Sim's Physical view: shirt colour and a visible cue.
  const PEOPLE = {
    man: { shirt: '#3b6fd8' }, woman: { shirt: '#d8506c', long: true }, child: { shirt: '#f0b030' },
    elder: { shirt: '#8a6ac8', hair: '#e0e0e0', extra: 'cane' }, pregnant: { shirt: '#f070b0', long: true, extra: 'belly' },
    visual: { shirt: '#40a0a0', extra: 'glasses' }, wheelchair: { shirt: '#58a858', extra: 'wheelchair' },
    injured: { shirt: '#c84838', extra: 'bandage' },
  };
  function personLook(kind, female, v) {
    const hairs = ['#3a2818', '#5a3018', '#1a1410', '#7a4a20', '#c08040'];
    const skins = ['#f8c8a0', '#e8b088', '#c88858', '#a86838', '#f0d0b0'];
    const base = { hair: hairs[v % 5], skin: skins[(v >> 2) % 5], pants: ['#384878', '#504038', '#383838'][v % 3], long: female };
    return Object.assign(base, PEOPLE[kind]);
  }
  function personSheet(kind, female, v) {
    return characterSheet('p' + kind + (female ? 'f' : 'm') + (v % 10), personLook(kind, female, v % 10));
  }

  // Ambulance seen from above, facing up; the renderer rotates it.
  function ambulance(frame, tint) {
    return cached('amb' + frame + (tint || ''), (ctx) => {
      R(ctx, 2, 1, 12, 14, '#202020'); R(ctx, 3, 2, 10, 12, '#f8f8f8'); R(ctx, 3, 12, 10, 2, '#d8d8d8');
      R(ctx, 4, 3, 8, 3, '#68a8e8'); R(ctx, 4, 3, 3, 1, '#c8e8ff');
      R(ctx, 3, 8, 10, 2, '#e03030'); R(ctx, 7, 10, 2, 3, '#e03030'); R(ctx, 6, 11, 4, 1, '#e03030');
      R(ctx, 5, 6, 3, 1, frame ? '#3060f8' : '#f83030'); R(ctx, 8, 6, 3, 1, frame ? '#f83030' : '#3060f8');
      R(ctx, 1, 3, 1, 3, '#202020'); R(ctx, 14, 3, 1, 3, '#202020'); R(ctx, 1, 10, 1, 3, '#202020'); R(ctx, 14, 10, 1, 3, '#202020');
      if (tint) { ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = 0.45; R(ctx, 0, 0, 16, 16, tint); }
    });
  }

  function bubble(kind) {
    return cached('bub' + kind, (ctx) => {
      R(ctx, 3, 1, 10, 11, '#202020'); R(ctx, 4, 2, 8, 9, '#ffffff'); R(ctx, 7, 12, 2, 2, '#202020'); R(ctx, 7, 11, 2, 1, '#ffffff');
      if (kind === '!') { R(ctx, 7, 3, 2, 5, '#e03030'); R(ctx, 7, 9, 2, 1, '#e03030'); }
      else if (kind === '+') { R(ctx, 7, 3, 2, 7, '#e03030'); R(ctx, 5, 5, 6, 2, '#e03030'); }
      else if (kind === '?') { R(ctx, 6, 3, 4, 1, '#3060c0'); R(ctx, 9, 4, 1, 2, '#3060c0'); R(ctx, 7, 6, 2, 1, '#3060c0'); R(ctx, 7, 9, 2, 1, '#3060c0'); }
      else if (kind === 'z') { R(ctx, 6, 4, 4, 1, '#606060'); R(ctx, 8, 5, 1, 1, '#606060'); R(ctx, 7, 6, 1, 1, '#606060'); R(ctx, 6, 7, 4, 1, '#606060'); }
    });
  }

  // Emblems drawn over landmark buildings.
  function emblem(kind) {
    return cached('em' + kind, (ctx) => {
      R(ctx, 1, 1, 14, 14, '#202020');
      if (kind === 'hospital') { R(ctx, 2, 2, 12, 12, '#ffffff'); R(ctx, 6, 3, 4, 10, '#e03030'); R(ctx, 3, 6, 10, 4, '#e03030'); }
      else if (kind === 'shelter') { R(ctx, 2, 2, 12, 12, '#48b060'); R(ctx, 7, 3, 2, 1, '#fff'); R(ctx, 5, 4, 6, 1, '#fff'); R(ctx, 4, 5, 8, 1, '#fff'); R(ctx, 3, 6, 10, 1, '#fff'); R(ctx, 4, 7, 8, 6, '#fff'); R(ctx, 7, 9, 2, 4, '#48b060'); }
      else if (kind === 'depot') { R(ctx, 2, 2, 12, 12, '#3868c8'); R(ctx, 5, 4, 6, 6, '#f8f8f8'); R(ctx, 6, 5, 4, 4, '#e03030'); R(ctx, 4, 11, 8, 2, '#f8f8f8'); }
    });
  }

  SN.sprites = { TS, tileFor, smokeTile, heroSheet, personSheet, characterSheet, ambulance, bubble, emblem, ROOFS, SPECIAL_ROOF, shade, hash };
})(globalThis.SN = globalThis.SN || {});
