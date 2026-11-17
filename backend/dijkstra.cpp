// dijkstra.cpp - Dijkstra's algorithm
//
// Like BFS, but the queue is a PRIORITY QUEUE ordered by "cost so far" (dist), so the cheapest cell
// is always expanded next. With non-negative costs the first time a cell is expanded its dist is final,
// so the path found is the CHEAPEST one. Time O((V + E) log V).
#include <queue>
#include <climits>
#include "search.h"

SearchResult dijkstra(const Grid& g, int start, int goal) {
    SearchResult r;
    vector<int> dist(g.size(), INT_MAX);
    vector<int> parent(g.size(), -1);
    vector<bool> done(g.size(), false);

    // min-heap of (dist, cell); the smallest dist comes out first
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq;

    dist[start] = 0;
    parent[start] = start;
    pq.push({0, start});

    while (!pq.empty()) {
        int u = pq.top().second;
        pq.pop();
        if (done[u]) continue;                // stale entry: u was already settled with a cheaper dist
        done[u] = true;
        r.order.push_back(u);
        if (u == goal) break;

        for (int v : g.neighbors(u)) {
            int nd = dist[u] + g.cost[v];     // cost of reaching v through u
            if (nd < dist[v]) {
                dist[v] = nd;
                parent[v] = u;
                pq.push({nd, v});
            }
        }
    }

    buildPath(g, parent, start, goal, r);
    return r;
}
