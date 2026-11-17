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

A fire starts **where you click on the map** (any land, not only a building) and spreads through grass, forest and buildings, but never further than a fixed radius from where it started. People
within the evacuation radius are told to leave. **Everyone else stays home.**

There are four groups of people (`enum Kind` in [`sim.h`](backend/sim.h)):

| Group | Who | Needs |
| --- | --- | --- |
| **Injured** | hurt people | an ambulance and a medic |
| **Disabled** | wheelchair users, visually impaired | an ambulance |
| **Dependents** | children, elderly, pregnant women | an ambulance, and a medic |
| **Adults** | everyone else | nothing: they walk to the shelter |

**You set the priority by dragging.** The *Priority order* list in the side panel is draggable (or use the arrows): the group at
the top is served first and gets 100 points, then 70, 40 and 10. Changing the order restarts the scenario with the new queue.

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

**The priority** is the points of the group's place in the list (100 / 70 / 40 / 10), an optional bonus for women (0 by
default, so gender is ignored unless you ask for it) and **aging**.

**Aging without re-sorting.** A person's real priority is `base + aging × (now − alertTick)`. Everyone gains the same
amount every tick, so the order of the queue never changes with time. We store `base − aging × alertTick` once when the
person joins; the `priority_queue` never has to be re-sorted and nobody waits forever.

**Fire and re-planning.** Fire blocks cells. If the next cell on an ambulance's or a walker's route catches fire, they run A\*
again from where they stand. Anyone who stays next to the fire for 4 ticks is lost. If no road reaches someone, or every
bed is taken, they are **stranded**.

**Compare policies** runs the same people, fire and seed twice, once with the priority queue and once with the same queue
ordered by arrival time (first come, first served), and puts the results side by side. The priority queue picks up the
injured and disabled sooner.

## Using the page

- **Map controls** (+, −, fit, scroll wheel, drag) work on every map. In the Path Finder the four race maps share one camera,
  so they zoom and pan together.
- **Physical / Logical** view. Logical shows the cost grid; zoom in and the grid boxes appear, then the step cost of every cell
  and, in the race, the number of the step at which each search expanded it.
- **Light / dark** theme with the button in the top right (remembered by the browser).
- The Disaster Sim has no tuning knobs: the numbers of people, ambulances, medics and beds are fixed. You choose where the incident
  is and the priority order of the four groups. The side panel shows the ambulance queue (the next people to be picked up, in order,
  and the first three also wear 1, 2, 3 on the map) and a short status.

## Town or real map

The switch in the top right changes both screens between the **pixel-art town** and a **real map of Pune** (Deccan Gymkhana and
Shivajinagar, about 4 km × 2 km).

- **Leaflet** only draws the background and handles pan and zoom. It does no routing.
- The streets, buildings, water, hospitals and schools come from **OpenStreetMap**. [`tools/build_pune.js`](tools/build_pune.js) turns
  them once into the same kind of grid the town uses (7 m cells, roads cost 1, footpaths 2, open ground 6, buildings and deep water blocked)
  and saves it as `web/data/pune.json`. The browser never calls an OpenStreetMap data API.
- So **the same C++ code** runs on both maps: the same four algorithms and the same simulation. A canvas on top of Leaflet draws
  the searches, people, ambulances and fire at the right place.
- Real hospitals are where the ambulances start, and real schools, halls and other public buildings are the shelters.

Map data © OpenStreetMap contributors (ODbL).

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
node web/tests/run.js            # the page's JavaScript and the Pune map against the real engine (after build.sh wasm)
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

- A true road **graph** for the real map (intersections as vertices, segments as weighted edges) instead of a grid.
- Ambulances that carry more than one patient; hospitals with their own capacity.
- D\* Lite for replanning without searching from scratch.
