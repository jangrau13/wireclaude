// The world outside the windshield: sky, OpenStreetMap ground on a tour of cities, clouds, rain and
// stars. Weather eases toward the target the review sets. Generated farmland lies under the map, so
// the ground still looks right while tiles load or when the tile server cannot be reached.
import * as THREE from "three";

const ALT = 900, SPEED = 120, BASE = 80000, REPEAT = 20, R = 6378137, G = 9.81;
const rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// The tour: a few minutes over each city, then through cloud to the next.
export const CITIES = [
  ["ZURICH", 47.3769, 8.5417], ["PARIS", 48.8566, 2.3522], ["LONDON", 51.5072, -0.1276], ["AMSTERDAM", 52.3676, 4.9041],
  ["BERLIN", 52.52, 13.405], ["VIENNA", 48.2082, 16.3738], ["ROME", 41.9028, 12.4964], ["BARCELONA", 41.3874, 2.1686],
  ["NEW YORK", 40.7128, -74.006], ["SAN FRANCISCO", 37.7749, -122.4194], ["TOKYO", 35.6762, 139.6503], ["SYDNEY", -33.8688, 151.2093],
];
const STAY = 300;  // seconds over a city

// ---- OpenStreetMap tiles: detailed near the aircraft, coarser toward the horizon ----
// Tile usage policy: light use, attribution on screen, tiles kept while needed, two downloads at a time.
const LEVELS = [{z: 12, r: 2, lift: 1}, {z: 14, r: 1, lift: 2}];
class OsmGround {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tiles = new Map();
    this.queue = [];
    this.loading = 0;
    this.loader = new THREE.TextureLoader().setCrossOrigin("anonymous");
    this.failed = 0;
  }

  setOrigin(lat, lon) {
    for (const t of this.tiles.values()) this.drop(t);
    this.tiles.clear();
    this.queue = [];
    this.lat0 = lat;
    this.k = Math.cos(lat * Math.PI / 180);  // Mercator stretches distances by 1/cos(latitude)
    this.mx0 = R * lon * Math.PI / 180;
    this.my0 = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  }

  // Local metres (x east, z south) to and from the global Mercator unit square.
  toUnit(x, z) {
    const mx = this.mx0 + x / this.k, my = this.my0 - z / this.k;
    return [(mx / R + Math.PI) / (2 * Math.PI), (Math.PI - my / R) / (2 * Math.PI)];
  }
  toLocal(u, v) {
    const mx = (u * 2 * Math.PI - Math.PI) * R, my = (Math.PI - v * 2 * Math.PI) * R;
    return [(mx - this.mx0) * this.k, -(my - this.my0) * this.k];
  }

  drop(t) {
    this.group.remove(t.mesh);
    t.mesh.geometry.dispose();
    if (t.mesh.material.map) t.mesh.material.map.dispose();
    t.mesh.material.dispose();
  }

  update(x, z) {
    const [u, v] = this.toUnit(x, z), wanted = new Set();
    for (const {z: zoom, r, lift} of LEVELS) {
      const n = 2 ** zoom, cx = Math.floor(u * n), cy = Math.floor(v * n);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const tx = ((cx + dx) % n + n) % n, ty = cy + dy;
        if (ty < 0 || ty >= n) continue;
        const key = zoom + "/" + tx + "/" + ty;
        wanted.add(key);
        if (this.tiles.has(key)) continue;
        const [x0, z0] = this.toLocal((cx + dx) / n, ty / n), [x1, z1] = this.toLocal((cx + dx + 1) / n, (ty + 1) / n);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0),
                                    new THREE.MeshLambertMaterial({color: "#ffffff", transparent: true, opacity: 0}));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set((x0 + x1) / 2, -ALT + lift, (z0 + z1) / 2);
        mesh.visible = false;
        this.group.add(mesh);
        const tile = {key, mesh, dist: Math.hypot(dx, dy) + (zoom === 14 ? 0 : 0.5)};
        this.tiles.set(key, tile);
        this.queue.push(tile);
      }
    }
    for (const [key, t] of this.tiles) if (!wanted.has(key)) { this.drop(t); this.tiles.delete(key); }
    this.queue = this.queue.filter(t => this.tiles.get(t.key) === t).sort((a, b) => a.dist - b.dist);
    while (this.loading < 2 && this.queue.length && this.failed < 20) this.load(this.queue.shift());
    for (const t of this.tiles.values())  // fade a tile in once it has loaded
      if (t.mesh.material.map && t.mesh.material.opacity < 1) t.mesh.material.opacity = Math.min(1, t.mesh.material.opacity + 0.05);
    this.group.position.set(-x, 0, -z);
  }

  load(tile) {
    this.loading++;
    this.loader.load("https://tile.openstreetmap.org/" + tile.key + ".png", tex => {
      this.loading--;
      if (this.tiles.get(tile.key) !== tile) return tex.dispose();
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tile.mesh.material.map = tex;
      tile.mesh.material.needsUpdate = true;
      tile.mesh.visible = true;
    }, undefined, () => { this.loading--; this.failed++; });  // after repeated failures, the farmland stays
  }
}

