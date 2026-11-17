// Shared settings: terrain codes, step costs, colours and the four algorithms.
// The terrain codes and COST values must match backend/toy_city.h and backend/sim.cpp.
(function (SN) {
  'use strict';

  const T = {
    GRASS: 0, ROAD: 1, BRIDGE: 2, PLAZA: 3, FOREST: 4, SAND: 5, SHALLOW: 6, DEEP: 7,
    BUILDING: 8, RUBBLE: 9, FIRE: 10, SMOKE: 11, BURNT: 12, DEBRIS: 13, PATH: 14,
  };
  const TERRAIN_NAMES = ['Grass', 'Road', 'Bridge', 'Plaza', 'Forest', 'Sand', 'Shallow water', 'Deep water',
    'Building', 'Rubble', 'Fire', 'Smoke', 'Burnt ground', 'Wall', 'Footpath'];

  // Price of stepping onto a cell of each terrain. 0 = blocked.
  const COST = new Uint8Array([6, 1, 1, 2, 10, 6, 14, 0, 0, 8, 0, 5, 4, 0, 2]);

  // One colour per terrain for the zoomed-out Physical view (the FireRed palette).
  const OVERVIEW_RGB = [
    [120, 192, 96], [230, 207, 152], [176, 128, 80], [200, 200, 184], [56, 128, 72], [232, 216, 152],
    [112, 168, 232], [64, 112, 208], [200, 88, 72], [152, 136, 120], [248, 120, 32], [168, 168, 168],
    [72, 64, 56], [104, 88, 72], [212, 176, 114],
  ];

  const ALGOS = [
    { id: 0, name: 'BFS', color: [78, 121, 167], css: '#4e79a7', long: 'Breadth-First Search',
      how: 'Queue. Explores in rings, ignores costs. Fewest steps.' },
    { id: 1, name: 'DFS', color: [225, 87, 89], css: '#e15759', long: 'Depth-First Search',
      how: 'Stack. Dives deep, backtracks. Finds a path, not a good one.' },
    { id: 2, name: 'Dijkstra', color: [89, 161, 79], css: '#59a14f', long: "Dijkstra's algorithm",
      how: 'Priority queue on cost so far. Always the cheapest path.' },
    { id: 3, name: 'A*', color: [242, 142, 43], css: '#f28e2b', long: 'A* search',
      how: 'Priority queue on cost so far + distance left. Cheapest path, fewer cells.' },
  ];

  // The four priority groups, in the same order as enum Kind in backend/sim.h.
  const KINDS = [
    { name: 'Adults', note: 'walk to the shelter by themselves', color: '#3b6fd8' },
    { name: 'Children, elderly, pregnant', note: 'need an ambulance', color: '#f0b030' },
    { name: 'Disabled', note: 'wheelchair, visually impaired; need an ambulance', color: '#58a858' },
    { name: 'Injured', note: 'need an ambulance and a medic', color: '#c84838' },
  ];
  const DEFAULT_ORDER = [3, 2, 1, 0];   // most urgent first: injured, disabled, dependents, adults

  // person states, same order as enum State in backend/sim.h
  const STATE = { UNAWARE: 0, ALERTED: 1, WAITING_RIDE: 2, WALKING: 3, RIDING: 4, SAFE: 5, LOST: 6, STRANDED: 7 };

  SN.T = T;
  SN.TERRAIN_NAMES = TERRAIN_NAMES;
  SN.COST = COST;
  SN.OVERVIEW_RGB = OVERVIEW_RGB;
  SN.ALGOS = ALGOS;
  SN.KINDS = KINDS;
  SN.DEFAULT_ORDER = DEFAULT_ORDER;
  SN.STATE = STATE;
  SN.SIZES = [100, 150, 200, 300];
})(globalThis.SN = globalThis.SN || {});
