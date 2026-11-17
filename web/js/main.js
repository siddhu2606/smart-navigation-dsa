// Start-up: load the C++ engine (WebAssembly), then run the two screens.
(function (SN) {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $('tab-path').hidden = name !== 'path';
    $('tab-sim').hidden = name !== 'sim';
    if (name === 'sim') SN.sim.open();
  }

  // Town <-> real map of Pune. Both screens start again on the other map.
  async function setMode(real) {
    const sw = $('mode-switch'), label = $('mode-label'), pill = $('engine-pill');
    label.classList.add('busy');
    try {
      if (real) {
        if (typeof L === 'undefined') throw new Error('Leaflet could not be loaded (are you offline?)');
        pill.textContent = 'loading the map of Pune…';
        await SN.stage.loadPune();
      }
      SN.stage.real = real;
      SN.pathfinder.onMode();
      SN.sim.onMode();
      pill.textContent = real ? 'C++ engine ready · ' + SN.stage.pune.name : 'C++ engine ready';
      pill.className = 'pill ok';
    } catch (err) {
      sw.checked = false;
      SN.stage.real = false;
      pill.textContent = 'real map failed: ' + err.message;
      pill.className = 'pill bad';
    }
    label.dataset.real = String(SN.stage.real);
    label.classList.remove('busy');
  }

  // light / dark theme (remembered in the browser)
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    $('theme-btn').textContent = t === 'dark' ? '☀' : '☾';
    try { localStorage.setItem('sn-theme', t); } catch (e) { /* storage blocked: the theme just is not remembered */ }
  }

  async function boot() {
    $('theme-btn').textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '☾';
    $('theme-btn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    try {
      if (typeof createEngine !== 'function') throw new Error('engine/engine.js is missing. Build it with backend/build.sh wasm (see the README).');
      await SN.engine.load(createEngine);
    } catch (err) {
      $('boot').className = 'boot error';
      $('boot').textContent = 'Could not load the C++ engine: ' + err.message;
      $('engine-pill').textContent = 'engine failed';
      $('engine-pill').className = 'pill bad';
      return;
    }
    $('boot').hidden = true;
    $('engine-pill').textContent = 'C++ engine ready';
    $('engine-pill').className = 'pill ok';

    SN.pathfinder.init();
    $('mode-switch').addEventListener('change', (e) => setMode(e.target.checked));
    if (/[?&#]mode=real/.test(location.href)) { $('mode-switch').checked = true; setMode(true); }
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    showTab('path');

    const loop = (now) => {
      if (!$('tab-path').hidden) SN.pathfinder.frame(now);
      if (!$('tab-sim').hidden) SN.sim.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  boot();
})(globalThis.SN = globalThis.SN || {});
