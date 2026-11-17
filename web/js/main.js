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

  async function boot() {
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
