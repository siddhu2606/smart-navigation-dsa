// Tests the page's JavaScript against the real C++ engine (the WebAssembly build).
// Run after backend/build.sh wasm:   node web/tests/run.js
const path = require('path');
const root = path.join(__dirname, '..');
globalThis.SN = {};
for (const f of ['config', 'rng', 'mapgen']) require(path.join(root, 'js', f + '.js'));
const engine = require(path.join(root, 'js', 'engine.js'));
const createEngine = require(path.join(root, 'engine', 'engine.js'));
const SN = globalThis.SN;

let failed = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failed++; console.log('FAIL: ' + msg); } };

(async () => {
  await engine.load(createEngine);

  for (const [size, seed] of [[100, 'a'], [100, 'b'], [150, 'c'], [200, 'd']]) {
    const map = SN.mapgen.generate(size, size, seed);
    const cost = SN.mapgen.costArray(map.terrain);
    const doors = map.buildings.slice(1).map((b) => b.door);
    ok(doors.length > 20, `${size}/${seed}: the map has buildings`);
    let compared = 0;
    for (let k = 0; k < 6; k++) {
      const a = doors[k * 7 % doors.length], b = doors[(k * 13 + 5) % doors.length];
      const r = SN.ALGOS.map((al) => engine.search(al.id, cost, size, size, a, b));
      if (!r[2].found) continue;
      compared++;
      ok(r.every((x) => x.found), 'all four find the route');
      ok(r[3].cost === r[2].cost, `A* cost ${r[3].cost} equals Dijkstra cost ${r[2].cost}`);
      ok(r[2].cost <= r[0].cost && r[2].cost <= r[1].cost, 'Dijkstra is never worse than BFS or DFS');
      ok(r[0].path.length <= r[2].path.length, 'BFS has the fewest steps');
      ok(r[3].order.length <= r[2].order.length, 'A* expands no more cells than Dijkstra');
      ok(r[0].path[0] === a && r[0].path[r[0].path.length - 1] === b, 'path runs start to goal');
    }
    ok(compared >= 3, `${size}/${seed}: enough connected pairs (${compared})`);

    // disaster simulation on the generated map
    const sites = SN.mapgen.pickSites(map, seed, 3);
    const houses = map.buildings.slice(1).filter((b) => b.kind === 'house' && b.door).map((b) => b.door);
    const fire = (sites.fire.y + (sites.fire.h >> 1)) * size + sites.fire.x + (sites.fire.w >> 1);
    const p = { people: 150, ambulances: 4, medics: 2, beds: 40, radius: 25, fireEvery: 6, seed: 1, priority: true,
      base: [10, 40, 70, 100], female: 0, aging: 1 };
    const results = [];
    for (const priority of [true, false]) {
      engine.simInit(map, cost, houses, sites.shelters.map((b) => b.door), sites.hospital.door, fire, { ...p, priority });
      ok(engine.simPeople().length === 150 * 6, 'sim reports every person');
      ok(engine.simNewFire().length === 1, 'the fire starts in one cell');
      engine.simRun();
      const m = engine.simMetrics();
      results.push(m);
      ok(m.safe + m.lost + m.stranded + (m.people - m.alerted) === m.people, `${size}/${seed}: every person accounted for`);
      ok(m.alerted > 0 && m.alerted < m.people, `${size}/${seed}: only the people near the fire evacuate (${m.alerted}/${m.people})`);
    }
    console.log(`${size}/${seed}: ok. priority: safe ${results[0].safe}, lost ${results[0].lost}; fifo: safe ${results[1].safe}, lost ${results[1].lost}`);
  }
  console.log(`${checks} checks, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
