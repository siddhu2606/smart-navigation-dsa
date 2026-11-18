# Architecture

All the algorithms are C++ (`backend/`). The browser (`web/`) only draws and handles clicks.
The C++ is compiled to WebAssembly by GitHub Actions, so there is no server.

```mermaid
flowchart LR
  subgraph Build["Build (GitHub Actions: .github/workflows/deploy.yml)"]
    CPP["backend/*.cpp<br/>bfs, dfs, dijkstra, astar, sim"] -->|Emscripten| WASM["web/engine/engine.js + .wasm"]
    OSM["OpenStreetMap data"] -->|tools/build_pune.js| PUNE["web/data/pune.json<br/>(grid of Pune)"]
  end

  subgraph Browser["Browser (GitHub Pages)"]
    direction TB
    MAIN["main.js<br/>tabs, Town/Real switch, theme"]
    PF["pathfinder.js<br/>setup + 2x2 race"]
    SIM["sim.js<br/>disaster screen"]
    ENG["engine.js<br/>copies arrays in/out of wasm"]
    STAGE["stage.js + camera.js<br/>map surface, zoom, pan, Leaflet sync"]
    REND["render.js + sprites.js<br/>canvas drawing (physical / logical view)"]
    WORLD["mapgen.js + world.js<br/>town scenery, map data"]
    MAIN --> PF & SIM
    PF & SIM --> ENG
    PF & SIM --> STAGE --> REND
    PF & SIM --> WORLD
  end

  WASM --> ENG
  PUNE --> STAGE
  TILES["OSM tiles (Leaflet)"] --> STAGE
```

## Layers

| Layer | Files | Job |
| --- | --- | --- |
| **Algorithms** | `backend/grid.h`, `bfs.cpp`, `dfs.cpp`, `dijkstra.cpp`, `astar.cpp`, `search.*` | Search a cost grid, return the order cells were expanded and the route |
| **Simulation** | `backend/sim.h`, `sim.cpp` | Fire spread, evacuation, ambulances, beds, medics; one `std::priority_queue` per shared resource |
| **WASM bridge** | `backend/wasm_api.cpp`, `web/js/engine.js` | The only place JS and C++ meet. No logic here |
| **Screens** | `web/js/pathfinder.js`, `sim.js`, `main.js` | Controls, replay of the results, status panels |
| **Map surface** | `web/js/stage.js`, `camera.js` | One canvas (plus a Leaflet map underneath in Real mode). Zoom, pan, reset, click-to-cell |
| **Drawing** | `web/js/render.js`, `sprites.js`, `mapgen.js`, `world.js` | Pixel-art town, the Physical and Logical (grid) views |
| **Tests** | `backend/tests/tests.cpp` | Plain C++ tests, no framework |

## Path Finder data flow

```mermaid
sequenceDiagram
  participant U as User
  participant P as pathfinder.js
  participant E as C++ (wasm)
  U->>P: place Start / Goal / walls
  U->>P: Start the race
  P->>E: search(algo, cost grid, start, goal) x4, once each
  E-->>P: expansion order + route + cost
  loop every tick, same speed
    P->>P: replay one expansion per card
  end
  P-->>U: first finisher banner, then compare cheapest route
```

Results are computed up front but replayed one expansion per step, so nothing is shown before the replay reaches it.

## Disaster Sim data flow

```mermaid
sequenceDiagram
  participant U as User
  participant S as sim.js
  participant E as C++ sim (wasm)
  U->>S: click an incident spot, set priority order
  S->>E: create world (grid, people, ambulances, beds)
  loop every tick
    S->>E: step()
    E-->>S: positions, queue, counts
    S->>S: draw map, queue panel, status
  end
```

Inside the C++ step: the fire spreads, people are told to evacuate, and each waiting line is a `priority_queue`
ordered by group (injured, disabled, dependents, adults) and then by wait time. Turning "Serve by priority" off
swaps the order for first come, first served.

## Two map modes

* **Town**: a generated pixel-art town on our own canvas and camera.
* **Real**: Pune, built from OpenStreetMap into `web/data/pune.json`. Leaflet draws the tiles, our canvas is drawn on top,
  and the view is limited to the grid so every visible spot is usable.
