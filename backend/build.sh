#!/usr/bin/env bash
# Builds the C++ code with plain g++ (no CMake needed).
#   ./build.sh          console demo        ->  build/demo
#   ./build.sh test     run the tests       ->  build/tests
#   ./build.sh wasm     browser engine      ->  ../web/engine/engine.js + engine.wasm  (needs Emscripten, emcc)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
CORE="search.cpp bfs.cpp dfs.cpp dijkstra.cpp astar.cpp sim.cpp"

case "${1:-demo}" in
  demo)
    g++ -std=c++17 -O2 -Wall -Wextra $CORE main.cpp -o build/demo
    ./build/demo ;;
  test)
    SAN=""; [ "${SAN_CHECK:-}" = "1" ] && SAN="-fsanitize=address,undefined"   # SAN_CHECK=1 on Linux/macOS
    g++ -std=c++17 -O2 -Wall -Wextra $SAN $CORE tests/tests.cpp -o build/tests
    ./build/tests ;;
  wasm)
    mkdir -p ../web/engine
    emcc -std=c++17 -O2 $CORE wasm_api.cpp -o ../web/engine/engine.js \
      -sMODULARIZE=1 -sEXPORT_NAME=createEngine -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,node \
      -sEXPORTED_FUNCTIONS=_malloc,_free,_sn_search,_sn_search_order,_sn_search_path,_sn_search_path_len,_sn_search_cost,_sn_sim_init,_sn_sim_step,_sn_sim_run,_sn_sim_tick,_sn_sim_people,_sn_sim_people_count,_sn_sim_ambulances,_sn_sim_ambulance_count,_sn_sim_new_fire,_sn_sim_new_fire_count,_sn_sim_queue,_sn_sim_queue_count,_sn_sim_metrics,_sn_sim_beds \
      -sEXPORTED_RUNTIME_METHODS=HEAP32,HEAPU8,HEAPF64
    ;;
  *) echo "usage: $0 [demo|test|wasm]"; exit 1 ;;
esac
