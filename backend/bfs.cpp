// bfs.cpp - Breadth-First Search
//
// Uses a plain FIFO queue, so it explores in rings: all cells 1 step away, then 2 steps, ...
// It ignores the cell costs, so it finds the path with the FEWEST STEPS, not the cheapest one.
// Time O(V + E).
#include <queue>
#include "search.h"

SearchResult bfs(const Grid& g, int start, int goal) {
    SearchResult r;
    vector<int> parent(g.size(), -1);
    vector<bool> seen(g.size(), false);
    queue<int> q;

    q.push(start);
    seen[start] = true;
    parent[start] = start;

    while (!q.empty()) {
        int u = q.front();
        q.pop();
        r.order.push_back(u);                 // u is expanded now
        if (u == goal) break;

        for (int v : g.neighbors(u)) {
            if (!seen[v]) {
                seen[v] = true;
                parent[v] = u;
                q.push(v);
            }
        }
    }

    buildPath(g, parent, start, goal, r);
    return r;
}
