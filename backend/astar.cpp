// astar.cpp - A* search
//
// Dijkstra plus a guess of the distance still to go. The priority queue is ordered by
//     f = g + h      g = cost so far,   h = Manhattan distance to the goal
// h never over-estimates (every step costs at least 1), so A* is still OPTIMAL, but it is pulled
// towards the goal and expands far fewer cells than Dijkstra. Time O((V + E) log V) worst case.
#include <queue>
#include <climits>
#include <tuple>
#include "search.h"

SearchResult astar(const Grid& g, int start, int goal) {
    SearchResult r;
    vector<int> dist(g.size(), INT_MAX);      // g: cost so far
    vector<int> parent(g.size(), -1);
    vector<bool> done(g.size(), false);

    // min-heap of (f, h, cell): smallest f first, and on a tie the cell closer to the goal
    typedef tuple<int, int, int> Item;
    priority_queue<Item, vector<Item>, greater<Item>> pq;

    dist[start] = 0;
    parent[start] = start;
    int h0 = g.manhattan(start, goal);
    pq.push(make_tuple(h0, h0, start));

    while (!pq.empty()) {
        int u = get<2>(pq.top());
        pq.pop();
        if (done[u]) continue;
        done[u] = true;
        r.order.push_back(u);
        if (u == goal) break;

        for (int v : g.neighbors(u)) {
            int nd = dist[u] + g.cost[v];
            if (nd < dist[v]) {
                dist[v] = nd;
                parent[v] = u;
                int h = g.manhattan(v, goal);
                pq.push(make_tuple(nd + h, h, v));
            }
        }
    }

    buildPath(g, parent, start, goal, r);
    return r;
}