// Farmland under the map: fields, woods, roads, a river and villages.
function landTexture() {
  const N = 1024, c = new OffscreenCanvas(N, N), g = c.getContext("2d");
  const fields = ["#6b8f3e", "#7fa04a", "#5a7d34", "#9bb35a", "#c9b45a", "#b8a24e", "#8a6a43", "#7b5d3a", "#6f8a45"];
  g.fillStyle = "#5d7a3a"; g.fillRect(0, 0, N, N);
  for (let y = 0; y < N;) {
    const h = 25 + rand() * 65;
    for (let x = 0; x < N;) {
      const w = 30 + rand() * 100;
      g.fillStyle = fields[Math.floor(rand() * fields.length)];
      g.fillRect(x, y, Math.min(w, N - x), Math.min(h, N - y));
      x += w;
    }
    y += h;
  }
  for (let i = 0; i < 20; i++) {
    const x = rand() * N, y = rand() * N, r = 20 + rand() * 55;
    g.fillStyle = "#2f4a24";
    for (let k = 0; k < 30; k++) { g.beginPath(); g.arc(x + (rand() - 0.5) * r * 1.6, y + (rand() - 0.5) * r * 1.6, 4 + rand() * 11, 0, 6.3); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(REPEAT, REPEAT);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

function cloudTexture() {
  const c = new OffscreenCanvas(256, 256), g = c.getContext("2d");
  for (let i = 0; i < 22; i++) {
    const x = 128 + (rand() - 0.5) * 120, y = 140 + (rand() - 0.5) * 60, r = 30 + rand() * 50;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
  }
  const shade = g.createLinearGradient(0, 100, 0, 220);  // darker undersides
  shade.addColorStop(0, "rgba(0,0,0,0)"); shade.addColorStop(1, "rgba(60,70,80,0.45)");
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = shade; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SKY_VS = `varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = `uniform vec3 top, horizon, below, sunDir, sunColor;
uniform float sunAmount;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 col = d.y > 0.0 ? mix(horizon, top, pow(clamp(d.y, 0.0, 1.0), 0.55)) : mix(horizon, below, clamp(-d.y * 6.0, 0.0, 1.0));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.22) * sunAmount;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const COL = {
  top: [new THREE.Color("#2c68b8"), new THREE.Color("#3a4047"), new THREE.Color("#c4cacf"), new THREE.Color("#02040a")],
  horizon: [new THREE.Color("#bfd6ea"), new THREE.Color("#6b7279"), new THREE.Color("#cfd4d8"), new THREE.Color("#0b1426")],
};

export class World {
  constructor(scene, aircraft) {
    this.scene = scene;
    this.weather = {clouds: 0.15, fog: 0, rain: 0, night: 0};
    this.target = {...this.weather};
    this.pass = 0;  // a cloud pass between cities: 0 clear, 1 inside the cloud
    this.uniforms = {
      top: {value: new THREE.Color()}, horizon: {value: new THREE.Color()}, below: {value: new THREE.Color("#55605a")},
      sunDir: {value: new THREE.Vector3(0.35, 0.32, -0.88)}, sunColor: {value: new THREE.Color("#fff3d6")}, sunAmount: {value: 1},
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24),
      new THREE.ShaderMaterial({uniforms: this.uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false}));
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    this.land = landTexture();
    this.base = new THREE.Mesh(new THREE.PlaneGeometry(BASE, BASE), new THREE.MeshLambertMaterial({map: this.land}));
    this.base.rotation.x = -Math.PI / 2;
    this.base.position.y = -ALT;
    scene.add(this.base);
    this.osm = new OsmGround(scene);

    const cloudMat = new THREE.SpriteMaterial({map: cloudTexture(), transparent: true, depthWrite: false, fog: true});
    this.cloudMat = cloudMat;
    this.clouds = Array.from({length: 160}, () => {
      const s = new THREE.Sprite(cloudMat);
      s.position.set((rand() - 0.5) * 14000, -450 + rand() * 1500, -rand() * 14000 + 2000);
      const k = 500 + rand() * 1300;
      s.scale.set(k * 1.6, k, 1);
      scene.add(s);
      return s;
    });

    const stars = new Float32Array(3 * 2500);
    for (let i = 0; i < 2500; i++) {
      const a = rand() * Math.PI * 2, y = 0.05 + rand() * 0.95, r = Math.sqrt(1 - y * y);
      stars.set([Math.cos(a) * r * 8500, y * 8500, Math.sin(a) * r * 8500], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({color: "#ffffff", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false}));
    scene.add(this.stars);

    // Rain in aircraft space, outside the windshield, streaking toward the pilot.
    this.drops = new Float32Array(6 * 1800);
    for (let i = 0; i < 1800; i++) this.respawn(i, true);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(this.drops, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({color: "#c8d2dc", transparent: true, opacity: 0, fog: false}));
    this.rain.frustumCulled = false;
    aircraft.add(this.rain);

    this.hemi = new THREE.HemisphereLight("#cfe3ff", "#4a5a3a", 1.4);
    this.sun = new THREE.DirectionalLight("#fff2dc", 2.2);
    this.sun.position.copy(this.uniforms.sunDir.value).multiplyScalar(100);
    scene.add(this.hemi, this.sun);
    scene.fog = new THREE.FogExp2(new THREE.Color(), 8e-5);

    // Flight state: position in metres from the city centre, heading, bank.
    this.city = 0;
    this.cityTime = 0;
    this.x = 4000; this.z = 0; this.heading = 0; this.roll = 0; this.pitch = 0.02;
    this.osm.setOrigin(CITIES[0][1], CITIES[0][2]);
  }

  get cityName() { return CITIES[this.city][0]; }

  respawn(i, anywhere) {
    const x = (rand() - 0.5) * 14, y = -3 + rand() * 9, z = anywhere ? -2 - rand() * 40 : -42;
    this.drops.set([x, y, z, x - 0.05, y - 0.25, z + 0.9], i * 6);
  }

  setTarget(t) { Object.assign(this.target, t); }
  snap(t) { Object.assign(this.target, t); Object.assign(this.weather, t); }

  // A simple autopilot: bank toward the city when far out, wander gently when over it.
  fly(dt, time, still) {
    const dist = Math.hypot(this.x, this.z), bearing = Math.atan2(-this.x, this.z);
    let want = Math.sin(time * 0.05) * 0.12 + Math.sin(time * 0.017) * 0.06;
    if (dist > 4500) want = Math.max(-0.35, Math.min(0.35, wrap(bearing - this.heading) * 0.8));
    this.roll += (want - this.roll) * (1 - Math.exp(-dt * 0.6));
    this.heading = wrap(this.heading + G * Math.tan(this.roll) / SPEED * dt);
    this.pitch = 0.02 + (still ? 0 : Math.sin(time * 0.11) * 0.01);
    this.x += Math.sin(this.heading) * SPEED * dt;
    this.z -= Math.cos(this.heading) * SPEED * dt;
    this.cityTime += dt;
    if (this.cityTime > STAY && this.pass === 0) this.pass = 0.001;  // start the cloud pass
    if (this.pass > 0) {
      this.pass += dt / 4;
      if (this.pass >= 0.5 && !this.switched) {  // inside the cloud: arrive at the next city
        this.switched = true;
        this.city = (this.city + 1) % CITIES.length;
        this.cityTime = 0;
        this.x = 4000 * Math.sin(this.heading + Math.PI);
        this.z = -4000 * Math.cos(this.heading + Math.PI);
        this.osm.setOrigin(CITIES[this.city][1], CITIES[this.city][2]);
      }
      if (this.pass >= 1) { this.pass = 0; this.switched = false; }
    }
  }

  update(dt, time, still) {
    this.fly(dt, time, still);
    const w = this.weather, k = still ? 1 : 1 - Math.exp(-dt * 0.8);
    for (const key of Object.keys(w)) w[key] = lerp(w[key], this.target[key], k);
    const cloudPass = Math.sin(Math.PI * this.pass), fog = Math.max(w.fog, cloudPass);
    const over = Math.min(1, w.clouds * w.clouds * 0.6 + w.rain), {top, horizon} = this.uniforms;
    top.value.copy(COL.top[0]).lerp(COL.top[1], over).lerp(COL.top[2], fog * 0.9).lerp(COL.top[3], w.night);
    horizon.value.copy(COL.horizon[0]).lerp(COL.horizon[1], over).lerp(COL.horizon[2], fog).lerp(COL.horizon[3], w.night);
    this.uniforms.below.value.copy(horizon.value).multiplyScalar(0.7);
    this.uniforms.sunAmount.value = (1 - over) * (1 - fog) * (1 - w.night);
    this.scene.fog.color.copy(horizon.value);
    this.scene.fog.density = lerp(lerp(8e-5, 2.2e-4, w.rain), 1.3e-3, fog);
    this.hemi.intensity = lerp(lerp(1.4, 0.75, over), 0.06, w.night);
    this.sun.intensity = lerp(2.2 * (1 - over * 0.7), 0.03, w.night);
    this.stars.material.opacity = w.night * (1 - over) * (1 - fog);
    this.cloudMat.color.setRGB(1, 1, 1).lerp(new THREE.Color("#5c636b"), w.rain).lerp(new THREE.Color("#1a1d24"), w.night);
    this.rain.material.opacity = w.rain * 0.55;

    // The ground stays put and the aircraft moves over it; the farmland repeats under the map.
    this.land.offset.set(this.x * REPEAT / BASE, -this.z * REPEAT / BASE);
    this.osm.update(this.x, this.z);
    const fx = Math.sin(this.heading), fz = -Math.cos(this.heading), d = SPEED * dt;
    const shown = Math.round(10 + w.clouds * 150);
    this.clouds.forEach((s, i) => {
      s.visible = i < shown;
      s.position.x -= fx * d;
      s.position.z -= fz * d;
      if (s.position.x * fx + s.position.z * fz < -2500) {  // passed behind: put it far ahead again
        const ahead = 11000 + rand() * 3000, side = (rand() - 0.5) * 14000;
        s.position.x = fx * ahead - fz * side;
        s.position.z = fz * ahead + fx * side;
      }
    });
    if (w.rain > 0.02) {
      const p = this.drops;
      for (let i = 0; i < 1800; i++) {
        const o = i * 6, v = 60 * dt;
        p[o + 2] += v; p[o + 5] += v; p[o + 1] -= 3 * dt; p[o + 4] -= 3 * dt;
        if (p[o + 2] > -1.4) this.respawn(i, false);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }
}
