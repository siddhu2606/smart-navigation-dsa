// dfs.cpp - Depth-First Search
//
// Same idea as BFS but with a STACK: it keeps walking in one direction until it is stuck, then
// backtracks. It finds *a* path, usually a long winding one. Time O(V + E).
// (Written with an explicit stack instead of recursion, so a big map cannot overflow the call stack.)
#include <stack>
#include "search.h"

SearchResult dfs(const Grid& g, int start, int goal) {
    SearchResult r;
    vector<int> parent(g.size(), -1);
    vector<bool> visited(g.size(), false);
    stack<int> st;

    st.push(start);
    parent[start] = start;

    while (!st.empty()) {
        int u = st.top();
        st.pop();
        if (visited[u]) continue;             // a cell can be pushed more than once
        visited[u] = true;
        r.order.push_back(u);
        if (u == goal) break;

        for (int v : g.neighbors(u)) {
            if (!visited[v]) {
                parent[v] = u;                // remember who pushed it last
                st.push(v);
            }
        }
    }

    buildPath(g, parent, start, goal, r);
    return r;
}
