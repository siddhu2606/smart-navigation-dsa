# Smart Navigation and Dynamic Disaster Response

A DSA course project. Two modes on one pixel-art town (a Pokémon FireRed look):

| Mode | What it shows | Data structures |
| --- | --- | --- |
| **Path Finder** | **BFS, DFS, Dijkstra and A\*** race on the same map, side by side, and nobody knows the result in advance | `queue`, `stack`, `priority_queue` |
| **Disaster Sim** | A fire starts in **one building**. People near it are evacuated. Ambulances, shelter beds and medics are shared, and the most vulnerable are served first | `priority_queue` (one waiting line per resource) |

All the algorithms are plain C++17 using the STL (`queue`, `stack`, `priority_queue`, `vector`). The C++ is compiled
to WebAssembly so the same code runs in the browser. The page only draws what the C++ reports.

**Live demo:** https://siddhu2606.github.io/smart-navigation-dsa/

## Where to read the code

Everything an examiner will ask about is in `backend/`, one small file per idea.

| File | What is in it | Lines |
| --- | --- | --- |
| [`grid.h`](backend/grid.h) | The map as a graph: cell = vertex, 4 neighbours, `cost[i]` = price of stepping onto a cell (0 = blocked) | 36 |
| [`bfs.cpp`](backend/bfs.cpp) | Breadth-First Search with `std::queue` | 36 |
| [`dfs.cpp`](backend/dfs.cpp) | Depth-First Search with `std::stack` (no recursion) | 36 |
| [`dijkstra.cpp`](backend/dijkstra.cpp) | Dijkstra with `std::priority_queue` | 43 |
| [`astar.cpp`](backend/astar.cpp) | A\* = Dijkstra + a Manhattan-distance guess | 48 |
| [`search.h`](backend/search.h), [`search.cpp`](backend/search.cpp) | The shared result type and the "walk the parents back" helper | 44 |
| [`sim.h`](backend/sim.h), [`sim.cpp`](backend/sim.cpp) | The disaster simulation | 132 + 372 |
| [`wasm_api.cpp`](backend/wasm_api.cpp) | The thin layer that lets JavaScript call the code (no algorithms) | 109 |
| [`main.cpp`](backend/main.cpp), [`toy_city.h`](backend/toy_city.h) | A console demo of both modes | |
| [`tests/tests.cpp`](backend/tests/tests.cpp) | Plain C++ tests, no framework | |

The web page is in `web/`: `pathfinder.js` (setup and the race), `sim.js` (the simulation screen), `engine.js` (calls the
WebAssembly), `mapgen.js` (generates the town, it is only scenery), `sprites.js` (the FireRed pixel art, drawn in code).

## Path Finder

**The map.** Every cell is a vertex joined to its 4 neighbours. Stepping onto a cell costs a number that depends on the
terrain, so the cheapest route is not always the shortest one:

| Terrain | Cost | Terrain | Cost |
| --- | --- | --- | --- |
| Road, bridge | 1 | Forest | 10 |
| Footpath, plaza | 2 | Shallow water | 14 |
| Grass, sand | 6 | Building, deep water, wall | blocked |

| | Frontier | Looks at costs? | Finds | Time |
| --- | --- | --- | --- | --- |
| BFS | `queue` (FIFO) | no | the path with the **fewest steps** | O(V + E) |
| DFS | `stack` (LIFO) | no | **a** path (usually a terrible one) | O(V + E) |
| Dijkstra | `priority_queue` on cost so far, `g` | yes | the **cheapest** path | O((V + E) log V) |
| A\* | `priority_queue` on `g + h` | yes | the **cheapest** path, expanding fewer cells | O((V + E) log V) |

`h` is the Manhattan distance to the goal. Every step costs at least 1, so `h` never over-estimates and A\* is optimal.

**The race is fair.** The C++ runs each search once and returns the order in which it expanded the cells. The page then
replays all four **at the same speed, one expansion per step**. Nothing is shown in advance: no total step count, no
progress bar, no winner. The first card to reach the goal gets the "first to finish" banner. Only when all four are done does
the page compare them and mark the cheapest route.

