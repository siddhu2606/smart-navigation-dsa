// sim.cpp - Disaster simulation (see sim.h).
//
// One call of step() is one "tick". Everything moves at most one cell per tick:
//   ambulances 2 cells per tick, walkers 1 cell every 3rd tick.
#include <algorithm>
#include "sim.h"
#include "search.h"

// Terrain codes, the same numbers as web/js/config.js
enum Terrain { GRASS = 0, ROAD = 1, BRIDGE = 2, PLAZA = 3, FOREST = 4, SAND = 5, SHALLOW = 6, DEEP = 7,
               BUILDING = 8, RUBBLE = 9, FIRE = 10, SMOKE = 11, BURNT = 12, DEBRIS = 13, PATH = 14 };

// Chance (percent) that fire jumps into a neighbouring cell of this terrain each time it tries.
static int spreadChance(int terrain) {
    switch (terrain) {
        case GRASS: return 35;
        case FOREST: return 50;
        case BUILDING: return 30;
        case SAND: return 8;
        default: return 0;               // roads, footpaths, water... do not burn
    }
}

static bool route(const Grid& g, int from, int to, vector<int>& path) {
    SearchResult r = astar(g, from, to);
    path = r.path;
    return r.found;
}

Simulation::Simulation(const vector<int>& terr, const vector<int>& cost, int w, int h,
                       const vector<int>& doors, const vector<int>& shelterCells, int depot,
                       int fireCell, const SimParams& p)
    : params(p), W(w), H(h), terrain(terr), grid(w, h, cost), shelters(shelterCells), rng(p.seed) {

    // ambulances may only drive on roads, bridges, plazas and footpaths
    vector<int> roadCost(W * H, 0);
    for (int i = 0; i < W * H; i++)
        if (terr[i] == ROAD || terr[i] == BRIDGE || terr[i] == PLAZA || terr[i] == PATH) roadCost[i] = cost[i];
    roadGrid = Grid(W, H, roadCost);

    burning.assign(W * H, 0);
    bedsUsed.assign(shelters.size(), 0);

    // people live behind random doors; the kind is drawn from a fixed mix
    discrete_distribution<int> mix({55, 20, 12, 13});   // ADULT, DEPENDENT, DISABLED, INJURED
    for (int i = 0; i < params.people && !doors.empty(); i++) {
        Person q;
        q.id = i;
        q.kind = mix(rng);
        q.female = (rng() % 2 == 0);
        q.cell = doors[rng() % doors.size()];
        people.push_back(q);
    }

    for (int i = 0; i < params.ambulances; i++) {
        Ambulance a;
        a.cell = depot;
        ambulances.push_back(a);
    }

    fireOrigin = fireCell;
    ignite(fireCell);                    // the fire starts in ONE building
}

bool Simulation::needsRide(int kind) const {
    return kind != ADULT;
}
bool Simulation::needsTreatment(int kind) const {
    return kind == DEPENDENT || kind == INJURED;
}

// Priority key stored in the queues.
//   priority policy : base score of the kind (+ bonus for women) - aging * (tick the person was alerted)
//   first come first served : earlier alert = larger key
// Aging trick: a person's real priority is  base + aging * (now - alertTick).  Every person gains
// the same amount per tick, so the ORDER never changes with time; storing  base - aging * alertTick
// is enough and the priority_queue never has to be re-sorted.
int Simulation::makeKey(const Person& p) const {
    if (!params.usePriority) return -p.alertTick;
    int key = params.basePriority[p.kind] - params.aging * p.alertTick;
    if (p.female) key += params.femaleBonus;
    return key;
}

// The fire is one building's fire, not a city-wide one: it stays within fireRadius cells of where it started.
bool Simulation::inFireRange(int cell) const {
    int dx = cell % W - fireOrigin % W, dy = cell / W - fireOrigin / W;
    return dx * dx + dy * dy <= params.fireRadius * params.fireRadius;
}

void Simulation::ignite(int cell) {
    burning[cell] = 1;
    terrain[cell] = FIRE;
    grid.cost[cell] = 0;
    frontier.push_back(cell);
    newFire.push_back(cell);
    alertPeopleNear(cell);
}

void Simulation::alertPeopleNear(int cell) {
    int fx = cell % W, fy = cell / W, r2 = params.alertRadius * params.alertRadius;
    for (Person& p : people) {
        if (p.state != UNAWARE) continue;
        int dx = p.cell % W - fx, dy = p.cell / W - fy;
        if (dx * dx + dy * dy > r2) continue;
        p.state = ALERTED;
        p.alertTick = tick;
        p.key = makeKey(p);
        alertQ.push({p.key, tick, p.id});
    }
}

