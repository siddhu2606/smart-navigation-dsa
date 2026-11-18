// Disaster Sim: an incident (a fire) starts where you click. Only the people near it are told to leave.
// Ambulances, shelter beds and medics are shared, and the C++ engine decides who is served first with a
// priority queue (std::priority_queue). The page only draws what the engine reports after each tick.
(function (SN) {
  'use strict';
  const T = SN.T, K = SN.KINDS, ST = SN.STATE, R = SN.render, $ = (id) => document.getElementById(id);
  const TPS = 20;                          // ticks per second at 1x
  const BASES = [100, 70, 40, 10];         // priority points for rank 1, 2, 3, 4
  // Everything except the priority order is fixed.
  const DEFAULTS = { people: 200, ambulances: 4, medics: 2, beds: 40, radius: 25, fireEvery: 6, fireRadius: 12, female: 0, aging: 1 };
  const TOWN_SIZE = 150;

  const S = {
    size: TOWN_SIZE, seed: 1, map: null, world: null, surf: null, mode: 'physical',
    sites: null, fireCell: 0, doors: [], shelterCells: [], depot: 0, cost: null,
    phase: 'ready',                       // ready | running | paused | done
    speed: 2, acc: 0, fireApplied: false,
    cur: null, prev: null, amb: null, ambPrev: null, queue: [], metrics: null,
    order: SN.DEFAULT_ORDER.slice(),      // the four groups, most urgent first (the page lets you drag them)
  };

  // ------------------------------------------------------------------ building the scenario
  function newMap() {
    if (SN.stage.real) {
      const p = SN.stage.pune;
      S.map = Object.assign({}, p, { terrain: p.base.slice() });     // a fresh copy: fire changes it
      S.sites = SN.stage.pickPuneSites(S.map, 'sim', 3);
    } else {
      S.map = SN.mapgen.generate(S.size, S.size, 'sim' + Math.floor(Math.random() * 1e6));
      S.sites = SN.mapgen.pickSites(S.map, S.map.seed, 3);
    }
    S.size = S.map.W;
    S.world = new SN.World(S.map);
    S.surf.attach(S.map);
    bindLeaflet();
    S.world.repaintAll();                                       // building colours changed (hospital, shelters)
    S.depot = S.sites.hospital.door;
    S.shelterCells = S.sites.shelters.map((b) => b.door);
    S.doors = S.map.buildings.slice(1).filter((b) => b.door >= 0 && b.door && b.kind === 'house').map((b) => b.door);
    S.fireCell = centreCell(S.sites.fire);
    rebuild();
  }

  function centreCell(b) { return b.cell >= 0 && b.cell !== undefined ? b.cell : (b.y + (b.h >> 1)) * S.map.W + b.x + (b.w >> 1); }

  function params(priority) {
    return Object.assign({}, DEFAULTS, { seed: S.seed, priority, base: K.map((k, i) => BASES[S.order.indexOf(i)]) });
  }

  function resetTerrain() {
    if (!S.fireApplied) return;
    S.map.terrain.set(S.map.base);
    S.world.repaintAll();
    S.fireApplied = false;
  }

  // (Re)create the simulation in the engine: tick 0, nothing has moved yet.
  function rebuild() {
    resetTerrain();
    S.cost = SN.mapgen.costArray(S.map.terrain);
    SN.engine.simInit(S.map, S.cost, S.doors, S.shelterCells, S.depot, S.fireCell, params($('sim-priority').checked));
    readState(true);
    applyFire();                                   // the first burning cell
    S.phase = 'ready';
    S.acc = 0;
    $('sim-play').textContent = '▶ Start';
    updatePanel();
  }

  // The cells everybody has walked (or driven) through, so the page can draw the routes that were followed.
  function addTrails(first) {
    const add = (list, i, cell) => { const t = list[i] || (list[i] = []); if (t[t.length - 1] !== cell) { t.push(cell); if (t.length > 800) t.shift(); } };
    if (first) { S.trails = []; S.atrails = []; }
    for (let i = 0; i < S.cur.length / 6; i++) add(S.trails, i, S.cur[i * 6]);
    for (let i = 0; i < S.amb.length / 3; i++) add(S.atrails, i, S.amb[i * 3]);
  }

  function drawTrails(ctx, v) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, Math.min(4, v.s * 0.3));
    ctx.setLineDash([7, 6]);
    const line = (t) => {
      if (t.length < 2) return;
      ctx.beginPath();
      for (let k = 0; k < t.length; k++) { const [x, y] = R.cellCenter(v, t[k]); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    };
    ctx.globalAlpha = 0.8;
    S.trails.forEach((t, i) => { ctx.strokeStyle = K[S.cur[i * 6 + 1]].color; line(t); });
    ctx.strokeStyle = '#e03030'; ctx.globalAlpha = 0.5;
    S.atrails.forEach(line);
    ctx.restore();
  }

  function readState(first) {
    S.prev = first ? SN.engine.simPeople() : S.cur;
    S.ambPrev = first ? SN.engine.simAmbulances() : S.amb;
    S.cur = SN.engine.simPeople();
    S.amb = SN.engine.simAmbulances();
    addTrails(first);
    S.queue = SN.engine.simQueue();
    S.metrics = SN.engine.simMetrics();
  }

  function applyFire() {
    const cells = SN.engine.simNewFire();
    if (!cells.length) return;
    for (const c of cells) S.map.terrain[c] = T.FIRE;
    S.world.refresh(Array.from(cells));
    S.fireApplied = true;
  }

  function tick() {
    const finished = SN.engine.simStep();
    readState(false);
    applyFire();
    if (finished) { S.phase = 'done'; $('sim-play').textContent = '↺ Run again'; }
    updatePanel();
  }

  // ------------------------------------------------------------------ the incident
  function placeIncident(cell) {
    if (cell < 0 || S.phase !== 'ready') return;
    const t = S.map.terrain[cell];
    if (t === T.DEEP || t === T.SHALLOW) { $('sim-hint').textContent = 'The incident has to be on land. Pick another spot.'; return; }
    S.fireCell = cell;
    rebuild();
  }

  // ------------------------------------------------------------------ side panel
  // The priority order: drag a group up or down (or use the arrows). The top group is served first.
  function buildOrder() {
    const ul = $('sim-order');
    ul.innerHTML = S.order.map((k, rank) => `<li draggable="true" data-kind="${k}"><span class="grip">⋮⋮</span>
      <i style="background:${K[k].color}"></i><span class="nm"><b>${rank + 1}. ${K[k].name}</b><small>${K[k].note}</small></span>
      <span class="pts">${BASES[rank]}</span><button data-up title="Move up">▲</button><button data-down title="Move down">▼</button></li>`).join('');
    let from = -1;
    ul.querySelectorAll('li').forEach((li, idx) => {
      li.addEventListener('dragstart', (e) => { from = idx; li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; });
      li.addEventListener('dragend', () => li.classList.remove('drag'));
      li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('over'); });
      li.addEventListener('dragleave', () => li.classList.remove('over'));
      li.addEventListener('drop', (e) => { e.preventDefault(); if (from >= 0 && from !== idx) moveKind(from, idx); });
      li.querySelector('[data-up]').addEventListener('click', () => idx > 0 && moveKind(idx, idx - 1));
      li.querySelector('[data-down]').addEventListener('click', () => idx < S.order.length - 1 && moveKind(idx, idx + 1));
    });
  }

  function moveKind(from, to) {
    const [k] = S.order.splice(from, 1);
    S.order.splice(to, 0, k);
    buildOrder();
    rebuild();
  }

  // The status panel keeps only what matters for the course: who is where, and how it ended.
  function updatePanel() {
    const m = S.metrics, p = S.cur;
    if (!m) return;
    let waiting = 0, walking = 0, riding = 0;
    for (let i = 0; i < p.length; i += 6) {
      const s = p[i + 3];
      if (s === ST.WAITING_RIDE) waiting++;
      else if (s === ST.WALKING) walking++;
      else if (s === ST.RIDING) riding++;
    }
    const rows = [
      ['Time (ticks)', m.ticks, ''], ['Told to evacuate', m.alerted, ''],
      ['Waiting for ambulance', waiting, ''], ['Walking to shelter', walking, ''],
      ['In an ambulance', riding, ''], ['Safe in shelter', m.safe, 'good'],
      ['Lost to the fire', m.lost, m.lost ? 'bad' : ''], ['Stranded', m.stranded, m.stranded ? 'bad' : ''],
    ];
    $('sim-stats').innerHTML = rows.map(([k, v, c]) => `<div class="${c}">${k}<b>${v}</b></div>`).join('');

    // the ambulance queue, in the order the priority queue will serve it
    const q = S.queue, rowsQ = [];
    for (let i = 0; i < Math.min(6, q.length / 4); i++) {
      const kind = K[q[i * 4 + 1]];
      rowsQ.push(`<div class="qrow${i === 0 ? ' first' : ''}"><span class="rank">${i + 1}</span><i style="background:${kind.color}"></i>` +
        `<span>${kind.name} #${q[i * 4]}</span><span class="pts">${q[i * 4 + 2]}</span><span class="wait">${q[i * 4 + 3]}t</span></div>`);
    }
    $('sim-qcount').textContent = waiting ? `· ${waiting} waiting` : '';
    $('sim-queue').innerHTML = rowsQ.length
      ? `<div class="qhead"><span>#</span><span></span><span>${$('sim-priority').checked ? 'next to be picked up' : 'first come, first served'}</span><span>points</span><span>waited</span></div>` + rowsQ.join('')
      : '<div class="empty">Nobody is waiting for an ambulance.</div>';

    $('sim-hint').innerHTML = S.phase === 'done'
      ? `Finished after ${m.ticks} ticks: <b>${m.safe}</b> safe, <b>${m.lost}</b> lost, <b>${m.stranded}</b> stranded (no bed or no road). Press <b>Reset</b> for a new crowd.`
      : S.phase === 'ready'
        ? 'Click anywhere on the map to place the fire, then press <b>Start</b>. Only people near it are evacuated.'
        : 'Dashed lines are the routes taken so far: people in their group colour, ambulances in red. A ! means waiting for an ambulance.';
  }

  // ------------------------------------------------------------------ comparing the two policies
  function compare() {
    const out = [];
    for (const priority of [true, false]) {
      resetTerrain();
      SN.engine.simInit(S.map, S.cost, S.doors, S.shelterCells, S.depot, S.fireCell, params(priority));
      SN.engine.simRun();
      out.push(SN.engine.simMetrics());
    }
    rebuild();
    const [a, b] = out, f = (x) => x.toFixed(0);
    const row = (label, x, y, lowerBetter) => {
      const better = x === y ? 0 : (x < y) === lowerBetter ? 1 : 2;
      return `<tr><td>${label}</td><td class="${better === 1 ? 'win' : ''}">${f(x)}</td><td class="${better === 2 ? 'win' : ''}">${f(y)}</td></tr>`;
    };
    $('sim-compare-out').innerHTML = `<table class="cmp"><tr><th></th><th>Priority queue</th><th>Plain queue</th></tr>` +
      row('Safe', a.safe, b.safe, false) + row('Lost to the fire', a.lost, b.lost, true) + row('Stranded', a.stranded, b.stranded, true) +
      row('Wait of injured and disabled (ticks)', a.urgentWait, b.urgentWait, true) + '</table>' +
      '<p class="hint">Same people, same incident, same crowd. Only the waiting line differs.</p>';
  }

  // ------------------------------------------------------------------ drawing
  // which pixel-art character stands for a person of each group
  function spriteOf(kind, female, id) {
    if (kind === 0) return female ? 'woman' : 'man';
    if (kind === 1) return ['child', 'elder', 'pregnant'][id % 3];
    if (kind === 2) return ['wheelchair', 'visual'][id % 2];
    return 'injured';
  }

  function lerpPos(prevCell, curCell, alpha, W) {
    const px = prevCell % W, py = (prevCell / W) | 0, cx = curCell % W, cy = (curCell / W) | 0;
    return [px + (cx - px) * alpha + 0.5, py + (cy - py) * alpha + 0.5, cx - px, cy - py];
  }

  function drawPerson(ctx, v, i, now, alpha) {
    const W = S.size, c = S.cur, pr = S.prev, s = c[i * 6 + 3];
    if (s === ST.SAFE || s === ST.RIDING) return;
    const [x, y, dx, dy] = lerpPos(pr[i * 6], c[i * 6], alpha, W);
    const px = v.ox + x * v.s, py = v.oy + y * v.s, kind = K[c[i * 6 + 1]], female = c[i * 6 + 2] === 1;
    if (s === ST.LOST) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(2, v.s * 0.2);
      const r = Math.max(3, v.s * 0.35);
      ctx.beginPath(); ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r); ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r); ctx.stroke();
      return;
    }
    const moving = dx !== 0 || dy !== 0;
    if (v.s >= R.TILE_MIN && S.mode === 'physical' && !S.map.real && (s !== ST.UNAWARE || v.s >= R.TILE_MIN * 1.6)) {
      const sprite = spriteOf(c[i * 6 + 1], female, i), sheet = SN.sprites.personSheet(sprite, female || sprite === 'pregnant', i % 10);
      const dir = dy > 0 ? 0 : dy < 0 ? 1 : dx < 0 ? 2 : dx > 0 ? 3 : 0, frame = moving ? (Math.floor(now / 140) + i) % 3 : 0;
      const size = v.s * 1.15;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet[dir][frame], Math.round(px - size / 2), Math.round(py - size * 0.85), size, size);
      if (s === ST.WAITING_RIDE) ctx.drawImage(SN.sprites.bubble('!'), px - v.s * 0.45, py - v.s * 2.1, v.s * 0.9, v.s * 0.9);
    } else {
      const r = Math.max(S.map.real ? 4 : 2.5, v.s * (s === ST.UNAWARE ? 0.32 : 0.5));
      ctx.fillStyle = s === ST.UNAWARE ? (S.map.real ? 'rgba(40,40,60,.75)' : 'rgba(255,255,255,.6)') : kind.color;
      ctx.strokeStyle = s === ST.WAITING_RIDE ? '#fff' : '#101820';
      ctx.lineWidth = s === ST.WAITING_RIDE ? 2.5 : 1;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  // The first people in the ambulance queue wear their place in line: 1, 2, 3.
  function drawRank(ctx, v, id, rank, alpha) {
    const W = S.size, [x, y] = lerpPos(S.prev[id * 6], S.cur[id * 6], alpha, W);
    const px = v.ox + x * v.s, py = v.oy + y * v.s - Math.max(12, v.s * 1.4), r = 9;
    ctx.fillStyle = rank === 1 ? '#f2c14e' : '#ffffff'; ctx.strokeStyle = '#101820'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#101820'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 12px ${R.NUM_FONT}`;
    ctx.fillText(String(rank), px, py + 1);
  }

  function drawAmbulance(ctx, v, i, now, alpha) {
    const W = S.size, a = S.amb, pa = S.ambPrev;
    const [x, y, dx, dy] = lerpPos(pa[i * 3], a[i * 3], alpha, W);
    const px = v.ox + x * v.s, py = v.oy + y * v.s;
    const size = Math.max(14, v.s * 1.7), flash = Math.floor(now / 200) % 2;
    ctx.save();
    ctx.translate(px, py);
    if (dx || dy) ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(SN.sprites.ambulance(flash), -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawScene(now) {
    const cv = $('sim-map'), v = S.surf.view();
    if (!v) return;
    const ctx = cv.getContext('2d');
    R.drawBase(ctx, v, S.world, S.mode, now);
    if (S.mode === 'logical') R.drawCellDetail(ctx, v, S.cost, null, 0);

    const [fx, fy] = R.cellCenter(v, S.fireCell);
    if (S.phase === 'ready') {                                   // a pulsing marker where the fire will start
      const pulse = 14 + Math.sin(now / 160) * 3;
      ctx.strokeStyle = '#ff5a1f'; ctx.fillStyle = 'rgba(255,90,31,.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(fx, fy, pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    drawTrails(ctx, v);
    R.drawFlag(ctx, v, S.depot, '#e03030', '+');
    for (const c of S.shelterCells) R.drawFlag(ctx, v, c, '#48b060', 'S');

    const alpha = S.phase === 'running' ? Math.min(1, S.acc) : 1, n = S.cur.length / 6;
    for (let i = 0; i < n; i++) if (S.cur[i * 6 + 3] !== ST.LOST) drawPerson(ctx, v, i, now, alpha);
    for (let i = 0; i < n; i++) if (S.cur[i * 6 + 3] === ST.LOST) drawPerson(ctx, v, i, now, alpha);
    for (let i = 0; i < S.amb.length / 3; i++) drawAmbulance(ctx, v, i, now, alpha);
    for (let r = 0; r < Math.min(3, S.queue.length / 4); r++) drawRank(ctx, v, S.queue[r * 4], r + 1, alpha);
  }

  // ------------------------------------------------------------------ input
  function hover(cell) {
    const el = $('sim-hover');
    if (cell < 0) { el.textContent = ''; return; }
    let text = `x ${cell % S.size}, y ${(cell / S.size) | 0} · ${SN.TERRAIN_NAMES[S.map.terrain[cell]]}`;
    for (let i = 0; i < S.cur.length / 6; i++) {
      if (S.cur[i * 6] === cell && S.cur[i * 6 + 3] !== ST.SAFE) {
        const stateNames = ['at home', 'told to leave', 'waiting for an ambulance', 'walking', 'riding', 'safe', 'lost', 'stranded'];
        text += ` · ${K[S.cur[i * 6 + 1]].name} #${i}, priority ${S.cur[i * 6 + 4]}, ${stateNames[S.cur[i * 6 + 3]]}`;
        break;
      }
    }
    el.textContent = text;
  }

  function bindMap() {
    const cv = $('sim-map');
    S.surf.bindCamera(null);                                     // mouse wheel zooms (town); drag is handled below
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
    cv.addEventListener('pointermove', (e) => {
      const v = S.surf.view(), dpr = cv.width / cv.getBoundingClientRect().width;
      if (!v) return;
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 4) S.surf.cam.panBy(dx * dpr, dy * dpr, v.s);
        drag.x = e.clientX; drag.y = e.clientY;
      }
      hover(R.cellAt(cv, v, e));
    });
    cv.addEventListener('pointerup', (e) => {
      const v = S.surf.view();
      if (drag && drag.moved <= 4 && v) placeIncident(R.cellAt(cv, v, e));
      drag = null;
    });
    cv.addEventListener('pointerleave', () => { $('sim-hover').textContent = ''; });
    $('sim-zoom-in').addEventListener('click', () => S.surf.zoom(1.4));
    $('sim-zoom-out').addEventListener('click', () => S.surf.zoom(0.7));
    $('sim-fit').addEventListener('click', () => { S.surf.home(); rebuild(); });   // start the same incident again, view from the start
    $('sim-all').addEventListener('click', () => S.surf.fitAll());
  }

  // real-map mode: Leaflet owns the mouse
  function bindLeaflet() {
    const lf = S.surf.lf;
    if (!lf || lf._simBound) return;
    lf._simBound = true;
    const cellOf = (e) => { const v = S.surf.view(); return v ? S.surf.cellFromContainerPoint(e.containerPoint, v) : -1; };
    lf.on('mousemove', (e) => hover(cellOf(e)));
    lf.on('click', (e) => placeIncident(cellOf(e)));
  }

  function bindPanel() {
    $('sim-play').addEventListener('click', () => {
      if (S.phase === 'done') rebuild();                         // run again from tick 0
      if (S.phase === 'running') { S.phase = 'paused'; $('sim-play').textContent = '▶ Resume'; }
      else { S.phase = 'running'; $('sim-play').textContent = '⏸ Pause'; updatePanel(); }
    });
    $('sim-step').addEventListener('click', () => {
      if (S.phase === 'done') return;
      S.phase = 'paused'; $('sim-play').textContent = '▶ Resume';
      tick();
    });
    $('sim-reset').addEventListener('click', () => { S.seed = 1 + Math.floor(Math.random() * 98); rebuild(); });   // a new crowd
    $('sim-speed').addEventListener('input', (e) => { S.speed = Math.pow(10, +e.target.value); $('sim-speed-v').textContent = S.speed.toFixed(1) + '×'; });
    $('sim-speed').dispatchEvent(new Event('input'));
    $('sim-priority').addEventListener('change', rebuild);
    $('sim-compare').addEventListener('click', compare);
    document.querySelectorAll('.view-toggle[data-for=sim]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      S.mode = b.dataset.mode;
      g.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    }));
  }

  let last = 0, started = false;
  SN.sim = {
    // The map is only generated the first time the tab is opened.
    open() {
      if (started) return;
      started = true;
      S.surf = new SN.stage.Surface($('sim-map'), $('sim-lf'));
      buildOrder(); bindMap(); bindPanel();
      newMap();
    },
    // the mode switch (pixel town <-> real map) changed
    onMode() {
      if (!started) return;
      S.phase = 'ready';
      $('sim-play').textContent = '▶ Start';
      S.surf.destroyLeaflet();
      S.size = TOWN_SIZE;
      newMap();
    },
    frame(now) {
      const dt = Math.min(100, last ? now - last : 16.7);
      last = now;
      if (!started) return;
      if (S.phase === 'running') {
        S.acc += (dt / 1000) * TPS * S.speed;
        let steps = 0;
        while (S.acc >= 1 && S.phase === 'running' && steps++ < 12) { S.acc -= 1; tick(); }
        if (S.acc > 1) S.acc = 1;
      }
      drawScene(now);
    },
  };
})(globalThis.SN = globalThis.SN || {});
