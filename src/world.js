import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { $, V3 } from './util.js';

/* =====================================================================
   3D WORLD: renderer, sky, lights, ground, roads, frame loop
   ===================================================================== */
export const GRID = 9, CELL = 24;
export const HALF = (GRID * CELL) / 2;
export const HERO_CELL = Math.floor(GRID / 2);   // hero tower sits in the centre cell
export const PLAZA_CELL = { gx: HERO_CELL + 1, gz: HERO_CELL }; // open plaza east of the tower
export const cellCenter = (gx, gz) => ({ x: -HALF + (gx + 0.5) * CELL, z: -HALF + (gz + 0.5) * CELL });

const app = $('app');
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x6b4468, 140, 900);
export const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2500);
camera.position.set(-110, 55, 110);

/* post-processing */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.6, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* sky */
export const SUN_DIR = V3(150, 28, -120).normalize();
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1200, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR.clone() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 sunDir;
      void main(){
        float h = clamp(vP.y, 0.0, 1.0);
        vec3 hor = vec3(0.94, 0.47, 0.29), mid = vec3(0.55, 0.29, 0.48), top = vec3(0.07, 0.06, 0.18);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, top, smoothstep(0.12, 0.7, h));
        float s = max(dot(vP, normalize(sunDir)), 0.0);
        c += vec3(1.0, 0.7, 0.4) * pow(s, 24.0) * 1.2 + vec3(1.0, 0.8, 0.5) * pow(s, 400.0) * 3.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
);
scene.add(sky);

/* environment map from the sky: glass and wet asphalt reflect the sunset */
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), sky.material));
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0, 0.1, 200).texture;
scene.environmentIntensity = 0.75;

/* lights */
scene.add(new THREE.HemisphereLight(0x9a7ab8, 0x2a2238, 0.9));
const sun = new THREE.DirectionalLight(0xffb77a, 3.2);
sun.position.copy(SUN_DIR).multiplyScalar(250);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 10, far: 600 });
sun.shadow.bias = -0.0004;
scene.add(sun);

/* ground + roads */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: 0x1a1823, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const roadLen = GRID * CELL + 40;
const roadCv = document.createElement('canvas'); roadCv.width = 256; roadCv.height = 64;
const rx = roadCv.getContext('2d');
rx.fillStyle = '#25232d'; rx.fillRect(0, 0, 256, 64);
for (let i = 0; i < 1200; i++) { rx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; rx.fillRect(Math.random() * 256, Math.random() * 64, 2, 2); }
rx.fillStyle = '#d9c36a'; rx.fillRect(0, 30, 128, 4);                                   // dashed center line
rx.fillStyle = 'rgba(255,255,255,.55)'; rx.fillRect(0, 3, 256, 2); rx.fillRect(0, 59, 256, 2); // edge lines
const roadTex = new THREE.CanvasTexture(roadCv);
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.colorSpace = THREE.SRGBColorSpace; roadTex.anisotropy = 8;
roadTex.repeat.set(roadLen / 18, 1);
const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.5, metalness: 0.15 });
for (let i = 0; i <= GRID; i++) {
  const p = -HALF + i * CELL;
  const a = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 6), roadMat);
  a.rotation.x = -Math.PI / 2; a.position.set(0, 0.04, p); a.receiveShadow = true; scene.add(a);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 6), roadMat);
  b.rotation.order = 'YXZ'; b.rotation.set(-Math.PI / 2, Math.PI / 2, 0); b.position.set(p, 0.045, 0); b.receiveShadow = true; scene.add(b);
}
// sidewalk blocks under every city cell
const walks = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL - 6, 0.25, CELL - 6), new THREE.MeshStandardMaterial({ color: 0x403d4c, roughness: 0.9 }), GRID * GRID);
{ const m = new THREE.Matrix4(); let n = 0;
  for (let gx = 0; gx < GRID; gx++) for (let gz = 0; gz < GRID; gz++) { const c = cellCenter(gx, gz); m.setPosition(c.x, 0.12, c.z); walks.setMatrixAt(n++, m); }
  walks.receiveShadow = true; scene.add(walks); }
// street lights (glowing bulbs at intersections)
const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), (GRID + 1) * (GRID + 1));
{ const m4 = new THREE.Matrix4(); let bi = 0;
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) { m4.setPosition(-HALF + i * CELL + 3.4, 5, -HALF + j * CELL + 3.4); bulbs.setMatrixAt(bi++, m4); }
  scene.add(bulbs); }

/* frame loop: modules register update(dt, now) callbacks */
const updaters = [];
export function onUpdate(fn) { updaters.push(fn); }
const timer = new THREE.Timer();
function loop(ts) {
  timer.update(ts);
  const dt = Math.min(timer.getDelta(), 0.05), now = timer.getElapsed();
  for (const fn of updaters) fn(dt, now);
  composer.render();
  requestAnimationFrame(loop);
}
export function start() { requestAnimationFrame(loop); }

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});