void Simulation::spreadFire() {
    static const int dx[4] = {0, 1, 0, -1}, dy[4] = {-1, 0, 1, 0};
    vector<int> keep, born;
    for (int c : frontier) {
        int x = c % W, y = c / W;
        bool more = false;               // does this cell still have something left to burn next to it?
        for (int d = 0; d < 4; d++) {
            int nx = x + dx[d], ny = y + dy[d];
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            int v = ny * W + nx;
            int chance = (burning[v] || !inFireRange(v)) ? 0 : spreadChance(terrain[v]);
            if (chance == 0) continue;
            more = true;
            if ((int)(rng() % 100) < chance) born.push_back(v);
        }
        if (rng() % 100 < 3) {           // a flying ember lands up to 4 cells away (lets fire cross a road)
            int ex = x + (int)(rng() % 9) - 4, ey = y + (int)(rng() % 9) - 4;
            if (ex >= 0 && ey >= 0 && ex < W && ey < H && !burning[ey * W + ex] && inFireRange(ey * W + ex) && spreadChance(terrain[ey * W + ex]) > 0)
                born.push_back(ey * W + ex);
        }
        if (more) keep.push_back(c);
    }
    frontier = keep;
    for (int v : born) if (!burning[v]) ignite(v);
}

void Simulation::release(Person& p) {
    if (p.shelter >= 0) bedsUsed[p.shelter]--;
    p.shelter = -1;
}

// Give beds to the people who were just alerted, most urgent first.
void Simulation::allocate() {
    while (!alertQ.empty()) {
        Entry e = alertQ.top();
        alertQ.pop();
        Person& p = people[e.id];

        int best = -1;                   // nearest shelter that still has a free bed
        for (int s = 0; s < (int)shelters.size(); s++) {
            if (bedsUsed[s] >= params.bedsPerShelter) continue;
            if (best == -1 || grid.manhattan(p.cell, shelters[s]) < grid.manhattan(p.cell, shelters[best])) best = s;
        }
        if (best == -1) { p.state = STRANDED; continue; }   // every bed is taken
        bedsUsed[best]++;
        p.shelter = best;

        if (needsRide(p.kind)) {
            p.state = WAITING_RIDE;
            pickupQ.push(e);             // joins the ambulance line
        } else if (route(grid, p.cell, shelters[best], p.path)) {
            p.state = WALKING;
            p.step = 0;
        } else {
            release(p);
            p.state = STRANDED;
        }
    }
}

// Every idle ambulance takes the most urgent person from the ambulance line.
void Simulation::dispatchAmbulances() {
    for (Ambulance& a : ambulances) {
        if (a.state != 0) continue;
        while (!pickupQ.empty()) {
            Entry e = pickupQ.top();
            pickupQ.pop();
            Person& p = people[e.id];
            if (p.state != WAITING_RIDE) continue;            // burned or gave up meanwhile
            if (!route(roadGrid, a.cell, p.cell, a.path)) {
                release(p);
                p.state = STRANDED;                           // no road reaches this person
                continue;
            }
            a.state = 1;
            a.person = p.id;
            a.step = 0;
            break;
        }
    }
}

// Ambulances drive AMBULANCE_SPEED cells per tick (much faster than anyone walks).
static const int AMBULANCE_SPEED = 2;

void Simulation::moveAmbulances() {
    for (Ambulance& a : ambulances)
        for (int k = 0; k < AMBULANCE_SPEED && a.state != 0; k++) driveOneCell(a);
}

void Simulation::driveOneCell(Ambulance& a) {
    Person& p = people[a.person];
    if (p.state == LOST || p.state == STRANDED) { a.state = 0; a.person = -1; return; }

    int target = (a.state == 1) ? p.cell : shelters[p.shelter];
    if (a.step + 1 < (int)a.path.size()) {
        int next = a.path[a.step + 1];
        if (burning[next]) {                              // fire ahead: look for another road
            if (!route(roadGrid, a.cell, target, a.path)) {
                release(p);
                p.state = STRANDED;
                a.state = 0; a.person = -1;
            } else {
                a.step = 0;
            }
            return;
        }
        a.step++;
        a.cell = a.path[a.step];
        if (a.state == 2) p.cell = a.cell;                // the patient rides along
    }

    if (a.step + 1 >= (int)a.path.size()) {               // end of this leg
        if (a.state == 1) {                               // picked the person up
            p.state = RIDING;
            p.pickupTick = tick;
            if (route(roadGrid, a.cell, shelters[p.shelter], a.path)) {
                a.step = 0;
                a.state = 2;
            } else {
                release(p);
                p.state = STRANDED;
                a.state = 0; a.person = -1;
            }
        } else {                                          // delivered
            a.state = 0;
            a.person = -1;
            p.cell = a.cell;
            arrived(p);
        }
    }
}

