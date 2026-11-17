// tests.cpp - plain C++ tests, no framework. Build and run with  backend/build.sh test
#include <iostream>
#include <random>
#include <set>
#include "../search.h"
#include "../sim.h"
#include "../toy_city.h"
using namespace std;

int failures = 0, checks = 0;
#define CHECK(cond, msg) do { checks++; if (!(cond)) { failures++; cout << "FAIL: " << msg << "  (" #cond ")\n"; } } while (0)

// a random map: costs 1..9 with about 25% walls
Grid randomGrid(int W, int H, mt19937& rng) {
    vector<int> cost(W * H);
    for (int& c : cost) c = (rng() % 4 == 0) ? 0 : 1 + rng() % 9;
    return Grid(W, H, cost);
}

// a path is legal if it starts and ends right, only steps between neighbours and never enters a wall
bool legalPath(const Grid& g, const SearchResult& r, int s, int t) {
    if (r.path.empty() || r.path.front() != s || r.path.back() != t) return false;
    int cost = 0;
    for (size_t i = 1; i < r.path.size(); i++) {
        int a = r.path[i - 1], b = r.path[i];
        if (g.manhattan(a, b) != 1 || !g.open(b)) return false;
        cost += g.cost[b];
    }
    return cost == r.cost;
}

void testSearches() {
    mt19937 rng(7);
    int compared = 0;
    for (int round = 0; round < 300; round++) {
        Grid g = randomGrid(12 + rng() % 10, 12 + rng() % 10, rng);
        int s = rng() % g.size(), t = rng() % g.size();
        g.cost[s] = g.cost[t] = 1;

        SearchResult b = bfs(g, s, t), d = dfs(g, s, t), dj = dijkstra(g, s, t), a = astar(g, s, t);
        // all four agree on whether the goal can be reached
        CHECK(b.found == dj.found && d.found == dj.found && a.found == dj.found, "reachability agrees");
        if (!dj.found) continue;
        compared++;
        CHECK(legalPath(g, b, s, t) && legalPath(g, d, s, t) && legalPath(g, dj, s, t) && legalPath(g, a, s, t), "paths are legal");
        CHECK(a.cost == dj.cost, "A* is optimal, same cost as Dijkstra");
        CHECK(dj.cost <= b.cost && dj.cost <= d.cost, "Dijkstra is never worse than BFS or DFS");
        CHECK(b.path.size() <= dj.path.size() && b.path.size() <= d.path.size() && b.path.size() <= a.path.size(),
              "BFS path has the fewest steps");
        // every cell is expanded at most once and the goal is last
        set<int> seen(a.order.begin(), a.order.end());
        CHECK(seen.size() == a.order.size() && a.order.back() == t, "A* order has no repeats and ends at the goal");
    }
    CHECK(compared > 100, "enough reachable test maps");

    // start == goal, and a goal walled in
    Grid g(3, 1, vector<int>{1, 1, 1});
    CHECK(bfs(g, 1, 1).found && bfs(g, 1, 1).path.size() == 1, "start equals goal");
    Grid wall(3, 1, vector<int>{1, 0, 1});
    CHECK(!bfs(wall, 0, 2).found && !dfs(wall, 0, 2).found && !dijkstra(wall, 0, 2).found && !astar(wall, 0, 2).found,
          "blocked goal is not found");
}

// Every person ends in a final state, beds are never over-booked, counts add up.
void testSimInvariants() {
    City c = makeToyCity(6, 6);
    for (int seed = 1; seed <= 6; seed++) {
        for (int pr = 0; pr < 2; pr++) {
            SimParams p;
            p.people = 200; p.seed = seed; p.usePriority = pr; p.bedsPerShelter = 30; p.alertRadius = 25;
            Simulation sim(c.terrain, c.cost, c.W, c.H, c.doors, c.shelters, c.depot, c.fireCell, p);
            sim.runToEnd();
            SimMetrics m = sim.metrics();
            CHECK(sim.done(), "simulation finishes");
            CHECK(m.safe + m.lost + m.stranded + (m.people - m.alerted) == m.people, "every person is accounted for");
            for (int used : sim.bedsUsed) CHECK(used >= 0 && used <= p.bedsPerShelter, "beds never over-booked");
            int beds = 0;
            for (int used : sim.bedsUsed) beds += used;
            CHECK(beds == m.safe, "bed count equals the people who arrived");
            CHECK(m.safe + m.stranded + m.lost > 0 && m.alerted > 0, "fire alerted somebody");
        }
    }
}

// With scarce ambulances the priority queue picks up the most urgent people (injured and disabled) sooner than a plain first-come-first-served queue does.
void testPriorityHelps() {
    City c = makeToyCity(8, 8);
    double wait[2] = {0, 0};
    for (int seed = 1; seed <= 8; seed++) {
        for (int pr = 0; pr < 2; pr++) {
            SimParams p;
            p.people = 200; p.ambulances = 3; p.alertRadius = 30; p.fireEvery = 4; p.seed = seed; p.usePriority = pr;
            Simulation sim(c.terrain, c.cost, c.W, c.H, c.doors, c.shelters, c.depot, c.fireCell, p);
            sim.runToEnd();
            wait[pr] += sim.metrics().avgUrgentWait / 8;
        }
    }
    cout << "average wait of urgent people: priority " << wait[1] << " ticks, first come first served " << wait[0] << " ticks\n";
    CHECK(wait[1] < wait[0], "priority queue picks up urgent people sooner");
}

// The queue itself: highest key first, ties go to whoever waited longer.
void testEntryOrder() {
    priority_queue<Entry> q;
    q.push({10, 5, 1});
    q.push({90, 7, 2});
    q.push({90, 3, 3});
    q.push({50, 1, 4});
    CHECK(q.top().id == 3, "same key: the one who waited longer first");  q.pop();
    CHECK(q.top().id == 2, "then the other 90");                          q.pop();
    CHECK(q.top().id == 4, "then 50");                                    q.pop();
    CHECK(q.top().id == 1, "lowest last");
}

int main() {
    testSearches();
    testEntryOrder();
    testSimInvariants();
    testPriorityHelps();
    cout << checks << " checks, " << failures << " failed\n";
    return failures ? 1 : 0;
}
