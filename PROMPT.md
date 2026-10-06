# Halcyon Tower upgrade brief

You are upgrading an existing Vite + Three.js project in this workspace (a FICTIONAL film/game project: "Halcyon Tower" in the fictional city of Verrane). First read index.html, src/main.js, vite.config.js and the folders in /public/models. Keep everything that already works. Always output COMPLETE files, never clipped snippets. If src/main.js gets too large, split it into modules under src/ (world.js, city.js, tower.js, plane.js, people.js, fx.js, director.js, audio.js, ui.js) and import them from main.js.

Work in the phases below, ONE PHASE AT A TIME. After each phase run `npm run build`, fix errors, summarize what I can tweak (list config constants), then stop and wait for me to say "next".

## PHASE 0: my airliner
- Set PLANE_URL = '/models/plane/scene.gltf' (Sketchfab CRJ-900 with scene.bin and textures/). Auto-scale to PLANE_LENGTH. PLANE_MODEL_YAW stays configurable; pressing P cycles it through 0, PI/2, PI, -PI/2 and logs the value so I can find the right orientation.
- Add red/green wingtip nav lights, white strobes, a red beacon and a landing-light spot light. Cast shadows.

## PHASE 1: real interiors and 3D people inside the buildings
- Replace the single textured box of Halcyon Tower with a building that has a real interior: floor slabs for all 20 floors, a central core with a stairwell, desk and partition blocks, and emissive ceiling light strips, seen through a glass facade (MeshPhysicalMaterial, transparent about 0.25 to 0.35, slight reflection, mullion frames). Windows near the impact floor go dark and flicker after impact.
- Add an "X-ray" toggle that fades the facade to about 0.08 opacity so interiors are fully visible. Auto-enable it during interior camera shots.
- Give 4 to 6 nearby city buildings simple lit interiors on a few floors, with instanced silhouette workers visible through their windows (cheap, no photo heads).
- People: build a stylized but realistic-proportion humanoid in code (no external model needed): torso, pelvis, upper and lower arms and legs on pivot groups, shoes, simple clothes with customizable colors. Procedural animations: working (typing, standing, talking), alert (head turn), duck-and-cover (brief crouch with hands over head), walk and run cycles, stair descent, and standing safely on the plaza. Share geometries and materials so 40+ people run at 60fps on Medium quality.
- Occupant data model: { id, name, role, floor, position, heightScale, skinTone, hairStyle, hairColor, outfitTop, outfitBottom, accessory (none/glasses/cap/hardhat), headPhoto (data URL or null), line, pitch, audio }.
- 3D evacuation: after impact each person finishes the reaction, walks or runs to the core, descends floor by floor through the stairwell (visible in X-ray), exits through the lobby doors and gathers on the plaza at a safe distance, then turns to look back at the tower. Everyone survives and nobody is hurt. Keep spoken lines (speechSynthesis) and per-person custom audio. Keep the side-panel cutaway in sync with the 3D positions.

## PHASE 2: customize each person, including a photo for the head
- In the People tab add a character editor per person: name, role, floor, skin tone, hair style and color, outfit colors, accessory, height, and a "Head photo" file input (accept image/*) with drag and drop.
- Photo flow: FileReader, then Image, then a crop dialog (oval mask, zoom slider, drag to reposition, brightness and contrast sliders), output a 512x512 canvas texture. Process everything in the browser. Never upload or send the image anywhere. Optionally persist the cast in IndexedDB on this device, with a "Clear all photos" button.
- Head rendering: a slightly egg-shaped head in the chosen skin tone with hair or cap geometry, plus a curved face decal covering the front of the head (partial SphereGeometry with the photo texture, soft alpha-feathered edges, sRGB color space, anisotropy), so the photo reads as the face from the front and wraps naturally at the sides. The face must still look right in close-ups and respond to cinematic lighting (receives light, subtle roughness, not emissive).
- Above the upload, add this notice: "Only use photos of yourself or people who agreed to appear." Add a "Remove photo" button per person.
- Live 3D preview of the character inside the editor that updates instantly when I change options.
- Add, remove and duplicate characters, a "Randomize look" button, and export/import of the cast as JSON (photos excluded unless I tick "include photos").

## PHASE 3: make everything cinematic (city, airplane, people)
- Camera director with named shots, smooth easing and one intentional hard cut: (1) drone establishing shot over the skyline at dusk; (2) low tracking shot following the CRJ with slight lens drift; (3) close-up through the glass of the impact floor showing the photo-head characters working; (4) plane arrival and impact in slow motion (time scale about 0.25 for 1.5 seconds, then ease back to 1.0); (5) interior shot where characters duck and cover while the lights flicker; (6) tracking shot behind a "hero" character running down the stairwell in X-ray; (7) lobby exit, slow walk-out toward the camera with the burning tower backlit behind them; (8) slow pull-back and orbit revealing the smoke column; (9) high wide shot. Let me choose the hero character from a dropdown. Add a "Skip to impact" button and a Free camera toggle (OrbitControls).
- Post-processing: depth of field (BokehPass) with focus pulled to the subject in each shot, subtle chromatic aberration, film grain, vignette, teal-and-orange grade (custom ShaderPass), anamorphic bloom streaks, sun lens flare, animated 2.39:1 letterbox bars, heat haze near the fire.
- Motion: noise-based camera shake scaled by impact energy, handheld sway on tracking shots.
- Effects: layered fireball with color ramp and flickering light, rising smoke column drifting with wind and lit orange from below, glass shards and debris with gravity and bounce, shockwave ring, falling paper and ash, red emergency strobe.
- Atmosphere: god rays from the low sun, ground fog layer, wet reflective asphalt, light beams from street lights.
- Audio mix: ConvolverNode reverb (generated impulse response), jet pass with pan and Doppler pitch shift, deep low-frequency impact followed by a brief silence dip, alarms, distant sirens fading in, footsteps on stairs with room reverb, subtle tension drone. Keep the CUSTOM_AUDIO hooks.
- Trailer-style title cards that fade in and out: "HALCYON TOWER", then "Verrane. 6:42 PM." using the existing fonts.
- Quality selector Low / Medium / High (pixel ratio, shadow size, particle counts, post passes, number of detailed characters), default Medium. Respect prefers-reduced-motion (no shake, shorter shots).

## CONSTRAINTS
- Fictional building and city only. No real events or landmarks.

- Photos stay in the browser. Audio starts only after the user clicks Run.
- Keep CITY_STYLE = 'realistic' as the default.
