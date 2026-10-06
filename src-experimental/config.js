/* =====================================================================
   CONFIG: edit these first
   ===================================================================== */
export const FLOORS = 20;           // floors in Halcyon Tower (floor 1 = lobby)
export const IMPACT_FLOOR = 14;     // floor the plane hits
export const FLOOR_H = 3.2;         // world units (metres) per floor
export const TOWER_W = 14;          // tower width/depth in world units
export const TOWER_BASE = 0.25;     // tower stands on the plaza paving (top of the sidewalk blocks)

export const CITY_STYLE = 'realistic';   // 'realistic' = generated glass skyscrapers, 'lowpoly' = your KayKit models
export const CITY_DIR = '/models/city/'; // KayKit .gltf files go here

/* airliner (PHASE 0) */
export const PLANE_URL = '/models/plane/scene.gltf'; // Sketchfab CRJ-900 (scene.bin + textures/)
export const PLANE_LENGTH = 24;          // plane is scaled so its longest side = this
export const PLANE_MODEL_YAW = 0;        // nose already points +Z for the CRJ-900. Press P in the browser to cycle 0, PI/2, PI, -PI/2 (value is logged)
export const FLIGHT_SEC = 7;
export const PLANE_LIGHTS = { nav: 1.0, strobeHz: 0.91, beaconHz: 1.1, landing: 4000 }; // landing = spot intensity

/* wreck: the airliner stays embedded in the tower */
export const PLANE_EMBED_DEPTH = 0.4;    // fraction of PLANE_LENGTH that ends up inside the tower
export const WING_CUT = 0.11;            // wings break off this far (fraction of PLANE_LENGTH) from the centreline
export const WRECK_SCORCH = 0.72;        // 0 = clean paint, 1 = fully blackened after the fire

/* glass facade + X-ray */
export const GLASS_OPACITY = 0.3;       // normal facade opacity (0.25 to 0.35 looks right)
export const XRAY_OPACITY = 0.08;       // facade opacity in X-ray mode
export const XRAY_FADE = 4;             // fade speed (higher = faster)
export const MULLION_SPACING = 1.75;    // metres between vertical facade fins (one glass panel per bay per floor)

/* destruction */
export const HOLE_FLOORS = [IMPACT_FLOOR - 1, IMPACT_FLOOR, IMPACT_FLOOR + 1]; // gaping hole on the -X face
export const HOLE_BAYS = [4, 6, 4];      // glass bays removed on each hole floor (bottom, middle, top), centred
export const CRACK_FLOORS = 3;           // floors above/below the hole with cracked glass
export const CRACK_CHANCE = 0.55;        // chance a nearby panel cracks (others shatter or survive)
export const DAMAGED_FLOORS = [IMPACT_FLOOR - 2, ...HOLE_FLOORS, IMPACT_FLOOR + 2]; // lights dark / flickering / red
export const FIRE_SPREAD_FLOORS = [IMPACT_FLOOR + 2, IMPACT_FLOOR + 3]; // fire spreads to these floors while burning
export const BURNING_AFTER = 4;          // seconds after impact: 'impact' -> 'burning'
export const AFTERMATH_AFTER = 45;       // seconds after impact: 'burning' -> 'aftermath'
export const DAMAGED_CARS = 4;

/* neighbouring buildings with lit interiors */
export const INTERIOR_BUILDINGS = 5;    // 4 to 6 recommended
export const INTERIOR_LIT_FLOORS = 4;   // lit floors per interior building
export const WORKERS_PER_FLOOR = 7;     // silhouette workers per lit floor

/* people */
export const EXTRA_OCCUPANTS = 36;      // generated background occupants at Medium (scaled by quality), on top of the cast
export const WALK_SPEED = 1.35;         // m/s
export const RUN_SPEED = 3.0;           // m/s
export const SLOW_SPEED = 0.8;          // m/s, shaken people
export const LIMP_SPEED = 0.65;         // m/s, injured people (with a helper)
export const STAIR_SPEED = 3.2;         // m/s along the stair flights (brisk for the film; ~3.3 s per floor)
export const PLAZA_CENTER = { x: 26, z: 3.5 }; // standing area on the open plaza east of the tower
export const PLAZA_RADIUS = 5;
export const TRIAGE_CENTER = { x: 25, z: -5.5 }; // triage tarps (red / yellow / green / black)
export const SHOW_GORE = true;          // blood and wounds on injured/unconscious characters WITHOUT a head photo
// automatic status for generated occupants, by distance (floors) from the impact floor
export const CASUALTIES = {
  hole: { critical: 0.55, deceased: 0.45 },              // on the hole floors: everyone is unconscious
  near: { injured: 0.55, shaken: 0.45 },                 // within 3 floors
  far: { injured: 0.08, shaken: 0.32, ok: 0.6 },
};

