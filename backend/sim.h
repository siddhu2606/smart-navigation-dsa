// sim.h - Disaster simulation: a fire starts in one building and the people near it must be evacuated.
//
// Scarce resources are SHARED between everybody who needs them:
//     ambulances  (only a few, they carry the people who cannot walk)
//     shelter beds (limited)
//     medics      (treat people after they arrive)
// Each resource has a waiting line implemented with std::priority_queue. The most vulnerable person
// (injured, wheelchair, pregnant, elderly, child...) is served first. Setting usePriority = false turns
// the same line into a plain first-come-first-served queue, so the two policies can be compared.
#pragma once
#include <vector>
#include <queue>
#include <random>
#include "grid.h"
using namespace std;

enum Kind { ADULT, CHILD, ELDERLY, PREGNANT, WHEELCHAIR, VISUAL, INJURED, KIND_COUNT };
enum State { UNAWARE, ALERTED, WAITING_RIDE, WALKING, RIDING, SAFE, LOST, STRANDED };

struct SimParams {
    int people = 150;
    int ambulances = 4;
    int medics = 2;
    int bedsPerShelter = 40;
    int alertRadius = 25;                  // people within this many cells of a fire are told to leave
    int fireEvery = 6;                     // the fire tries to spread once every this many ticks
    int seed = 1;
    bool usePriority = true;               // false = first come, first served
    int basePriority[KIND_COUNT] = {10, 60, 70, 80, 90, 50, 100};   // by Kind
    int femaleBonus = 0;                   // extra points for women (0 = gender is ignored)
    int aging = 1;                         // extra points per tick spent waiting (so nobody waits forever)
};

struct Person {
    int id = 0, kind = ADULT;
    bool female = false;
    int cell = 0;
    int state = UNAWARE;
    int key = 0;                           // priority key, see Simulation::makeKey
    int alertTick = -1, pickupTick = -1, safeTick = -1;
    int shelter = -1;                      // index of the shelter that holds this person's bed
    int danger = 0;                        // ticks spent next to fire
    vector<int> path;                      // route to the shelter while walking
    int step = 0;
    int treatStart = -1, treatEnd = -1;
    bool treated = false;
};

struct Ambulance {
    int cell = 0;
    int state = 0;                         // 0 idle, 1 driving to a person, 2 driving to the shelter
    int person = -1;
    vector<int> path;
    int step = 0;
};

// One place in a waiting line. priority_queue gives out the LARGEST element first (see operator<).
struct Entry {
    int key;                               // higher = more urgent
    int tick;                              // when the person joined the line
    int id;
    bool operator<(const Entry& o) const {
        if (key != o.key) return key < o.key;      // higher key first
        if (tick != o.tick) return tick > o.tick;  // then whoever waited longer
        return id > o.id;
    }
};

struct SimMetrics {
    int people = 0, alerted = 0, safe = 0, lost = 0, stranded = 0, treated = 0;
    int vulnerable = 0, vulnerableSafe = 0;
    double avgRideWait = 0;                // alert -> picked up by an ambulance
    double avgUrgentWait = 0;              // same, only injured, wheelchair and pregnant people
    double avgTimeToSafety = 0;            // alert -> inside the shelter
    double avgTreatWait = 0;               // arrived at shelter -> medic starts
    int ticks = 0;
};

class Simulation {
public:
    // terrain: terrain code per cell (see config.js). cost: step cost per cell.
    // doors: where people live. shelters: shelter door cells. depot: where ambulances start.
    Simulation(const vector<int>& terrain, const vector<int>& cost, int W, int H,
               const vector<int>& doors, const vector<int>& shelters, int depot,
               int fireCell, const SimParams& params);

    void step();                           // advance one tick
    bool done() const;
    void runToEnd(int maxTicks = 3000);
    SimMetrics metrics() const;

    // read-only state for the front end
    int tick = 0;
    vector<Person> people;
    vector<Ambulance> ambulances;
    vector<int> newFire;                   // cells that caught fire during the last step
    vector<int> bedsUsed;                  // per shelter
    vector<Entry> queueTop(int n) const;   // the next n people the ambulance line will serve
    int effectivePriority(const Person& p) const { return p.key + params.aging * tick; }

private:
    SimParams params;
    int W, H;
    vector<int> terrain;
    Grid grid;                             // walking map (burning cells become blocked)
    Grid roadGrid;                         // ambulances: roads, bridges, plazas and footpaths only
    vector<char> burning;
    vector<int> frontier;                  // burning cells that may still spread
    vector<int> shelters;
    mt19937 rng;

    priority_queue<Entry> alertQ;          // just alerted, waiting for a bed
    priority_queue<Entry> pickupQ;         // waiting for an ambulance
    priority_queue<Entry> treatQ;          // in the shelter, waiting for a medic
    vector<int> inTreatment;

    int makeKey(const Person& p) const;
    void ignite(int cell);
    void spreadFire();
    void alertPeopleNear(int cell);
    void allocate();
    void dispatchAmbulances();
    void moveAmbulances();
    void driveOneCell(Ambulance& a);
    void moveWalkers();
    void checkDanger();
    void runMedics();
    void arrived(Person& p);
    void release(Person& p);
    bool needsRide(int kind) const;
    bool needsTreatment(int kind) const;
};
