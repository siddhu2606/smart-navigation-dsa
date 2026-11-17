// Disaster Sim: a fire starts in ONE building. Only the people near it are told to leave.
// Ambulances, shelter beds and medics are shared, and the C++ engine decides who is served first with a
// priority queue (std::priority_queue). The page only draws what the engine reports after each tick.
(function (SN) {
  'use strict';
  const T = SN.T, K = SN.KINDS, ST = SN.STATE, R = SN.render, $ = (id) => document.getElementById(id);
  const TPS = 20;   // ticks per second at 1x

  const S = {
    size: 100, seed: '', map: null, world: null, surf: null, mode: 'physical',
    sites: null, fireCell: 0, doors: [], shelterCells: [], depot: 0, cost: null,
    phase: 'ready',                       // ready | running | paused | done
    speed: 2, acc: 0, fireApplied: false,
    cur: null, prev: null, amb: null, ambPrev: null, queue: [], beds: [], metrics: null,
    vals: {},                             // slider values by id
    order: SN.DEFAULT_ORDER.slice(),      // kinds, most urgent first (the page lets you drag them)
  };

  const SCENARIO = [
    { id: 'people', label: 'People in town', min: 20, max: 400, val: 150 },
    { id: 'ambulances', label: 'Ambulances', min: 1, max: 10, val: 4 },
    { id: 'medics', label: 'Medics', min: 0, max: 6, val: 2 },
    { id: 'beds', label: 'Beds per shelter', min: 5, max: 150, val: 40 },
    { id: 'radius', label: 'Evacuation radius', min: 5, max: 60, val: 25 },
    { id: 'fireEvery', label: 'Fire spread (ticks)', min: 2, max: 20, val: 6 },
    { id: 'fireRadius', label: 'Fire size (max radius)', min: 2, max: 40, val: 12 },
    { id: 'seed', label: 'Population seed', min: 1, max: 99, val: 1 },
  ];
  const WEIGHTS = [{ id: 'female', label: 'Women (bonus)', min: 0, max: 50, val: 0 }, { id: 'aging', label: 'Aging per tick', min: 0, max: 5, val: 1 }];
  const BASES = [100, 70, 40, 10];          // priority points for rank 1, 2, 3, 4

  // ------------------------------------------------------------------ building the scenario
  function newMap(keepSeed) {
    if (!keepSeed) S.seed = 'sim' + Math.floor(Math.random() * 1e6);
    if (SN.stage.real) {
      const p = SN.stage.pune;
      S.map = Object.assign({}, p, { terrain: p.base.slice() });     // a fresh copy: fire changes it
      S.sites = SN.stage.pickPuneSites(S.map, S.seed, 3);
    } else {
      S.map = SN.mapgen.generate(S.size, S.size, S.seed);
    }
    S.size = S.map.W;
    S.world = new SN.World(S.map);
    S.surf.attach(S.map);
    bindLeaflet();
    if (!SN.stage.real) S.sites = SN.mapgen.pickSites(S.map, S.seed, 3);
    S.world.repaintAll();                                       // building colours changed (hospital, shelters)
    S.depot = S.sites.hospital.door;
    S.shelterCells = S.sites.shelters.map((b) => b.door);
    S.doors = S.map.buildings.slice(1).filter((b) => b.door >= 0 && b.door && b.kind === 'house').map((b) => b.door);
    S.cost = SN.mapgen.costArray(S.map.terrain);
    setFireBuilding(S.sites.fire);
  }

  function centreCell(b) { return b.cell >= 0 && b.cell !== undefined ? b.cell : (b.y + (b.h >> 1)) * S.map.W + b.x + (b.w >> 1); }

  function setFireBuilding(b) {
    S.fireBuilding = b;
    S.fireCell = centreCell(b);
    rebuild();
  }

  function params(priority) {
    const v = S.vals;
    return { people: v.people, ambulances: v.ambulances, medics: v.medics, beds: v.beds, radius: v.radius,
      fireEvery: v.fireEvery, fireRadius: v.fireRadius, seed: v.seed, priority, base: K.map((k, i) => BASES[S.order.indexOf(i)]), female: v.female, aging: v.aging };
  }

  function resetTerrain() {
    if (!S.fireApplied) return;
    S.map.terrain.set(S.map.base);
    S.world.repaintAll();
    S.fireApplied = false;
  }

  // (Re)create the simulation in the engine from the current sliders: tick 0, nothing has moved yet.
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

  function readState(first) {
    S.prev = first ? SN.engine.simPeople() : S.cur;
    S.ambPrev = first ? SN.engine.simAmbulances() : S.amb;
    S.cur = SN.engine.simPeople();
    S.amb = SN.engine.simAmbulances();
    S.queue = SN.engine.simQueue();
    S.beds = SN.engine.simBeds(S.shelterCells.length);
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

  // ------------------------------------------------------------------ side panel
  function buildControls() {
    const make = (list, box) => {
      box.innerHTML = list.map((c) => `<label>${c.label}<input type="range" id="sl-${c.id}" min="${c.min}" max="${c.max}" value="${c.val}"><b id="sv-${c.id}">${c.val}</b></label>`).join('');
      for (const c of list) {
        S.vals[c.id] = c.val;
        $('sl-' + c.id).addEventListener('input', (e) => {
          S.vals[c.id] = +e.target.value;
          $('sv-' + c.id).textContent = e.target.value;
        });
        $('sl-' + c.id).addEventListener('change', rebuild);      // rebuild once the slider is released
      }
    };
    make(SCENARIO, $('sim-scenario'));
    make(WEIGHTS, $('sim-weights'));
    buildOrder();
    const sel = document.createElement('label');
    sel.innerHTML = 'Map size <select id="sim-size">' + [100, 150, 200].map((s) => `<option value="${s}">${s} × ${s}</option>`).join('') + '</select>';
    sel.style.cssText = 'display:flex;gap:10px;align-items:center;font-size:13px';
    $('sim-scenario').prepend(sel);
    $('sim-size').addEventListener('change', (e) => { S.size = +e.target.value; newMap(); });
  }

  // The priority order: drag a group up or down (or use the arrows). The top group is served first.
  function buildOrder() {
    const ul = $('sim-order');
    ul.innerHTML = S.order.map((k, rank) => `<li draggable="true" data-kind="${k}"><span class="grip">⋮⋮</span>
      <i style="background:${K[k].color}"></i><span class="nm"><b>${rank + 1}. ${K[k].name}</b><small>${K[k].note}</small></span>
      <span class="pts">${BASES[rank]}</span><button data-up>▲</button><button data-down>▼</button></li>`).join('');
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

  function sizeOptions() {
    const sel = $('sim-size');
    if (SN.stage.real) { sel.innerHTML = `<option>Pune · ${SN.stage.pune.W} × ${SN.stage.pune.H}</option>`; sel.disabled = true; }
    else { if (![100, 150, 200].includes(S.size)) S.size = 100;
      sel.innerHTML = [100, 150, 200].map((n) => `<option value="${n}">${n} × ${n}</option>`).join(''); sel.value = String(S.size); sel.disabled = false; }
  }

  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

  function updatePanel() {
    const m = S.metrics, p = S.cur;
    if (!m) return;
    let waiting = 0, walking = 0, riding = 0, unaware = 0;
    for (let i = 0; i < p.length; i += 6) {
      const s = p[i + 3];
      if (s === ST.WAITING_RIDE) waiting++;
      else if (s === ST.WALKING) walking++;
      else if (s === ST.RIDING) riding++;
      else if (s === ST.UNAWARE) unaware++;
    }
    const bedsUsed = S.beds.reduce((a, b) => a + b, 0), bedsAll = S.vals.beds * S.shelterCells.length;
    const rows = [
      ['Time (ticks)', m.ticks], ['In the town', m.people], ['Told to evacuate', m.alerted], ['Not in danger', unaware],
      ['Waiting for ambulance', waiting], ['Walking to shelter', walking], ['In an ambulance', riding],
      ['Safe in shelter', `${m.safe}`], ['Lost to the fire', m.lost], ['No bed / stranded', m.stranded],
      ['Beds used', `${bedsUsed}/${bedsAll}`], ['Treated by medics', m.treated],
      ['Vulnerable safe', `${m.vulnerableSafe}/${m.vulnerable}`], ['Avg ride wait', m.rideWait.toFixed(0)],
    ];
    $('sim-stats').innerHTML = rows.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
    const q = S.queue, el = $('sim-queue');
    el.innerHTML = q.length === 0 ? '<div class="empty">nobody is waiting</div>'
      : Array.from({ length: q.length / 4 }, (_, i) => {
        const kind = K[q[i * 4 + 1]];
        return `<div><i style="background:${kind.color}"></i><span>#${q[i * 4]} ${kind.name}</span><b>${q[i * 4 + 2]}</b><span>${q[i * 4 + 3]}t</span></div>`;
      }).join('');
    $('sim-hint').innerHTML = S.phase === 'done'
      ? `Fire over after ${m.ticks} ticks: <b>${m.safe}</b> safe, <b>${m.lost}</b> lost, <b>${m.stranded}</b> stranded (no bed or no road).`
      : 'Click a building to start the fire there (or press <b>Random fire</b>). Only people near the fire are evacuated.';
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
    const row = (label, x, y, lowerBetter, fmt) => {
      const better = x === y ? 0 : (x < y) === lowerBetter ? 1 : 2;
      return `<tr><td>${label}</td><td class="${better === 1 ? 'win' : ''}">${fmt(x)}</td><td class="${better === 2 ? 'win' : ''}">${fmt(y)}</td></tr>`;
    };
    $('sim-compare-out').innerHTML = `<table class="cmp"><tr><th></th><th>Priority queue</th><th>First come first served</th></tr>` +
      row('Safe', a.safe, b.safe, false, f) + row('Lost to fire', a.lost, b.lost, true, f) + row('Stranded', a.stranded, b.stranded, true, f) +
      row('Vulnerable safe', a.vulnerableSafe, b.vulnerableSafe, false, f) +
      row('Urgent ride wait', a.urgentWait, b.urgentWait, true, f) + row('Avg ride wait', a.rideWait, b.rideWait, true, f) +
      row('Treatment wait', a.treatWait, b.treatWait, true, f) + row('Finished at tick', a.ticks, b.ticks, true, f) + '</table>' +
      '<p class="hint">Urgent = injured, wheelchair, pregnant. Same people, same fire, same seed; only the waiting line differs.</p>';
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
    if (v.s >= R.TILE_MIN && s !== ST.UNAWARE || v.s >= R.TILE_MIN * 1.6) {
      const sprite = spriteOf(c[i * 6 + 1], female, i), sheet = SN.sprites.personSheet(sprite, female || sprite === 'pregnant', i % 10);
      const dir = dy > 0 ? 0 : dy < 0 ? 1 : dx < 0 ? 2 : dx > 0 ? 3 : 0, frame = moving ? (Math.floor(now / 140) + i) % 3 : 0;
      const size = v.s * 1.15;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet[dir][frame], Math.round(px - size / 2), Math.round(py - size * 0.85), size, size);
      if (s === ST.WAITING_RIDE) ctx.drawImage(SN.sprites.bubble('!'), px - v.s * 0.45, py - v.s * 2.1, v.s * 0.9, v.s * 0.9);
    } else {
      const r = Math.max(S.map.real ? 3.5 : 2, v.s * (s === ST.UNAWARE ? 0.32 : 0.5));
      ctx.fillStyle = s === ST.UNAWARE ? (S.map.real ? 'rgba(40,40,60,.75)' : 'rgba(255,255,255,.55)') : kind.color;
      ctx.strokeStyle = s === ST.WAITING_RIDE ? '#fff' : '#101820';
      ctx.lineWidth = s === ST.WAITING_RIDE ? 2 : 1;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  function drawAmbulance(ctx, v, i, now, alpha) {
    const W = S.size, a = S.amb, pa = S.ambPrev;
    const [x, y, dx, dy] = lerpPos(pa[i * 3], a[i * 3], alpha, W);
    const px = v.ox + x * v.s, py = v.oy + y * v.s;
    const size = Math.max(10, v.s * 1.7), flash = Math.floor(now / 200) % 2;
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

    // evacuation zone around the fire
    const [fx, fy] = R.cellCenter(v, S.fireCell);
    ctx.strokeStyle = 'rgba(255,140,40,.9)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(fx, fy, S.vals.radius * v.s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);

    R.drawFlag(ctx, v, S.depot, '#e03030', '+');
    for (const c of S.shelterCells) R.drawFlag(ctx, v, c, '#48b060', 'S');

    const alpha = S.phase === 'running' ? Math.min(1, S.acc) : 1, n = S.cur.length / 6;
    for (let i = 0; i < n; i++) if (S.cur[i * 6 + 3] !== ST.LOST) drawPerson(ctx, v, i, now, alpha);
    for (let i = 0; i < n; i++) if (S.cur[i * 6 + 3] === ST.LOST) drawPerson(ctx, v, i, now, alpha);
    for (let i = 0; i < S.amb.length / 3; i++) drawAmbulance(ctx, v, i, now, alpha);
  }

  // ------------------------------------------------------------------ input
  function bindMap() {
    const cv = $('sim-map'), cam = () => S.surf.cam;
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
    cv.addEventListener('pointermove', (e) => {
      const v = S.surf.view(), dpr = cv.width / cv.getBoundingClientRect().width;
      if (!v) return;
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 4) cam().panBy(dx * dpr, dy * dpr, v.s);
        drag.x = e.clientX; drag.y = e.clientY;
      }
      hover(R.cellAt(cv, v, e));
    });
    cv.addEventListener('pointerup', (e) => {
      const v = S.surf.view();
      if (drag && drag.moved <= 4 && v) clickCell(R.cellAt(cv, v, e));
      drag = null;
    });
    cv.addEventListener('pointerleave', () => { $('sim-hover').textContent = ''; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
      cam().zoomAt(cv.width, cv.height, (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr, e.deltaY < 0 ? 1.25 : 0.8);
    }, { passive: false });
    $('sim-zoom-in').addEventListener('click', () => cam().zoomBy(1.4, cv.width, cv.height));
    $('sim-zoom-out').addEventListener('click', () => cam().zoomBy(0.7, cv.width, cv.height));
    $('sim-fit').addEventListener('click', () => cam().fit(S.size, S.size));
  }

  // real-map mode: Leaflet owns the mouse
  function bindLeaflet() {
    const lf = S.surf.lf;
    if (!lf || lf._simBound) return;
    lf._simBound = true;
    const cellOf = (e) => { const v = S.surf.view(); return v ? S.surf.cellFromContainerPoint(e.containerPoint, v) : -1; };
    lf.on('mousemove', (e) => hover(cellOf(e)));
    lf.on('click', (e) => clickCell(cellOf(e)));
  }

  function hover(cell) {
    const el = $('sim-hover');
    if (cell < 0) { el.textContent = ''; return; }
    let text = `x ${cell % S.size}, y ${(cell / S.size) | 0} · ${SN.TERRAIN_NAMES[S.map.terrain[cell]]}`;
    const W = S.size, mx = cell % W, my = (cell / W) | 0;
    for (let i = 0; i < S.cur.length / 6; i++) {
      const c = S.cur[i * 6];
      if (Math.abs((c % W) - mx) <= 0 && Math.abs(((c / W) | 0) - my) <= 0 && S.cur[i * 6 + 3] !== ST.SAFE) {
        const stateNames = ['at home', 'alerted', 'waiting for ambulance', 'walking', 'riding', 'safe', 'lost', 'stranded'];
        text += ` · #${i} ${K[S.cur[i * 6 + 1]].name}, priority ${S.cur[i * 6 + 4]}, ${stateNames[S.cur[i * 6 + 3]]}`;
        break;
      }
    }
    el.textContent = text;
  }

  function clickCell(cell) {
    if (cell < 0 || S.phase !== 'ready' || S.map.terrain[cell] !== T.BUILDING) return;
    const b = S.map.buildings[S.map.bid[cell]];
    if (!b || b.kind !== 'house') { $('sim-hint').textContent = 'The fire has to start in an ordinary house, not the hospital or a shelter.'; return; }
    setFireBuilding(b);
  }

  function bindPanel() {
    $('sim-play').addEventListener('click', () => {
      if (S.phase === 'done') rebuild();                       // run again from tick 0
      if (S.phase === 'running') { S.phase = 'paused'; $('sim-play').textContent = '▶ Resume'; }
      else { S.phase = 'running'; $('sim-play').textContent = '⏸ Pause'; }
    });
    $('sim-step').addEventListener('click', () => {
      if (S.phase === 'done') return;
      S.phase = 'paused'; $('sim-play').textContent = '▶ Resume';
      tick();
    });
    $('sim-reset').addEventListener('click', rebuild);
    $('sim-speed').addEventListener('input', (e) => { S.speed = Math.pow(10, +e.target.value); $('sim-speed-v').textContent = S.speed.toFixed(1) + '×'; });
    $('sim-speed').dispatchEvent(new Event('input'));
    $('sim-priority').addEventListener('change', rebuild);
    $('sim-newmap').addEventListener('click', () => newMap());
    $('sim-randfire').addEventListener('click', () => {
      const houses = S.map.buildings.slice(1).filter((b) => b.kind === 'house');
      setFireBuilding(houses[Math.floor(Math.random() * houses.length)]);
    });
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
      S.surf = new SN.stage.Surface($('sim-map'), $('sim-lf'), true);
      buildControls(); bindMap(); bindPanel();
      newMap();
      sizeOptions();
    },
    // the mode switch (pixel town <-> real map) changed
    onMode() {
      if (!started) return;
      S.phase = 'ready';
      $('sim-play').textContent = '▶ Start';
      S.surf.destroyLeaflet();
      sizeOptions();
      if (!SN.stage.real) S.size = +$('sim-size').value;
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