/* emergency response */
export const RESPONSE_DELAY = 9;        // seconds after impact before vehicles arrive
export const FIRE_TRUCKS = 3;
export const AMBULANCES = 3;
export const POLICE_CARS = 2;
export const FIREFIGHTERS = 5;          // on the ground with hoses (+ one on the aerial ladder)
export const STRETCHER_TEAMS = 3;       // two paramedics each, carry unconscious people out
export const TRIAGE_MEDICS = 3;
export const HELICOPTER = true;

// Point any of these at your own audio file (e.g. '/sounds/boom.mp3'). null = built-in synth sound.
export const CUSTOM_AUDIO = {
  jet: null, boom: null, alarm: null, siren: null, step: null, ding: null,
  creak: null, debris: null, fire: null, helicopter: null, radio: null,
};

/* Your people. Occupant data model:
   { id, name, role, floor, position, heightScale, skinTone, hairStyle, hairColor, outfitTop, outfitBottom,
     accessory ('none' | 'glasses' | 'cap' | 'hardhat'), headPhoto (data URL or null),
     status ('ok' | 'shaken' | 'injured' | 'critical' | 'deceased'),
     injuryLook ('none' | 'arm_sling' | 'head_bandage' | 'limp'), line, pitch, audio }
   'critical' = unconscious, carried out on a stretcher. 'deceased' = lying motionless, covered at triage.
   Characters with a head photo are limited to ok / shaken / injured and never show blood or wounds.
   position: { x, z } in tower-local metres, or null to auto-assign a desk.
   hairStyle: 'short' | 'long' | 'bun' | 'ponytail' | 'buzz' | 'bald'.
   'audio' is optional and plays when that person starts moving. */
export const PEOPLE = [
  { name: 'Mara Okafor',   role: 'Architect',     floor: 12, pitch: 1.0, line: 'This way. Stay low, follow me.',
    skinTone: '#8d5a3b', hairStyle: 'bun', hairColor: '#1b1210', outfitTop: '#c8553d', outfitBottom: '#2b2d42', accessory: 'glasses', heightScale: 1.0,
    status: 'ok', injuryLook: 'none' },
  { name: 'Dev Lindqvist', role: 'Engineer',      floor: 11, pitch: 0.8, line: 'Hold on, I have got you.',
    skinTone: '#e8c4a8', hairStyle: 'short', hairColor: '#c9a46a', outfitTop: '#3d5a80', outfitBottom: '#22223b', accessory: 'none', heightScale: 1.06,
    status: 'ok', injuryLook: 'none' },
  { name: 'Tala Reyes',    role: 'Producer',      floor: 16, pitch: 1.3, line: 'Okay. One step at a time.',
    skinTone: '#c68f65', hairStyle: 'long', hairColor: '#2a1a12', outfitTop: '#f2cc8f', outfitBottom: '#3d405b', accessory: 'none', heightScale: 0.95,
    status: 'injured', injuryLook: 'head_bandage' },
  { name: 'Joon Park',     role: 'Security lead', floor: 3,  pitch: 0.8, line: 'Stairwell is clear. Keep moving.',
    skinTone: '#e0b48c', hairStyle: 'buzz', hairColor: '#111111', outfitTop: '#1d1d24', outfitBottom: '#1d1d24', accessory: 'cap', heightScale: 1.04,
    status: 'ok', injuryLook: 'none' },
  { name: 'Ines Calloway', role: 'Accountant',    floor: 11, pitch: 1.3, line: 'I can walk. Just slowly.',
    skinTone: '#f1d0b5', hairStyle: 'ponytail', hairColor: '#8a3b1e', outfitTop: '#81b29a', outfitBottom: '#5c5470', accessory: 'glasses', heightScale: 0.97,
    status: 'injured', injuryLook: 'limp' },
  { name: 'Ruben Vale',    role: 'Facilities',    floor: 17, pitch: 1.0, line: 'Stairwell B is open. Follow me.',
    skinTone: '#a86b47', hairStyle: 'short', hairColor: '#24160f', outfitTop: '#f4a261', outfitBottom: '#264653', accessory: 'hardhat', heightScale: 1.02,
    status: 'shaken', injuryLook: 'arm_sling' },
];
