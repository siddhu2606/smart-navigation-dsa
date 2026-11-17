// Path Finder: set up a map, then race BFS, DFS, Dijkstra and A* on it.
//
// The C++ engine runs each search once and returns the order in which it expanded the cells. The page
// only REPLAYS that order, one expansion per step for every algorithm at the same time. Nothing about
// the results (cost, winner, number of steps) is shown until the replay itself reaches it.
(function (SN) {
  'use strict';
  const T = SN.T, R = SN.render, $ = (id) => document.getElementById(id);

  const PF = {
    size: 100, seed: '', map: null, world: null, cost: null, start: 0, goal: 0,
    tool: 'start', brush: 2, mode: 'physical', cam: new SN.Camera(),
    painting: false, race: null,
  };

  // ------------------------------------------------------------------ map and endpoints
  function newMap() {
    PF.seed = 'pf' + Math.floor(Math.random() * 1e6);
    PF.map = SN.mapgen.generate(PF.size, PF.size, PF.seed);
    PF.world = new SN.World(PF.map);
    PF.cam.fit(PF.size, PF.size);
    PF.cost = SN.mapgen.costArray(PF.map.terrain);
    pickEndpoints();
    check();
  }

  // Start and goal on two doors far apart that the engine can connect.
  function pickEndpoints() {
    const rng = new SN.RNG(PF.seed + '|ends'), W = PF.size;
    const doors = PF.map.buildings.slice(1).filter((b) => b.door).map((b) => b.door);
    for (let tries = 0; tries < 60; tries++) {
      const a = doors[rng.int(doors.length)], b = doors[rng.int(doors.length)];
      const d = Math.abs(a % W - b % W) + Math.abs(((a / W) | 0) - ((b / W) | 0));
      if (d < W * 0.7 && tries < 50) continue;
      if (SN.engine.search(3, PF.cost, W, W, a, b).found) { PF.start = a; PF.goal = b; return; }
    }
    PF.start = doors[0]; PF.goal = doors[doors.length - 1];
  }

  // Is there a route from start to goal? (A* from the C++ engine)
  function check() {
    const r = SN.engine.search(3, PF.cost, PF.size, PF.size, PF.start, PF.goal);
    const el = $('pf-status');
    el.className = 'status ' + (r.found ? 'ok' : 'bad');
    el.textContent = r.found ? '✔ A route exists. Ready to race.' : '✖ No route. Move the points or erase walls.';
    $('pf-start').disabled = !r.found;
  }

  function nearestOpen(cell) {
    const W = PF.size, x0 = cell % W, y0 = (cell / W) | 0;
    for (let r = 0; r < 20; r++)
      for (let y = y0 - r; y <= y0 + r; y++)
        for (let x = x0 - r; x <= x0 + r; x++) {
          if (Math.max(Math.abs(x - x0), Math.abs(y - y0)) !== r || x < 0 || y < 0 || x >= W || y >= W) continue;
          if (PF.cost[y * W + x] > 0) return y * W + x;
        }
    return cell;
  }

  // ------------------------------------------------------------------ editing the map (setup screen)
  function applyTool(cell) {
    if (cell < 0) return;
    const W = PF.size;
    if (PF.tool === 'start') PF.start = nearestOpen(cell);
    else if (PF.tool === 'goal') PF.goal = nearestOpen(cell);
    else {
      const changed = [], x0 = cell % W, y0 = (cell / W) | 0, r = PF.brush - 1;
      for (let y = y0 - r; y <= y0 + r; y++)
        for (let x = x0 - r; x <= x0 + r; x++) {
          if (x < 0 || y < 0 || x >= W || y >= W) continue;
          const i = y * W + x;
          if (i === PF.start || i === PF.goal) continue;
          const t = PF.map.terrain[i];
          if (PF.tool === 'wall' && SN.COST[PF.map.base[i]] > 0 && t !== T.DEBRIS) PF.map.terrain[i] = T.DEBRIS;
          else if (PF.tool === 'erase' && t === T.DEBRIS) PF.map.terrain[i] = PF.map.base[i];
          else continue;
          PF.cost[i] = SN.COST[PF.map.terrain[i]];
          changed.push(i);
        }
      PF.world.refresh(changed);
    }
  }

  function bindSetup() {
    const cv = $('pf-map');
    const view = () => PF.cam.view(cv.width, cv.height);
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      PF.painting = true;
      applyTool(R.cellAt(cv, view(), e));
    });
    cv.addEventListener('pointermove', (e) => {
      const cell = R.cellAt(cv, view(), e);
      $('pf-hover').textContent = cell < 0 ? '' : `x ${cell % PF.size}, y ${(cell / PF.size) | 0} · ${SN.TERRAIN_NAMES[PF.map.terrain[cell]]} · cost ${PF.cost[cell] || 'blocked'}`;
      if (PF.painting) applyTool(cell);
    });
    const end = () => { if (PF.painting) { PF.painting = false; check(); } };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { $('pf-hover').textContent = ''; });

    $('pf-tools').addEventListener('click', (e) => {
      const b = e.target.closest('.tool');
      if (!b) return;
      PF.tool = b.dataset.tool;
      document.querySelectorAll('#pf-tools .tool').forEach((x) => x.classList.toggle('active', x === b));
    });
    $('pf-brush').addEventListener('input', (e) => { PF.brush = +e.target.value; $('pf-brush-v').textContent = e.target.value; });
    $('pf-size').addEventListener('change', (e) => { PF.size = +e.target.value; newMap(); });
    $('pf-new').addEventListener('click', newMap);
    $('pf-start').addEventListener('click', startRace);

    // size options and cost legend
    $('pf-size').innerHTML = SN.SIZES.map((s) => `<option value="${s}">${s} × ${s}</option>`).join('');
    const sw = (t, label) => { const c = SN.OVERVIEW_RGB[t]; return `<span><i style="background:rgb(${c})"></i>${label} <b>${SN.COST[t] || '✕'}</b></span>`; };
    $('pf-legend').innerHTML = [sw(T.ROAD, 'Road'), sw(T.PATH, 'Footpath'), sw(T.GRASS, 'Grass'), sw(T.FOREST, 'Forest'),
      sw(T.SHALLOW, 'Shallow'), sw(T.PLAZA, 'Plaza'), sw(T.BUILDING, 'Building'), sw(T.DEEP, 'Deep water')].join('');
  }

  function drawSetup(now) {
    const cv = $('pf-map');
    if (!R.fitCanvas(cv)) return;
    const ctx = cv.getContext('2d'), v = PF.cam.view(cv.width, cv.height);
    R.drawBase(ctx, v, PF.world, PF.mode, now);
    R.drawFlag(ctx, v, PF.start, '#e04838', 'S');
    R.drawFlag(ctx, v, PF.goal, '#48b060', 'G');
  }

  // ------------------------------------------------------------------ the race
  function startRace() {
    const W = PF.size, cards = $('race-cards');
    cards.innerHTML = '';
    const race = { cards: [], playing: true, speed: 1, acc: 0, firstDone: false, allDone: false };
    for (const algo of SN.ALGOS) {
      const res = SN.engine.search(algo.id, PF.cost, W, W, PF.start, PF.goal);   // run ONCE in C++, replay below
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<div class="head"><b style="color:${algo.css}">${algo.name}</b><small>${algo.how}</small><button title="Full screen">⛶</button></div>
        <div class="cv"><canvas></canvas></div><div class="foot"></div>`;
      cards.appendChild(el);
      const over = document.createElement('canvas');
      over.width = W; over.height = W;
      const card = { algo, res, el, cv: el.querySelector('canvas'), foot: el.querySelector('.foot'), cam: new SN.Camera(),
        over, octx: over.getContext('2d'), img: null, cursor: 0, done: false, finishRank: 0, badges: '' };
      card.cam.fit(W, W);
      el.querySelector('button').addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen && el.requestFullscreen();
      });
      race.cards.push(card);
    }
    PF.race = race;
    resetRace();
    $('pf-setup').hidden = true;
    $('pf-race').hidden = false;
  }

  function resetRace() {
    const race = PF.race;
    race.playing = true; race.acc = 0; race.firstDone = false; race.allDone = false; race.finished = 0;
    $('race-play').textContent = '⏸ Pause';
    for (const c of race.cards) {
      c.cursor = 0; c.done = false; c.finishRank = 0; c.badges = '';
      c.octx.clearRect(0, 0, PF.size, PF.size);
      c.img = c.octx.createImageData(PF.size, PF.size);
      c.el.classList.remove('finished');
    }
    banner('Race started. Every algorithm expands one cell per step, all at the same speed.', false);
  }

  function banner(text, first) {
    const b = $('race-banner');
    b.textContent = text;
    b.classList.toggle('first', !!first);
  }

  // Advance every unfinished algorithm by one expansion.
  function stepOnce() {
    const race = PF.race, W = PF.size;
    for (const c of race.cards) {
      if (c.done) continue;
      const cell = c.res.order[c.cursor++];
      const k = cell * 4, d = c.img.data, col = c.algo.color;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 210;
      if (c.cursor >= c.res.order.length) {
        c.done = true;
        c.finishRank = ++race.finished;
        c.el.classList.add('finished');
        if (c.finishRank === 1) banner(`🏁 ${c.algo.name} reached the goal first, after ${c.cursor} expansions. The others are still searching.`, true);
      }
    }
    if (race.finished === race.cards.length && !race.allDone) finishRace();
  }

  // Only now (everyone has finished) do we compare the results.
  function finishRace() {
    const race = PF.race;
    race.allDone = true;
    const cheapest = Math.min(...race.cards.map((c) => c.res.cost));
    const fewest = Math.min(...race.cards.map((c) => c.res.path.length));
    const best = race.cards.filter((c) => c.res.cost === cheapest);
    const short = race.cards.filter((c) => c.res.path.length === fewest);
    for (const c of race.cards) {
      c.badges = '';
      if (c.finishRank === 1) c.badges += '<span class="badge first">FIRST TO FINISH</span>';
      if (c.res.cost === cheapest) c.badges += '<span class="badge best">CHEAPEST ROUTE</span>';
    }
    const first = race.cards.find((c) => c.finishRank === 1);
    banner(`Finished. First to finish: ${first.algo.name}. Cheapest route (cost ${cheapest}): ${best.map((c) => c.algo.name).join(' and ')}. ` +
      `Fewest steps (${fewest - 1}): ${short.map((c) => c.algo.name).join(' and ')}.`, true);
  }

  function raceFrame(now, dt) {
    const race = PF.race, W = PF.size;
    if (race.playing && !race.allDone) {
      race.acc += (W * W / 1000) * race.speed * (dt / 16.7);
      let n = Math.floor(race.acc);
      race.acc -= n;
      while (n-- > 0 && !race.allDone) stepOnce();
    }
    for (const c of race.cards) drawCard(c, now);
  }

  function drawCard(c, now) {
    if (!R.fitCanvas(c.cv)) return;
    c.octx.putImageData(c.img, 0, 0);
    const ctx = c.cv.getContext('2d'), v = c.cam.view(c.cv.width, c.cv.height);
    R.drawBase(ctx, v, PF.world, PF.mode, now);
    ctx.globalAlpha = 0.7;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c.over, v.ox, v.oy, v.W * v.s, v.H * v.s);
    ctx.globalAlpha = 1;
    if (c.done) R.drawPath(ctx, v, c.res.path, '#ffffff');
    else if (c.cursor > 0) R.drawHead(ctx, v, c.res.order[c.cursor - 1], now);
    R.drawFlag(ctx, v, PF.start, '#e04838', 'S');
    R.drawFlag(ctx, v, PF.goal, '#48b060', 'G');
    const status = c.done
      ? `✔ reached the goal · route cost <b>${c.res.cost}</b> · ${c.res.path.length - 1} steps`
      : '⏳ searching…';
    const html = `<span>Expanded: <b>${c.cursor}</b></span><span>${status}</span>${c.badges}`;
    if (c.foot.dataset.html !== html) { c.foot.innerHTML = html; c.foot.dataset.html = html; }
  }

  function bindRace() {
    $('race-play').addEventListener('click', () => {
      const r = PF.race;
      r.playing = !r.playing;
      $('race-play').textContent = r.playing ? '⏸ Pause' : '▶ Play';
    });
    $('race-step').addEventListener('click', () => {
      const r = PF.race;
      r.playing = false;
      $('race-play').textContent = '▶ Play';
      if (!r.allDone) stepOnce();
    });
    $('race-speed').addEventListener('input', (e) => {
      PF.race.speed = Math.pow(10, +e.target.value);
      $('race-speed-v').textContent = PF.race.speed.toFixed(PF.race.speed < 1 ? 2 : 1) + '×';
    });
    $('race-reset').addEventListener('click', resetRace);
    $('race-edit').addEventListener('click', () => {
      PF.race = null;
      $('pf-race').hidden = true;
      $('pf-setup').hidden = false;
    });
  }

  function bindViewToggles() {
    document.querySelectorAll('.view-toggle[data-for=pf], .view-toggle[data-for=race]').forEach((group) => {
      group.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        PF.mode = b.dataset.mode;
        document.querySelectorAll('.view-toggle[data-for=pf] button, .view-toggle[data-for=race] button')
          .forEach((x) => x.classList.toggle('active', x.dataset.mode === PF.mode));
      });
    });
  }

  let last = 0;
  SN.pathfinder = {
    init() {
      bindSetup(); bindRace(); bindViewToggles();
      newMap();
      $('race-speed-v').textContent = '1×';
    },
    frame(now) {
      const dt = Math.min(100, last ? now - last : 16.7);
      last = now;
      if (PF.race) raceFrame(now, dt);
      else if (!$('pf-setup').hidden) drawSetup(now);
    },
  };
})(globalThis.SN = globalThis.SN || {});
