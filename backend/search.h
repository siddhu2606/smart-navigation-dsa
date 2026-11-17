// search.h - the four path-finding algorithms.
//
// Every algorithm returns the same thing, so the browser can replay them side by side:
//   order : the cells in the order the algorithm expanded (visited) them
//   path  : the route it found, start -> goal (empty if the goal can't be reached)
//   cost  : the total price of that route (sum of cost[] of every cell entered)
#pragma once
#include <vector>
#include "grid.h"
using namespace std;

struct SearchResult {
    vector<int> order;
    vector<int> path;
    int cost = 0;
    bool found = false;
};

SearchResult bfs(const Grid& g, int start, int goal);        // bfs.cpp       queue
SearchResult dfs(const Grid& g, int start, int goal);        // dfs.cpp       stack
SearchResult dijkstra(const Grid& g, int start, int goal);   // dijkstra.cpp  priority_queue on cost so far
SearchResult astar(const Grid& g, int start, int goal);      // astar.cpp     priority_queue on cost so far + estimate

// Shared helper (search.cpp): walks the parent[] links back from the goal and fills path and cost.
void buildPath(const Grid& g, const vector<int>& parent, int start, int goal, SearchResult& r);
