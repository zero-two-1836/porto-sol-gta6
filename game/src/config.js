// Porto Sol — Streets of the Sun
// config.js — tuning constants and the city's palette. One job: numbers, not logic.

// The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate.
export const STEP = 1 / 60;

// World size in world units (1 unit ~ 1 pixel at zoom 1).
export const WORLD_W = 4800;
export const WORLD_H = 3600;
export const ROAD_W = 72; // full width of a road, centre to centre of sidewalks
export const ROAD_HALF = ROAD_W / 2;

// Road centrelines: vertical streets every 400 units, horizontal every 400.
export const ROADS_V = [240, 640, 1040, 1440, 1840, 2240, 2640, 3040, 3440, 3840, 4240, 4640];
export const ROADS_H = [240, 640, 1040, 1440, 1840, 2240, 2640, 3040, 3440];

// Water (Old Port docks) along the east edge, beach sand along the south edge.
export const WATER_X = 4520;
export const BEACH_Y = 3300;

// Districts, in draw order of their ground tint.
export const DISTRICTS = {
  downtown: { name: 'Downtown', ground: '#3d3a44', tint: '#4a4552' },
  barrio: { name: 'El Barrio', ground: '#4a4038', tint: '#57493c' },
  port: { name: 'Old Port', ground: '#3a4148', tint: '#46505a' },
  hills: { name: 'North Hills', ground: '#3f4a38', tint: '#4a5844' },
  marina: { name: 'Marina Beach', ground: '#4a4238', tint: '#574c40' },
};

// Building body colours per district (drawn procedurally, no images).
export const BUILDING_COLORS = {
  downtown: ['#4a5a7a', '#5a6a8a', '#3a4a6a', '#6a5a7a', '#46586e'],
  barrio: ['#b0703a', '#c08050', '#a06040', '#c09060', '#906040'],
  port: ['#7a6a5a', '#6a5a4a', '#8a7a68', '#5a4a3e', '#75655a'],
  hills: ['#8a7a6a', '#7a6a5a', '#9a8a7a', '#6a7a5a', '#a08a6a'],
  marina: ['#e0c090', '#d0a080', '#c8b090', '#d8c0a0', '#b09880'],
};

// Player / car / police tuning.
export const TUNE = {
  walkSpeed: 230,
  sprintSpeed: 350,
  punchRange: 56,
  punchCooldown: 0.45,
  shootCooldown: 0.28,
  shootRange: 620,
  carAccel: 460,
  carReverseAccel: 300,
  carMaxSpeed: 620, // fastest street car, world units / second
  carBrake: 700,
  carDrag: 0.55,
  handbrakeGrip: 0.35,
  trafficSpeed: 170,
  trafficMax: 24,
  pedMax: 18,
  copFootSpeed: 265,
  copCarSpeed: 600, // a touch slower than the player's top speed, so a clean getaway is possible
  bustTime: 2.2, // seconds a cop must hold you to bust you
  calmTime: 6, // seconds without crime before heat starts to fall
  heatFallEvery: 5, // seconds per star lost while calm
  saveKey: 'porto-sol-save-v1',
};

// Mission anchor points — all on road intersections so markers sit on streets.
export const PLACES = {
  maraOffice: { x: 2240, y: 1440, label: "Mara's office — Downtown" },
  marina: { x: 1440, y: 3040, label: 'Marina Beach' },
  barrio: { x: 640, y: 2640, label: 'El Barrio' },
  port: { x: 4240, y: 1440, label: 'Old Port docks' },
  hills: { x: 1440, y: 640, label: 'North Hills safehouse' },
  beach: { x: 2640, y: 3040, label: 'Marina boardwalk' },
  vault: { x: 2640, y: 1440, label: 'Downtown vault' },
  crew: { x: 4240, y: 2640, label: 'Old Port crew' },
  raceA: { x: 2240, y: 640, label: 'Race gate 1' },
  raceB: { x: 4240, y: 640, label: 'Race gate 2' },
  raceC: { x: 4240, y: 2640, label: 'Race gate 3' },
  raceD: { x: 640, y: 2640, label: 'Race gate 4' },
};

// Street-car paint jobs for traffic and stealable cars.
export const CAR_COLORS = [
  '#c0392b', '#2980b9', '#f39c12', '#27ae60', '#8e44ad',
  '#e0e0e0', '#2c3e50', '#e67e22', '#16a085', '#d35400',
  '#7f8c8d', '#b03a5b', '#3a7bd5', '#c9a227',
];
export const POLICE_COLOR = '#1c2733';
export const POLICE_LIGHT = '#e74c3c';

// Cash rewards per mission.
export const MISSION_REWARDS = [500, 900, 1500, 2500, 5000];
