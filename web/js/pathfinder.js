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
    tool: 'start', brush: 2, mode: 'physical', setup: null, cam: new SN.Camera(),   // cam: shared by the four race maps
    painting: false, race: null,
  };

  // ------------------------------------------------------------------ map and endpoints
  function newMap() {
    PF.seed = 'pf' + Math.floor(Math.random() * 1e6);
    if (SN.stage.real) {
      const p = SN.stage.pune;
      PF.map = Object.assign({}, p, { terrain: p.base.slice() });     // a fresh copy: walls change it
    } else {
      PF.map = SN.mapgen.generate(PF.size, PF.size, PF.seed);
    }
    PF.size = PF.map.W;
    PF.world = new SN.World(PF.map);
    PF.setup.attach(PF.map);
    bindLeaflet();
    PF.cost = SN.mapgen.costArray(PF.map.terrain);
    pickEndpoints();
    check();
  }

  // Start and goal on two doors far apart that the engine can connect.
  function pickEndpoints() {
    const rng = new SN.RNG(PF.seed + '|ends'), W = PF.size;
    const mid = (b) => !PF.map.real || Math.hypot(b.x - W / 2, b.y - W / 2) < W * 0.28;   // real map: near the middle
    const doors = PF.map.buildings.slice(1).filter((b) => b.door >= 0 && b.door && mid(b)).map((b) => b.door);
    const want = PF.map.real ? 0.35 : 0.7;
    for (let tries = 0; tries < 60; tries++) {
      const a = doors[rng.int(doors.length)], b = doors[rng.int(doors.length)];
      const d = Math.abs(a % W - b % W) + Math.abs(((a / W) | 0) - ((b / W) | 0));
      if (d < W * want && tries < 50) continue;
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
    else if (PF.tool === 'wall' || PF.tool === 'erase') {
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

  function hoverText(cell) {
    return cell < 0 ? '' : `x ${cell % PF.size}, y ${(cell / PF.size) | 0} · ${SN.TERRAIN_NAMES[PF.map.terrain[cell]]} · cost ${PF.cost[cell] || 'blocked'}`;
  }

  function bindSetup() {
    const cv = $('pf-map');
    const view = () => PF.setup.view();
    // wheel zooms; drag pans (Pan tool, or any button other than the left one)
    PF.setup.bindCamera((e) => PF.tool === 'pan' || e.button !== 0);
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      cv.setPointerCapture(e.pointerId);
      PF.painting = true;
      const v = view();
      if (v) applyTool(R.cellAt(cv, v, e));
    });
    cv.addEventListener('pointermove', (e) => {
      const v = view();
      if (!v) return;
      const cell = R.cellAt(cv, v, e);
      $('pf-hover').textContent = hoverText(cell);
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
      syncLeafletTool();
    });
    $('pf-brush').addEventListener('input', (e) => { PF.brush = +e.target.value; $('pf-brush-v').textContent = e.target.value; });
    $('pf-size').addEventListener('change', (e) => { PF.size = +e.target.value; newMap(); });
    $('pf-new').addEventListener('click', newMap);
    $('pf-start').addEventListener('click', startRace);
    $('pf-zoom-in').addEventListener('click', () => PF.setup.zoom(1.4));
    $('pf-zoom-out').addEventListener('click', () => PF.setup.zoom(0.7));
    $('pf-fit').addEventListener('click', () => PF.setup.home());

    const sw = (t, label) => { const c = SN.OVERVIEW_RGB[t]; return `<span><i style="background:rgb(${c})"></i>${label} <b>${SN.COST[t] || '✕'}</b></span>`; };
    $('pf-legend').innerHTML = [sw(T.ROAD, 'Road'), sw(T.PATH, 'Footpath'), sw(T.GRASS, 'Grass'), sw(T.FOREST, 'Forest'),
      sw(T.SHALLOW, 'Shallow'), sw(T.PLAZA, 'Plaza'), sw(T.BUILDING, 'Building'), sw(T.DEEP, 'Deep water')].join('');
  }

  function drawSetup(now) {
    const cv = $('pf-map'), v = PF.setup.view();
    if (!v) return;
    const ctx = cv.getContext('2d');
    R.drawBase(ctx, v, PF.world, PF.mode, now);
    if (PF.mode === 'logical') R.drawCellDetail(ctx, v, PF.cost, null, 0);
    R.drawFlag(ctx, v, PF.start, '#e04838', 'S');
    R.drawFlag(ctx, v, PF.goal, '#48b060', 'G');
  }

  // ----- real-map mode: Leaflet owns the mouse, so we listen to its events instead of the canvas's
  function cellOfEvent(e) { const v = PF.setup.view(); return v ? PF.setup.cellFromContainerPoint(e.containerPoint, v) : -1; }

  function syncLeafletTool() {
    const lf = PF.setup && PF.setup.lf;
    if (!lf) return;
    if (PF.tool === 'wall' || PF.tool === 'erase') lf.dragging.disable(); else lf.dragging.enable();   // paint, or pan
  }

  function bindLeaflet() {
    const lf = PF.setup.lf;
    if (!lf || lf._pfBound) return;
    lf._pfBound = true;
    lf.on('mousedown', (e) => { if (PF.tool === 'wall' || PF.tool === 'erase') { PF.painting = true; applyTool(cellOfEvent(e)); } });
    lf.on('mousemove', (e) => {
      const cell = cellOfEvent(e);
      $('pf-hover').textContent = hoverText(cell);
      if (PF.painting) applyTool(cell);
    });
    const end = () => { if (PF.painting) { PF.painting = false; check(); } };
    lf.on('mouseup', end);
    lf.on('click', (e) => { if (PF.tool === 'start' || PF.tool === 'goal') { applyTool(cellOfEvent(e)); check(); } });
    syncLeafletTool();
  }

  // ------------------------------------------------------------------ the race
  function startRace() {
    const W = PF.size, cards = $('race-cards');
    closeRace();
    cards.innerHTML = '';
    const race = { cards: [], playing: true, speed: 1, acc: 0, firstDone: false, allDone: false };
    for (const algo of SN.ALGOS) {
      const res = SN.engine.search(algo.id, PF.cost, W, W, PF.start, PF.goal);   // run ONCE in C++, replay below
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<div class="cv"><div class="lf" hidden></div><canvas></canvas>
          <div class="map-tools">
            <button class="z-in" title="Zoom in">+</button><button class="z-out" title="Zoom out">−</button>
            <button class="z-fit" title="Reset this map's view (only this map)">⟲</button>
            <button class="fs" title="Fit to screen (full screen)">⛶</button>
          </div>
        </div>
        <div class="info">
          <div class="top"><span class="nm" style="color:${algo.css}">${algo.name}</span></div>
          <div class="long">${algo.long}</div>
          <span class="ds">${algo.ds}</span>
          <p class="how">${algo.how}</p>
          <div class="big"><span>Cells expanded</span><b>0</b></div>
          <div class="state"></div>
          <dl class="res" hidden></dl>
          <div class="badges"></div>
        </div>
        <aside class="fsbar">
          <button class="go f-play">⏸ Pause</button>
          <button class="f-step">Step</button>
          <button class="f-reset">↺ Restart race</button>
          <label>Speed <input type="range" class="f-speed" min="-1.5" max="1.5" step="0.05" value="0"> <b class="f-speed-v">1×</b></label>
          <div class="view-toggle" data-for="racefs"><button data-mode="physical">Physical</button><button data-mode="logical">Logical</button></div>
          <button class="f-exit">Exit full screen</button>
        </aside>`;
      cards.appendChild(el);
      const over = document.createElement('canvas');
      over.width = W; over.height = W;
      // first[cell] = the step at which the search expanded it (for the numbers in the Logical view)
      const first = new Int32Array(W * W).fill(-1);
      res.order.forEach((c, i) => { if (first[c] < 0) first[c] = i; });
      const card = { algo, res, el, first, cv: el.querySelector('canvas'), over, octx: over.getContext('2d'), img: null, dirty: null,
        cursor: 0, done: false, finishRank: 0, badges: '', html: '',
        play: el.querySelector('.f-play'), num: el.querySelector('.big b'), state: el.querySelector('.state'), resBox: el.querySelector('.res'), badgeBox: el.querySelector('.badges') };
      card.surf = new SN.stage.Surface(card.cv, el.querySelector('.lf'));     // every map has its own camera
      card.surf.focus = [PF.start, PF.goal];                   // reset shows the start and the goal
      card.surf.attach(PF.map);
      card.surf.bindCamera((e) => e.button === 0 || e.button === 1 || e.button === 2);
      const q = (k) => el.querySelector(k);
      q('.z-in').addEventListener('click', () => card.surf.zoom(1.4));
      q('.z-out').addEventListener('click', () => card.surf.zoom(0.7));
      q('.z-fit').addEventListener('click', () => card.surf.home());
      const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen(); };
      q('.fs').addEventListener('click', toggleFs);
      q('.f-exit').addEventListener('click', toggleFs);
      q('.f-play').addEventListener('click', () => $('race-play').click());
      q('.f-step').addEventListener('click', () => $('race-step').click());
      q('.f-reset').addEventListener('click', () => $('race-reset').click());
      q('.f-speed').addEventListener('input', (e) => {
        $('race-speed').value = e.target.value;
        $('race-speed').dispatchEvent(new Event('input'));
        race.cards.forEach((o) => { o.el.querySelector('.f-speed').value = e.target.value; o.el.querySelector('.f-speed-v').textContent = $('race-speed-v').textContent; });
      });
      el.addEventListener('fullscreenchange', () => {      // entering or leaving full screen: the map gets a new size, so show it from the start again
        q('.f-speed').value = $('race-speed').value; q('.f-speed-v').textContent = $('race-speed-v').textContent;
        setTimeout(() => card.surf.home(), 120);
      });
      race.cards.push(card);
    }
    PF.race = race;
    setViewMode(PF.mode);
    resetRace();
    $('pf-setup').hidden = true;
    $('pf-race').hidden = false;
  }

  function closeRace() {                                      // remove the Leaflet maps of the four cards
    if (PF.race) for (const c of PF.race.cards) c.surf.destroyLeaflet();
  }

  function resetRace() {
    const race = PF.race;
    race.playing = true; race.acc = 0; race.firstDone = false; race.allDone = false; race.finished = 0;
    $('race-play').textContent = '⏸ Pause';
    for (const c of race.cards) {
      c.cursor = 0; c.done = false; c.finishRank = 0; c.badges = ''; c.html = '';
      c.octx.clearRect(0, 0, PF.size, PF.size);
      c.img = c.octx.createImageData(PF.size, PF.size);
      c.dirty = null;
      c.el.classList.remove('finished');
      c.resBox.hidden = true;
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
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 215;
      const x = cell % W, y = (cell / W) | 0;                  // remember what changed, to redraw only that
      c.dirty = c.dirty ? { x0: Math.min(c.dirty.x0, x), y0: Math.min(c.dirty.y0, y), x1: Math.max(c.dirty.x1, x), y1: Math.max(c.dirty.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
      if (c.cursor >= c.res.order.length) {
        c.done = true;
        c.finishRank = ++race.finished;
        c.el.classList.add('finished');
        if (c.finishRank === 1) banner(`${c.algo.name} reached the goal first, after ${c.cursor} expansions. The others are still searching.`, true);
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
    const label = $('race-play').textContent;
    for (const c of race.cards) { if (c.play.textContent !== label) c.play.textContent = label; drawCard(c, now); }
  }

  function drawCard(c, now) {
    const v = c.surf.view();
    if (!v) return;
    if (c.dirty) {                                            // copy only the changed part of the picture
      const d = c.dirty;
      c.octx.putImageData(c.img, 0, 0, d.x0, d.y0, d.x1 - d.x0 + 1, d.y1 - d.y0 + 1);
      c.dirty = null;
    }
    const ctx = c.cv.getContext('2d');
    R.drawBase(ctx, v, PF.world, PF.mode, now);
    ctx.globalAlpha = PF.mode === 'logical' ? 0.55 : 0.7;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c.over, v.ox, v.oy, v.W * v.s, v.H * v.s);
    ctx.globalAlpha = 1;
    if (PF.mode === 'logical') R.drawCellDetail(ctx, v, PF.cost, c.first, c.cursor);
    if (c.done) R.drawPath(ctx, v, c.res.path, PF.mode === 'logical' ? '#d4202a' : '#ffffff');
    else if (c.cursor > 0) R.drawHead(ctx, v, c.res.order[c.cursor - 1], now);
    R.drawFlag(ctx, v, PF.start, '#e04838', 'S');
    R.drawFlag(ctx, v, PF.goal, '#48b060', 'G');
    updateInfo(c);
  }

  // The information column of a card. Before the card finishes it shows only the live count.
  function updateInfo(c) {
    const html = `${c.cursor}|${c.done}|${c.badges}`;
    if (c.html === html) return;
    c.html = html;
    c.num.textContent = c.cursor.toLocaleString('en');
    if (!c.done) { c.state.textContent = '⏳ searching…'; return; }
    c.state.textContent = '✔ reached the goal';
    const steps = c.res.path.length - 1;
    c.resBox.hidden = false;
    c.resBox.innerHTML = `<dt>Route cost</dt><dd>${c.res.cost}</dd><dt>Route steps</dt><dd>${steps}</dd>` +
      (PF.map.real ? `<dt>Distance</dt><dd>≈ ${Math.round(steps * PF.map.cellMeters)} m</dd>` : '');
    c.badgeBox.innerHTML = c.badges;
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
      closeRace();
      PF.race = null;
      $('pf-race').hidden = true;
      $('pf-setup').hidden = false;
    });
  }

  function setViewMode(mode) {
    PF.mode = mode;
    document.querySelectorAll('.view-toggle[data-for=pf] button, .view-toggle[data-for=race] button, .view-toggle[data-for=racefs] button')
      .forEach((x) => x.classList.toggle('active', x.dataset.mode === mode));
  }

  function bindViewToggles() {
    document.querySelectorAll('.view-toggle[data-for=pf], .view-toggle[data-for=race]').forEach((group) => {
      group.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setViewMode(b.dataset.mode); });
    });
    $('race-cards').addEventListener('click', (e) => {          // the toggle inside a full-screen card
      const b = e.target.closest('.view-toggle[data-for=racefs] button');
      if (b) setViewMode(b.dataset.mode);
    });
  }

  // The size list only makes sense for generated towns; the real map has one fixed size.
  function sizeOptions() {
    const sel = $('pf-size');
    if (SN.stage.real) { sel.innerHTML = `<option>Pune · ${SN.stage.pune.W} × ${SN.stage.pune.H}</option>`; sel.disabled = true; }
    else {
      if (!SN.SIZES.includes(PF.size)) PF.size = 100;          // coming back from the big Pune grid
      sel.innerHTML = SN.SIZES.map((s) => `<option value="${s}">${s} × ${s}</option>`).join('');
      sel.value = String(PF.size); sel.disabled = false;
    }
    $('pf-new').title = SN.stage.real ? 'New start and goal' : 'Generate a new town';
  }

  // The mode switch (pixel town <-> real map) changed: start again on the other map.
  function onMode() {
    closeRace();
    PF.race = null;
    $('pf-race').hidden = true;
    $('pf-setup').hidden = false;
    PF.setup.destroyLeaflet();
    sizeOptions();
    if (!SN.stage.real) PF.size = +$('pf-size').value;
    newMap();
  }

  let last = 0;
  SN.pathfinder = {
    init() {
      PF.setup = new SN.stage.Surface($('pf-map'), $('pf-lf'));
      bindSetup(); bindRace(); bindViewToggles();
      sizeOptions();
      newMap();
      $('race-speed-v').textContent = '1×';
    },
    onMode,
    frame(now) {
      const dt = Math.min(100, last ? now - last : 16.7);
      last = now;
      if (PF.race) raceFrame(now, dt);
      else if (!$('pf-setup').hidden) drawSetup(now);
    },
  };
})(globalThis.SN = globalThis.SN || {});
