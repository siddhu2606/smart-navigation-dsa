// main.cpp - console demo of everything the web page does.
//   Part 1: BFS, DFS, Dijkstra and A* on a small map drawn with characters.
//   Part 2: the disaster simulation, with a priority queue and with a plain queue.
//
// Build and run:   g++ -std=c++17 -O2 backend/*.cpp -o demo   (but not tests.cpp, see build.sh)
#include <iostream>
#include <iomanip>
#include <string>
#include "search.h"
#include "sim.h"
#include "toy_city.h"
using namespace std;

void searchDemo() {
    // '#' wall   '.' road (cost 1)   ',' grass (cost 6)   'f' forest (cost 10)   S start   G goal
    vector<string> art = {
        "S.......#,,,,,,,,,,,",
        ".######.#,,,,,,,,,,,",
        ".#....#.#,,fffff,,,,",
        ".#.##.#.#,,fffff,,,,",
        ".#.#..#.#,,,,,,,,,,,",
        ".#.#.##.,,,,,,,,,,,G",
        ".#.#....##.#########",
        ".#.######..........."
        ,"................#..."
    };
    int H = art.size(), W = art[0].size(), start = 0, goal = 0;
    vector<int> cost(W * H);
    for (int y = 0; y < H; y++)
        for (int x = 0; x < W; x++) {
            char ch = art[y][x];
            cost[y * W + x] = ch == '#' ? 0 : ch == ',' ? 6 : ch == 'f' ? 10 : 1;
            if (ch == 'S') start = y * W + x;
            if (ch == 'G') goal = y * W + x;
        }
    Grid g(W, H, cost);

    struct Algo { const char* name; SearchResult (*run)(const Grid&, int, int); };
    Algo algos[] = {{"BFS", bfs}, {"DFS", dfs}, {"Dijkstra", dijkstra}, {"A*", astar}};

    cout << "=== Path finding on a " << W << "x" << H << " map ===\n";
    for (const Algo& a : algos) {
        SearchResult r = a.run(g, start, goal);
        cout << left << setw(9) << a.name << " expanded " << setw(4) << r.order.size()
             << " cells, path length " << setw(3) << r.path.size() << " cost " << r.cost << "\n";
        vector<string> pic = art;
        for (int c : r.path) if (pic[c / W][c % W] != 'S' && pic[c / W][c % W] != 'G') pic[c / W][c % W] = '*';
        for (const string& row : pic) cout << "   " << row << "\n";
    }
}

void simDemo() {
    City c = makeToyCity(8, 8);
    cout << "\n=== Disaster simulation: " << c.W << "x" << c.H << " city, fire in one house ===\n";
    cout << left << setw(22) << "policy" << setw(8) << "alerted" << setw(8) << "safe" << setw(8) << "lost"
         << setw(10) << "stranded" << setw(16) << "vulnerable safe" << "ride wait (ticks)\n";
    for (int usePriority = 1; usePriority >= 0; usePriority--) {
        SimParams p;
        p.people = 400;
        p.ambulances = 2;
        p.alertRadius = 30;
        p.bedsPerShelter = 100;
        p.usePriority = usePriority;
        Simulation sim(c.terrain, c.cost, c.W, c.H, c.doors, c.shelters, c.depot, c.fireCell, p);
        sim.runToEnd();
        SimMetrics m = sim.metrics();
        cout << left << setw(22) << (usePriority ? "priority queue" : "first come first served")
             << setw(8) << m.alerted << setw(8) << m.safe << setw(8) << m.lost << setw(10) << m.stranded
             << setw(16) << (to_string(m.vulnerableSafe) + "/" + to_string(m.vulnerable))
             << fixed << setprecision(1) << m.avgRideWait << "\n";
    }
}

int main() {
    searchDemo();
    simDemo();
    return 0;
}
