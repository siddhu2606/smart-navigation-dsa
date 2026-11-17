// grid.h - the map as a graph.
//
// Every cell of the map is a vertex. A cell is joined to the cell above, below, left and right of it
// (4 neighbours). Stepping ONTO a cell costs cost[cell]; a cost of 0 means the cell is blocked
// (wall, deep water, fire, debris...).
#pragma once
#include <vector>
#include <cstdlib>
using namespace std;

struct Grid {
    int W = 0, H = 0;
    vector<int> cost;                       // cost[i] = price of stepping onto cell i (0 = blocked)

    Grid() {}
    Grid(int w, int h, const vector<int>& c) : W(w), H(h), cost(c) {}

    int size() const { return W * H; }
    bool open(int i) const { return cost[i] > 0; }

    // Cells we can step to from cell i (inside the map and not blocked).
    vector<int> neighbors(int i) const {
        vector<int> out;
        int x = i % W, y = i / W;
        if (y > 0     && cost[i - W] > 0) out.push_back(i - W);   // up
        if (x < W - 1 && cost[i + 1] > 0) out.push_back(i + 1);   // right
        if (y < H - 1 && cost[i + W] > 0) out.push_back(i + W);   // down
        if (x > 0     && cost[i - 1] > 0) out.push_back(i - 1);   // left
        return out;
    }

    // Manhattan distance between two cells (the A* heuristic: every step costs at least 1).
    int manhattan(int a, int b) const {
        return abs(a % W - b % W) + abs(a / W - b / W);
    }
};