**Setting it up.** Pick a tool and click or drag on the map: **Start**, **Goal**, **Wall**, **Erase**. The page asks the engine
whether a route still exists and only enables *Start the race* if one does.

## Disaster Sim

A fire starts in one building (click one, or *Random fire*) and spreads through grass, forest and buildings. People
within the evacuation radius are told to leave. **Everyone else stays home.**

There are seven kinds of people: adult, child, elderly, pregnant, wheelchair, visually impaired and injured.
Elderly, pregnant, wheelchair and injured people cannot walk to the shelter and need an **ambulance**. The others walk.

Three resources are shared, and each has its own waiting line, a `std::priority_queue<Entry>`:

1. **Beds** in the shelters (limited). Beds are handed out to newly alerted people, most urgent first.
2. **Ambulances** (few). Each idle ambulance takes the person at the top of the line, drives there on the roads (A\*),
   carries them to their shelter and takes the next one.
3. **Medics** at the shelters. Elderly, pregnant and injured people queue for treatment, most urgent first.

```cpp
struct Entry {
    int key;      // higher = more urgent
    int tick;     // when the person joined the line
    int id;
    bool operator<(const Entry& o) const {
        if (key != o.key) return key < o.key;      // priority_queue gives out the LARGEST first
        if (tick != o.tick) return tick > o.tick;  // tie: whoever waited longer
        return id > o.id;
    }
};
```

**The priority** comes from the sliders: a base score for each kind (injured 100, wheelchair 90, pregnant 80, elderly 70,
child 60, visually impaired 50, adult 10), an optional bonus for women (0 by default, so gender is ignored unless you ask
for it) and **aging**.

**Aging without re-sorting.** A person's real priority is `base + aging × (now − alertTick)`. Everyone gains the same
amount every tick, so the order of the queue never changes with time. We store `base − aging × alertTick` once when the
person joins; the `priority_queue` never has to be re-sorted and nobody waits forever.

**Fire and re-planning.** Fire blocks cells. If the next cell on an ambulance's or a walker's route catches fire, they run A\*
again from where they stand. Anyone who stays next to the fire for 4 ticks is lost. If no road reaches someone, or every
bed is taken, they are **stranded**.

**Compare policies** runs the same people, fire and seed twice, once with the priority queue and once with the same queue
ordered by arrival time (first come, first served), and puts the results side by side. The priority queue picks up the
injured, wheelchair and pregnant people sooner.

## Run it

### In a browser

Open the live demo above, or build it yourself. You need [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) once:

```bash
./backend/build.sh wasm          # compiles the C++ to web/engine/engine.js + engine.wasm
cd web && python -m http.server  # then open http://localhost:8000
```

### The C++ on its own (no browser)

```bash
./backend/build.sh demo          # BFS, DFS, Dijkstra, A* on an ASCII map, then the simulation with both policies
./backend/build.sh test          # the C++ tests
node web/tests/run.js            # the page's JavaScript against the real engine (after build.sh wasm)
```

Only `g++` with C++17 is needed for `demo` and `test`.

On every push, GitHub Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) runs the tests, compiles the
C++ with Emscripten, tests the page code against it and publishes `web/` to GitHub Pages.

## Complexity cheat sheet

- V = number of cells, E ≈ 4V.
- BFS and DFS touch each cell once: O(V + E). Extra space O(V).
- Dijkstra and A\* push at most one entry per edge relaxation into the priority queue: O((V + E) log V).
- Simulation tick: A\* only when someone must (re)plan; otherwise O(people + ambulances). Priority queue push/pop O(log n).

## Future work

- A **real-map mode**: load streets of a real city (for example Pune) from OpenStreetMap, draw them with Leaflet, turn
  the road network into a graph and run the same algorithms on it, with a fire in one building and only the surrounding
  streets evacuating.
- Ambulances that carry more than one patient; hospitals with their own capacity.
- D\* Lite for replanning without searching from scratch.
