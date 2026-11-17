// engine.js - talks to the C++ code compiled to WebAssembly (backend/wasm_api.cpp).
// Arrays are copied into the module's memory, the C++ function runs, and results are read back out.
(function (SN) {
  'use strict';
  let M = null;   // the loaded WebAssembly module

  const heap = {
    u8: () => M.HEAPU8, i32: () => M.HEAP32, f64: () => M.HEAPF64,
  };

  // copy a typed array into wasm memory; returns the address
  function put(arr) {
    const ptr = M._malloc(arr.byteLength || 4);
    if (arr instanceof Uint8Array) heap.u8().set(arr, ptr);
    else heap.i32().set(arr, ptr >> 2);
    return ptr;
  }
  const readI32 = (ptr, n) => heap.i32().slice(ptr >> 2, (ptr >> 2) + n);

  const engine = {
    // factory is the createEngine function made by Emscripten (engine/engine.js)
    async load(factory) { M = await factory(); return engine; },
    get ready() { return !!M; },

    // algo: 0 BFS, 1 DFS, 2 Dijkstra, 3 A*. cost: Uint8Array of W*H step costs (0 = blocked).
    search(algo, cost, W, H, start, goal) {
      const cp = put(cost);
      const n = M._sn_search(algo, cp, W, H, start, goal);
      M._free(cp);
      return {
        order: readI32(M._sn_search_order(), n),
        path: readI32(M._sn_search_path(), M._sn_search_path_len()),
        cost: M._sn_search_cost(),     // -1 = no route
        found: M._sn_search_cost() >= 0,
      };
    },

    // ---- disaster simulation
    // p: {people, ambulances, medics, beds, radius, fireEvery, seed, priority(bool), base[7], female, aging}
    simInit(map, cost, doors, shelters, depot, fireCell, p) {
      const tp = put(Uint8Array.from(map.terrain)), cp = put(cost);
      const dp = put(Int32Array.from(doors)), sp = put(Int32Array.from(shelters));
      const params = [p.people, p.ambulances, p.medics, p.beds, p.radius, p.fireEvery, p.seed, p.priority ? 1 : 0,
        ...p.base, p.female, p.aging];
      const pp = put(Int32Array.from(params));
      M._sn_sim_init(tp, cp, map.W, map.H, dp, doors.length, sp, shelters.length, depot, fireCell, pp);
      for (const ptr of [tp, cp, dp, sp, pp]) M._free(ptr);
    },
    simStep() { return M._sn_sim_step() === 1; },
    simRun() { return M._sn_sim_run(); },
    simTick() { return M._sn_sim_tick(); },
    // every call below returns a fresh copy of the current state
    simPeople() { return readI32(M._sn_sim_people(), M._sn_sim_people_count() * 6); },       // cell kind female state priority treated
    simAmbulances() { return readI32(M._sn_sim_ambulances(), M._sn_sim_ambulance_count() * 3); },  // cell state person
    simNewFire() { return readI32(M._sn_sim_new_fire(), M._sn_sim_new_fire_count()); },
    simQueue() { return readI32(M._sn_sim_queue(), M._sn_sim_queue_count() * 4); },           // id kind priority waited
    simBeds(n) { return readI32(M._sn_sim_beds(), n); },
    simMetrics() {
      const p = M._sn_sim_metrics() >> 3, v = heap.f64();
      const m = Array.from(v.slice(p, p + 13));
      return { people: m[0], alerted: m[1], safe: m[2], lost: m[3], stranded: m[4], treated: m[5], vulnerable: m[6],
        vulnerableSafe: m[7], rideWait: m[8], urgentWait: m[9], timeToSafety: m[10], treatWait: m[11], ticks: m[12] };
    },
  };

  SN.engine = engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
})(globalThis.SN = globalThis.SN || {});
