// wasm_api.cpp - the thin layer that lets the web page call the C++ code.
//
// The code is compiled to WebAssembly with Emscripten. JavaScript copies arrays into the module's
// memory, calls these functions and reads the results back from memory. There is no algorithm in this
// file: it only converts between plain arrays and the types in search.h and sim.h.
#include <vector>
#include "search.h"
#include "sim.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define API extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define API extern "C"
#endif

// ------------------------------------------------------------------ path finding
static SearchResult lastSearch;

// algo: 0 BFS, 1 DFS, 2 Dijkstra, 3 A*.  Returns how many cells were expanded.
API int sn_search(int algo, const unsigned char* cost, int W, int H, int start, int goal) {
    Grid g(W, H, vector<int>(cost, cost + W * H));
    if (algo == 0) lastSearch = bfs(g, start, goal);
    else if (algo == 1) lastSearch = dfs(g, start, goal);
    else if (algo == 2) lastSearch = dijkstra(g, start, goal);
    else lastSearch = astar(g, start, goal);
    return (int)lastSearch.order.size();
}
API const int* sn_search_order() { return lastSearch.order.data(); }
API const int* sn_search_path() { return lastSearch.path.data(); }
API int sn_search_path_len() { return (int)lastSearch.path.size(); }
API int sn_search_cost() { return lastSearch.found ? lastSearch.cost : -1; }

// ------------------------------------------------------------------ disaster simulation
static Simulation* sim = nullptr;
static vector<int> peopleBuf, ambBuf, queueBuf, fireBuf, bedsBuf;
static vector<double> metricsBuf;

static void snapshot() {
    peopleBuf.clear();
    for (const Person& p : sim->people) {
        peopleBuf.push_back(p.cell);
        peopleBuf.push_back(p.kind);
        peopleBuf.push_back(p.female ? 1 : 0);
        peopleBuf.push_back(p.state);
        peopleBuf.push_back(p.alertTick < 0 ? 0 : sim->effectivePriority(p));
        peopleBuf.push_back(p.treated ? 1 : 0);
    }
    ambBuf.clear();
    for (const Ambulance& a : sim->ambulances) {
        ambBuf.push_back(a.cell);
        ambBuf.push_back(a.state);
        ambBuf.push_back(a.person);
    }
    queueBuf.clear();
    for (const Entry& e : sim->queueTop(12)) {
        const Person& p = sim->people[e.id];
        queueBuf.push_back(e.id);
        queueBuf.push_back(p.kind);
        queueBuf.push_back(sim->effectivePriority(p));
        queueBuf.push_back(sim->tick - p.alertTick);
    }
    fireBuf = sim->newFire;
    bedsBuf = sim->bedsUsed;
    SimMetrics m = sim->metrics();
    metricsBuf = {(double)m.people, (double)m.alerted, (double)m.safe, (double)m.lost, (double)m.stranded,
                  (double)m.treated, (double)m.vulnerable, (double)m.vulnerableSafe, m.avgRideWait,
                  m.avgUrgentWait, m.avgTimeToSafety, m.avgTreatWait, (double)m.ticks};
}

// params: people, ambulances, medics, bedsPerShelter, alertRadius, fireEvery, seed, usePriority,
//         4 base priorities (ADULT, DEPENDENT, DISABLED, INJURED), femaleBonus, aging, fireRadius
API int sn_sim_init(const unsigned char* terrain, const unsigned char* cost, int W, int H,
                    const int* doors, int nDoors, const int* shelters, int nShelters,
                    int depot, int fireCell, const int* params) {
    delete sim;
    SimParams p;
    p.people = params[0];
    p.ambulances = params[1];
    p.medics = params[2];
    p.bedsPerShelter = params[3];
    p.alertRadius = params[4];
    p.fireEvery = params[5];
    p.seed = params[6];
    p.usePriority = params[7] != 0;
    for (int k = 0; k < KIND_COUNT; k++) p.basePriority[k] = params[8 + k];
    p.femaleBonus = params[8 + KIND_COUNT];
    p.aging = params[9 + KIND_COUNT];
    p.fireRadius = params[10 + KIND_COUNT];
    sim = new Simulation(vector<int>(terrain, terrain + W * H), vector<int>(cost, cost + W * H), W, H,
                         vector<int>(doors, doors + nDoors), vector<int>(shelters, shelters + nShelters),
                         depot, fireCell, p);
    snapshot();
    return 0;
}

API int sn_sim_step() { sim->step(); snapshot(); return sim->done() ? 1 : 0; }
API int sn_sim_run() { sim->runToEnd(); snapshot(); return sim->tick; }
API int sn_sim_tick() { return sim->tick; }

API const int* sn_sim_people() { return peopleBuf.data(); }          // 6 ints each: cell kind female state priority treated
API int sn_sim_people_count() { return (int)sim->people.size(); }
API const int* sn_sim_ambulances() { return ambBuf.data(); }         // 3 ints each: cell state person
API int sn_sim_ambulance_count() { return (int)sim->ambulances.size(); }
API const int* sn_sim_new_fire() { return fireBuf.data(); }          // cells that caught fire in the last step
API int sn_sim_new_fire_count() { return (int)fireBuf.size(); }
API const int* sn_sim_queue() { return queueBuf.data(); }            // 4 ints each: id kind priority waited
API int sn_sim_queue_count() { return (int)queueBuf.size() / 4; }
API const double* sn_sim_metrics() { return metricsBuf.data(); }     // 13 numbers, see snapshot()
API const int* sn_sim_beds() { return bedsBuf.data(); }
