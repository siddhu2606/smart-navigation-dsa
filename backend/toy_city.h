// toy_city.h - a small hand-built city used by the console demo (main.cpp) and the tests.
// (The browser generates much nicer maps in JavaScript; this one just needs roads, houses and shelters.)
#pragma once
#include <vector>
using namespace std;

// terrain codes, the same numbers as web/js/config.js
const int T_GRASS = 0, T_ROAD = 1, T_BUILDING = 8, T_PATH = 14;
// step cost for each terrain code (0 = blocked)
const int TERRAIN_COST[15] = {6, 1, 1, 2, 10, 6, 14, 0, 0, 8, 0, 5, 4, 0, 2};

struct City {
    int W = 0, H = 0;
    vector<int> terrain, cost;
    vector<int> doors;        // a footpath cell in front of every house
    vector<int> shelters;     // doors of the shelter buildings
    int depot = 0;            // where the ambulances wait
    int fireCell = 0;         // a cell of the building that catches fire
};

// Blocks of 12 x 12 cells: a 2-wide road on the top and left, two rows of houses with footpaths.
inline City makeToyCity(int blocksX, int blocksY) {
    City c;
    c.W = blocksX * 12 + 2;
    c.H = blocksY * 12 + 2;
    c.terrain.assign(c.W * c.H, T_GRASS);
    auto at = [&](int x, int y) -> int& { return c.terrain[y * c.W + x]; };

    for (int y = 0; y < c.H; y++)
        for (int x = 0; x < c.W; x++)
            if (x % 12 < 2 || y % 12 < 2) at(x, y) = T_ROAD;

    for (int by = 0; by < blocksY; by++) {
        for (int bx = 0; bx < blocksX; bx++) {
            int x0 = bx * 12 + 2, y0 = by * 12 + 2;
            for (int hx = 0; hx < 2; hx++) {
                int x = x0 + 1 + hx * 4;                       // house is 3 wide, 3 high
                for (int y = y0 + 4; y < y0 + 7; y++)
                    for (int k = 0; k < 3; k++) at(x + k, y) = T_BUILDING;
                for (int y = y0 + 7; y < y0 + 10; y++) at(x + 1, y) = T_PATH;   // footpath to the road
                c.doors.push_back((y0 + 7) * c.W + x + 1);
            }
        }
    }
    c.cost.resize(c.terrain.size());
    for (size_t i = 0; i < c.terrain.size(); i++) c.cost[i] = TERRAIN_COST[c.terrain[i]];

    c.depot = 0 * c.W + 0;                                     // top-left road corner
    c.shelters.push_back(c.doors.front());
    c.shelters.push_back(c.doors.back());
    int mid = (int)c.doors.size() / 2;
    c.fireCell = c.doors[mid] - c.W;                           // the house wall above that door
    return c;
}
