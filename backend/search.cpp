// search.cpp - helper shared by all four algorithms.
#include <algorithm>
#include "search.h"

// parent[v] = the cell we came from when we first reached v. Follow it from the goal back to the start.
void buildPath(const Grid& g, const vector<int>& parent, int start, int goal, SearchResult& r) {
    r.path.clear();
    r.cost = 0;
    r.found = false;
    if (goal < 0 || goal >= g.size() || parent[goal] == -1) return;     // goal was never reached

    for (int v = goal; v != start; v = parent[v]) {
        r.path.push_back(v);
        r.cost += g.cost[v];
    }
    r.path.push_back(start);
    reverse(r.path.begin(), r.path.end());
    r.found = true;
}
