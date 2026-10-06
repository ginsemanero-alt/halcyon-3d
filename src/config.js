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

/* glass facade + X-ray (PHASE 1) */
export const GLASS_OPACITY = 0.3;       // normal facade opacity (0.25 to 0.35 looks right)
export const XRAY_OPACITY = 0.08;       // facade opacity in X-ray mode
export const XRAY_FADE = 4;             // fade speed (higher = faster)
export const MULLION_SPACING = 1.75;    // metres between vertical facade fins
export const DAMAGED_FLOORS = [IMPACT_FLOOR - 1, IMPACT_FLOOR, IMPACT_FLOOR + 1]; // these floors go dark and flicker

/* neighbouring buildings with lit interiors */
export const INTERIOR_BUILDINGS = 5;    // 4 to 6 recommended
export const INTERIOR_LIT_FLOORS = 4;   // lit floors per interior building
export const WORKERS_PER_FLOOR = 7;     // silhouette workers per lit floor

/* people */
export const EXTRA_OCCUPANTS = 36;      // generated background occupants (no speech), on top of the cast below
export const WALK_SPEED = 1.35;         // m/s
export const RUN_SPEED = 3.0;           // m/s
export const STAIR_SPEED = 3.2;         // m/s along the stair flights (brisk for the film; ~3.3 s per floor)
export const RUN_NEAR_IMPACT = 3;       // people within this many floors of impact run instead of walk
export const PLAZA_CENTER = { x: 26, z: 0 }; // gathering point (open plaza east of the tower)
export const PLAZA_RADIUS = 7;

// Point any of these at your own audio file (e.g. '/sounds/boom.mp3'). null = built-in synth sound.
export const CUSTOM_AUDIO = { jet: null, boom: null, alarm: null, siren: null, step: null, ding: null };

/* Your people. Occupant data model:
   { id, name, role, floor, position, heightScale, skinTone, hairStyle, hairColor, outfitTop, outfitBottom,
     accessory ('none' | 'glasses' | 'cap' | 'hardhat'), headPhoto (data URL or null), line, pitch, audio }
   position: { x, z } in tower-local metres, or null to auto-assign a desk.
   hairStyle: 'short' | 'long' | 'bun' | 'ponytail' | 'buzz' | 'bald'.
   'audio' is optional and plays when that person starts moving. */
export const PEOPLE = [
  { name: 'Mara Okafor',   role: 'Architect',     floor: 14, pitch: 1.0, line: 'Stairwell, everyone. Leave your things.',
    skinTone: '#8d5a3b', hairStyle: 'bun', hairColor: '#1b1210', outfitTop: '#c8553d', outfitBottom: '#2b2d42', accessory: 'glasses', heightScale: 1.0 },
  { name: 'Dev Lindqvist', role: 'Engineer',      floor: 9,  pitch: 0.8, line: 'Walk, do not run. Hold the rail.',
    skinTone: '#e8c4a8', hairStyle: 'short', hairColor: '#c9a46a', outfitTop: '#3d5a80', outfitBottom: '#22223b', accessory: 'none', heightScale: 1.06 },
  { name: 'Tala Reyes',    role: 'Producer',      floor: 17, pitch: 1.3, line: 'This way, the stairs are clear.',
    skinTone: '#c68f65', hairStyle: 'long', hairColor: '#2a1a12', outfitTop: '#f2cc8f', outfitBottom: '#3d405b', accessory: 'none', heightScale: 0.95 },
  { name: 'Joon Park',     role: 'Security lead', floor: 3,  pitch: 0.8, line: 'Floor three is moving. Keep going.',
    skinTone: '#e0b48c', hairStyle: 'buzz', hairColor: '#111111', outfitTop: '#1d1d24', outfitBottom: '#1d1d24', accessory: 'cap', heightScale: 1.04 },
  { name: 'Ines Calloway', role: 'Accountant',    floor: 11, pitch: 1.3, line: 'Okay. Okay. Let us go.',
    skinTone: '#f1d0b5', hairStyle: 'ponytail', hairColor: '#8a3b1e', outfitTop: '#81b29a', outfitBottom: '#5c5470', accessory: 'glasses', heightScale: 0.97 },
  { name: 'Ruben Vale',    role: 'Facilities',    floor: 6,  pitch: 1.0, line: 'Stairwell B is open. Follow me.',
    skinTone: '#a86b47', hairStyle: 'short', hairColor: '#24160f', outfitTop: '#f4a261', outfitBottom: '#264653', accessory: 'hardhat', heightScale: 1.02 },
];