void Simulation::moveWalkers() {
    for (Person& p : people) {
        if (p.state != WALKING) continue;
        int period = 3;                                           // one cell every 3rd tick
        if ((tick + p.id) % period != 0) continue;

        if (p.step + 1 < (int)p.path.size()) {
            int next = p.path[p.step + 1];
            if (burning[next]) {                              // fire ahead: re-plan with A*
                if (route(grid, p.cell, shelters[p.shelter], p.path)) {
                    p.step = 0;
                } else {
                    release(p);
                    p.state = STRANDED;
                }
                continue;
            }
            p.step++;
            p.cell = p.path[p.step];
        }
        if (p.step + 1 >= (int)p.path.size()) arrived(p);
    }
}

void Simulation::arrived(Person& p) {
    p.state = SAFE;
    p.safeTick = tick;
    if (needsTreatment(p.kind)) treatQ.push({p.key, tick, p.id});   // joins the medic line
}

// Anyone who stays next to a fire for 4 ticks is lost. People inside an ambulance are safe.
void Simulation::checkDanger() {
    static const int dx[5] = {0, 0, 1, 0, -1}, dy[5] = {0, -1, 0, 1, 0};
    for (Person& p : people) {
        if (p.state == SAFE || p.state == LOST || p.state == RIDING) continue;
        int x = p.cell % W, y = p.cell / W;
        bool near = false;
        for (int d = 0; d < 5; d++) {
            int nx = x + dx[d], ny = y + dy[d];
            if (nx >= 0 && ny >= 0 && nx < W && ny < H && burning[ny * W + nx]) near = true;
        }
        if (near) p.danger++; else if (p.danger > 0) p.danger--;
        if (p.danger >= 4) {
            release(p);
            p.state = LOST;
        }
    }
}

void Simulation::runMedics() {
    for (size_t i = 0; i < inTreatment.size();) {                // finish treatments
        Person& p = people[inTreatment[i]];
        if (p.treatEnd <= tick) {
            p.treated = true;
            inTreatment.erase(inTreatment.begin() + i);
        } else {
            i++;
        }
    }
    while ((int)inTreatment.size() < params.medics && !treatQ.empty()) {   // start new ones
        Entry e = treatQ.top();
        treatQ.pop();
        Person& p = people[e.id];
        p.treatStart = tick;
        p.treatEnd = tick + (p.kind == INJURED ? 20 : 10);
        inTreatment.push_back(p.id);
    }
}

void Simulation::step() {
    tick++;
    newFire.clear();
    if (tick % params.fireEvery == 0) spreadFire();
    allocate();
    dispatchAmbulances();
    moveAmbulances();
    moveWalkers();
    checkDanger();
    runMedics();
}

bool Simulation::done() const {
    if (!frontier.empty() || !treatQ.empty() || !inTreatment.empty() || !alertQ.empty()) return false;
    for (const Person& p : people)
        if (p.state == ALERTED || p.state == WAITING_RIDE || p.state == WALKING || p.state == RIDING) return false;
    return true;
}

void Simulation::runToEnd(int maxTicks) {
    while (!done() && tick < maxTicks) step();
}

vector<Entry> Simulation::queueTop(int n) const {
    priority_queue<Entry> copy = pickupQ;
    vector<Entry> out;
    while (!copy.empty() && (int)out.size() < n) {
        Entry e = copy.top();
        copy.pop();
        if (people[e.id].state == WAITING_RIDE) out.push_back(e);
    }
    return out;
}

SimMetrics Simulation::metrics() const {
    SimMetrics m;
    m.people = (int)people.size();
    m.ticks = tick;
    double rideSum = 0, safeSum = 0, treatSum = 0, urgentSum = 0;
    int rideN = 0, safeN = 0, treatN = 0, urgentN = 0;
    for (const Person& p : people) {
        if (p.alertTick >= 0) m.alerted++;
        bool vulnerable = p.alertTick >= 0 && p.kind != ADULT;
        if (vulnerable) m.vulnerable++;
        if (p.state == SAFE) {
            m.safe++;
            if (vulnerable) m.vulnerableSafe++;
            safeSum += p.safeTick - p.alertTick;
            safeN++;
        }
        if (p.state == LOST) m.lost++;
        if (p.state == STRANDED) m.stranded++;
        if (p.treated) m.treated++;
        if (p.pickupTick >= 0) {
            rideSum += p.pickupTick - p.alertTick; rideN++;
            if (p.kind == INJURED || p.kind == DISABLED) { urgentSum += p.pickupTick - p.alertTick; urgentN++; }
        }
        if (p.treatStart >= 0) { treatSum += p.treatStart - p.safeTick; treatN++; }
    }
    if (rideN) m.avgRideWait = rideSum / rideN;
    if (urgentN) m.avgUrgentWait = urgentSum / urgentN;
    if (safeN) m.avgTimeToSafety = safeSum / safeN;
    if (treatN) m.avgTreatWait = treatSum / treatN;
    return m;
}
