// The world outside the windshield: sky, OpenStreetMap ground on a tour of cities, clouds, rain and
// stars. Weather eases toward the target the review sets. Generated farmland lies under the map, so
// the ground still looks right while tiles load or when the tile server cannot be reached.
import * as THREE from "three";

const BASE = 80000, REPEAT = 20, R = 6378137, G = 9.81, DEG = Math.PI / 180;
const rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// Routes, flown the whole way over the map from waypoint to waypoint in real time; at the end the
// aircraft holds over the destination until another route is chosen. Scenic routes fly low and slow;
// long-haul routes cruise at airliner height and speed (Zurich to New York takes about seven hours).
const LOW = {alt: 900, speed: 160}, CRUISE = {alt: 11000, speed: 250};
export const ROUTES = [
  {name: "ZURICH - NEW YORK", ...CRUISE, cities: [["ZURICH", 47.4647, 8.5492], ["PARIS", 48.8566, 2.3522],
    ["NEWQUAY", 50.4155, -5.073], ["SHANNON", 52.7019, -8.864], ["53N020W", 53, -20], ["54N030W", 54, -30],
    ["53N040W", 53, -40], ["50N050W", 50, -50], ["GANDER", 48.9539, -54.6087], ["HALIFAX", 44.6488, -63.5752],
    ["BOSTON", 42.3601, -71.0589], ["NEW YORK", 40.6413, -73.7781]]},
  {name: "ZURICH - SAN FRANCISCO", ...CRUISE, cities: [["ZURICH", 47.4647, 8.5492], ["AMSTERDAM", 52.3676, 4.9041],
    ["ABERDEEN", 57.1497, -2.0943], ["FAROE ISLANDS", 62.0107, -6.7741], ["REYKJAVIK", 64.1466, -21.9426],
    ["KULUSUK", 65.5736, -37.1836], ["NUUK", 64.1814, -51.6941], ["IQALUIT", 63.7467, -68.517], ["CHURCHILL", 58.7684, -94.165],
    ["CALGARY", 51.0447, -114.0719], ["SEATTLE", 47.6062, -122.3321], ["SAN FRANCISCO", 37.6213, -122.379]]},
  {name: "ZURICH - TORONTO", ...CRUISE, cities: [["ZURICH", 47.4647, 8.5492], ["PARIS", 48.8566, 2.3522],
    ["NEWQUAY", 50.4155, -5.073], ["SHANNON", 52.7019, -8.864], ["54N020W", 54, -20], ["56N030W", 56, -30],
    ["56N040W", 56, -40], ["55N050W", 55, -50], ["GOOSE BAY", 53.3017, -60.4189], ["MONTREAL", 45.5019, -73.5674],
    ["TORONTO", 43.6777, -79.6248]]},
  {name: "LONDON - NEW YORK", ...CRUISE, cities: [["LONDON", 51.47, -0.4543], ["BRISTOL", 51.4545, -2.5879],
    ["SHANNON", 52.7019, -8.864], ["52N020W", 52, -20], ["51N030W", 51, -30], ["50N040W", 50, -40], ["49N050W", 49, -50],
    ["ST. JOHN'S", 47.5615, -52.7126], ["HALIFAX", 44.6488, -63.5752], ["BOSTON", 42.3601, -71.0589], ["NEW YORK", 40.6413, -73.7781]]},
  {name: "ZURICH - MIAMI", ...CRUISE, cities: [["ZURICH", 47.4647, 8.5492], ["LYON", 45.764, 4.8357], ["BORDEAUX", 44.8378, -0.5792],
    ["SANTIAGO DE COMPOSTELA", 42.8782, -8.5448], ["AZORES", 37.7412, -25.6756], ["35N040W", 35, -40], ["33N055W", 33, -55],
    ["BERMUDA", 32.3078, -64.7505], ["NASSAU", 25.0443, -77.3504], ["MIAMI", 25.7959, -80.287]]},
  {name: "ZURICH - DUBAI", ...CRUISE, cities: [["ZURICH", 47.4647, 8.5492], ["VIENNA", 48.2082, 16.3738],
    ["BUCHAREST", 44.4268, 26.1025], ["ANKARA", 39.9334, 32.8597], ["TABRIZ", 38.0962, 46.2738], ["TEHRAN", 35.6892, 51.389],
    ["ISFAHAN", 32.6546, 51.668], ["SHIRAZ", 29.5918, 52.5837], ["DUBAI", 25.2532, 55.3657]]},
  {name: "ZURICH - DELHI", ...CRUISE, cities: [["ZURICH", 47.4647, 8.5492], ["BUDAPEST", 47.4979, 19.0402],
    ["BUCHAREST", 44.4268, 26.1025], ["TBILISI", 41.7151, 44.8271], ["BAKU", 40.4093, 49.8671], ["ASHGABAT", 37.9601, 58.3261],
    ["TERMEZ", 37.2242, 67.2783], ["ISLAMABAD", 33.6844, 73.0479], ["DELHI", 28.5562, 77.1]]},
  {name: "ZURICH - JOHANNESBURG", ...CRUISE, cities: [["ZURICH", 47.4647, 8.5492], ["MILAN", 45.4642, 9.19], ["ROME", 41.9028, 12.4964],
    ["TRIPOLI", 32.8872, 13.1913], ["N'DJAMENA", 12.1348, 15.0557], ["BANGUI", 4.3947, 18.5582], ["LUBUMBASHI", -11.6609, 27.4794],
    ["LUSAKA", -15.3875, 28.3228], ["GABORONE", -24.6282, 25.9231], ["JOHANNESBURG", -26.1367, 28.2411]]},
  {name: "ZURICH - SAO PAULO", ...CRUISE, cities: [["ZURICH", 47.4647, 8.5492], ["GENEVA", 46.2044, 6.1432],
    ["BARCELONA", 41.3874, 2.1686], ["CASABLANCA", 33.5731, -7.5898], ["LAS PALMAS", 28.1235, -15.4363], ["PRAIA", 14.933, -23.5133],
    ["RECIFE", -8.0476, -34.877], ["SALVADOR", -12.9777, -38.5016], ["RIO DE JANEIRO", -22.9068, -43.1729],
    ["SAO PAULO", -23.4356, -46.4731]]},
  {name: "NEW YORK - BUENOS AIRES", ...CRUISE, cities: [["NEW YORK", 40.6413, -73.7781], ["35N070W", 35, -70],
    ["SAN JUAN", 18.4655, -66.1057], ["CARACAS", 10.4806, -66.9036], ["MANAUS", -3.119, -60.0217], ["CUIABA", -15.601, -56.0974],
    ["ASUNCION", -25.2637, -57.5759], ["BUENOS AIRES", -34.8222, -58.5358]]},
  {name: "MOSCOW - BEIJING", ...CRUISE, cities: [["MOSCOW", 55.9726, 37.4146], ["KAZAN", 55.7963, 49.1088],
    ["YEKATERINBURG", 56.8389, 60.6057], ["OMSK", 54.9885, 73.3242], ["NOVOSIBIRSK", 55.0084, 82.9357], ["IRKUTSK", 52.287, 104.305],
    ["ULAANBAATAR", 47.8864, 106.9057], ["ERENHOT", 43.65, 111.98], ["BEIJING", 40.0799, 116.6031]]},
  {name: "SYDNEY - TOKYO", ...CRUISE, cities: [["SYDNEY", -33.9399, 151.1753], ["BRISBANE", -27.4698, 153.0251],
    ["CAIRNS", -16.9186, 145.7781], ["PORT MORESBY", -9.4438, 147.1803], ["GUAM", 13.4443, 144.7937],
    ["IWO JIMA", 24.78, 141.32], ["TOKYO", 35.5494, 139.7798]]},
  {name: "ZURICH - CAIRO", ...CRUISE, cities: [["ZURICH", 47.4647, 8.5492], ["MILAN", 45.4642, 9.19], ["ROME", 41.9028, 12.4964],
    ["ATHENS", 37.9838, 23.7275], ["HERAKLION", 35.3387, 25.1442], ["ALEXANDRIA", 31.2001, 29.9187], ["CAIRO", 30.1219, 31.4056]]},
  {name: "ZURICH - REYKJAVIK", ...CRUISE, cities: [["ZURICH", 47.4647, 8.5492], ["AMSTERDAM", 52.3676, 4.9041],
    ["ABERDEEN", 57.1497, -2.0943], ["FAROE ISLANDS", 62.0107, -6.7741], ["REYKJAVIK", 63.985, -22.6056]]},
  {name: "ZURICH - LISBON", ...CRUISE, cities: [["ZURICH", 47.4647, 8.5492], ["GENEVA", 46.2044, 6.1432], ["LYON", 45.764, 4.8357],
    ["BORDEAUX", 44.8378, -0.5792], ["BILBAO", 43.263, -2.935], ["PORTO", 41.1579, -8.6291], ["LISBON", 38.7742, -9.1342]]},
  {name: "ZURICH - GENEVA - PARIS", ...LOW, cities: [["ZURICH", 47.4647, 8.5492], ["BERN", 46.948, 7.4474], ["LAUSANNE", 46.5197, 6.6323],
    ["GENEVA", 46.2044, 6.1432], ["DIJON", 47.322, 5.0415], ["PARIS", 49.0097, 2.5479]]},
  {name: "ALPS: ZURICH - MILAN", ...LOW, cities: [["ZURICH", 47.4647, 8.5492], ["LUCERNE", 47.0502, 8.3093], ["ANDERMATT", 46.6356, 8.5939],
    ["BELLINZONA", 46.1955, 9.0238], ["LUGANO", 46.0037, 8.9511], ["COMO", 45.8081, 9.0852], ["MILAN", 45.6306, 8.7281]]},
  {name: "RHINE: BASEL - ROTTERDAM", ...LOW, cities: [["BASEL", 47.59, 7.5291], ["STRASBOURG", 48.5734, 7.7521], ["KARLSRUHE", 49.0069, 8.4037],
    ["MAINZ", 49.9929, 8.2473], ["KOBLENZ", 50.3569, 7.589], ["BONN", 50.7374, 7.0982], ["COLOGNE", 50.9375, 6.9603],
    ["DUSSELDORF", 51.2277, 6.7735], ["ROTTERDAM", 51.9569, 4.4372]]},
  {name: "LONDON - PARIS", ...LOW, cities: [["LONDON", 51.47, -0.4543], ["CANTERBURY", 51.2802, 1.0789], ["DOVER", 51.1279, 1.3134],
    ["CALAIS", 50.9513, 1.8587], ["AMIENS", 49.8941, 2.2958], ["PARIS", 49.0097, 2.5479]]},
];
// ---- great circles: the shortest path between two points on the globe, as airliners fly it ----
const vec = (lat, lon) => [Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG)];
const latLon = ([x, y, z]) => [Math.atan2(z, Math.hypot(x, y)) / DEG, Math.atan2(y, x) / DEG];
const angle = (a, b) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
function prepare(r) {  // legs with their length and start distance along the route
  let cum = 0;
  r.legs = r.cities.slice(1).map((p, i) => {
    const a = vec(r.cities[i][1], r.cities[i][2]), b = vec(p[1], p[2]), w = angle(a, b), leg = {a, b, w, len: w * R, cum};
    cum += leg.len;
    return leg;
  });
  r.total = cum;
  r.km = Math.round(cum / 1000);
  return r;
}
ROUTES.forEach(prepare);

// Oceanic-style names for points on a direct flight, such as 53N020W.
const fix = (lat, lon) => String(Math.round(Math.abs(lat))).padStart(2, "0") + (lat < 0 ? "S" : "N")
                          + String(Math.round(Math.abs(lon))).padStart(3, "0") + (lon < 0 ? "W" : "E");
// A direct flight between any two places, [name, lat, lon], along the great circle, with a waypoint
// about every 800 km. Longer than 800 km in all: cruise height and speed; shorter: low and slow.
export function directRoute(from, to) {
  const a = vec(from[1], from[2]), b = vec(to[1], to[2]), w = angle(a, b), n = Math.max(1, Math.round(w * R / 800000));
  const mid = Array.from({length: n - 1}, (_, k) => {
    const f = (k + 1) / n, k0 = Math.sin((1 - f) * w) / Math.sin(w), k1 = Math.sin(f * w) / Math.sin(w);
    const [lat, lon] = latLon([a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1]);
    return [fix(lat, lon), lat, lon];
  });
  return {name: "DIRECT " + from[0] + " - " + to[0], ...(w * R > 800000 ? CRUISE : LOW), cities: [from, ...mid, to]};
}
function pointAt(r, s) {  // the point s metres along the route
  let i = r.legs.findIndex(l => s < l.cum + l.len);
  if (i < 0) i = r.legs.length - 1;
  const {a, b, w, len, cum} = r.legs[i], f = Math.min(1, (s - cum) / len), k0 = Math.sin((1 - f) * w) / Math.sin(w), k1 = Math.sin(f * w) / Math.sin(w);
  const [lat, lon] = w < 1e-9 ? latLon(a) : latLon([a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1]);
  return {lat, lon, leg: i};
}
// The point d metres from [lat, lon] in direction brg (radians clockwise from north).
export function destPoint([lat, lon], brg, d) {
  const f1 = lat * DEG, l1 = lon * DEG, w = d / R;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(w) + Math.cos(f1) * Math.sin(w) * Math.cos(brg));
  const l2 = l1 + Math.atan2(Math.sin(brg) * Math.sin(w) * Math.cos(f1), Math.cos(w) - Math.sin(f1) * Math.sin(f2));
  return [f2 / DEG, ((l2 / DEG + 540) % 360) - 180];
}
export const bearingOf = ([a, b], [c, d]) => bearing({lat: a, lon: b}, {lat: c, lon: d});
export const distanceOf = ([a, b], [c, d]) => angle(vec(a, b), vec(c, d)) * R;

// ---- the flight profile: take-off roll, climb, cruise, descent, a 3 degree final approach, rollout ----
export const LIFTOFF = 1800, FINAL = 15000, ROLLOUT = 1600;  // metres along the path
const GLIDE = Math.tan(3 * DEG), CLIMB = 0.075;  // descent and climb gradients
const VR = 80, VAPP = 85, VTD = 70;  // lift-off, start of final approach, touchdown speeds (m/s)
// Phases along the path, each with distance, speed and height at its ends, and its start time.
function profile(total, plan) {
  const phases = [];
  let s = 0, v = plan.start ? plan.start.speed : 0, h = plan.start ? plan.start.alt : 0;
  const add = (len, v1, h1, name) => { len = Math.max(0, len); phases.push({s0: s, s1: s + len, v0: v, v1, h0: h, h1, name}); s += len; v = v1; h = h1; };
  if (!plan.start) add(LIFTOFF, VR, 0, "TAKEOFF");
  const fafHeight = FINAL * GLIDE, room = total - s - FINAL - ROLLOUT;
  const descent = a => Math.max(0, a - fafHeight) / GLIDE, change = a => a >= h ? (a - h) / CLIMB : (h - a) / GLIDE;
  let alt = plan.alt;
  if (change(alt) + descent(alt) > room)  // a short flight: level off lower, so there is room to come down
    alt = Math.max(fafHeight, Math.min(alt, (room + h / CLIMB + fafHeight / GLIDE) / (1 / CLIMB + 1 / GLIDE)));
  const climb = change(alt);  // measured from the height before the climb
  add(climb, plan.speed, alt, alt >= h ? "CLIMB" : "DESCENT");
  add(room - climb - descent(alt), plan.speed, alt, "CRUISE");
  add(descent(alt), VAPP, fafHeight, "DESCENT");
  add(FINAL, VTD, 0, "APPROACH");
  add(ROLLOUT, 0, 0, "LANDING");
  let t = 0;
  for (const p of phases) { p.t0 = t; p.dt = p.s1 > p.s0 ? (p.s1 - p.s0) / ((p.v0 + p.v1) / 2 || 1) : 0; t += p.dt; }
  return phases;
}

function bearing(p, q) {  // initial direction from p to q, clockwise from north
  const f1 = p.lat * DEG, f2 = q.lat * DEG, dl = (q.lon - p.lon) * DEG;
  return Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl));
}
const RECENTRE = 8000;  // metres from the map origin before the origin moves under the aircraft
const CLOUDS = 60000;  // width of the field of clouds around the aircraft, in metres

// ---- OpenStreetMap tiles: detailed near the aircraft, coarser toward the horizon ----
// Tile usage policy: light use, attribution on screen, tiles kept while needed, two downloads at a time.
// Map detail rings: fine near the aircraft, coarse out to the horizon, so the map shows all the way.
// The ring set follows the height: sharp tiles on the runway, wide coverage at cruise.
const GROUND_LEVELS = [{z: 10, r: 2, lift: 1}, {z: 13, r: 2, lift: 2}, {z: 16, r: 2, lift: 3}];
const LEVELS = [{z: 10, r: 2, lift: 1}, {z: 12, r: 2, lift: 2}, {z: 14, r: 1, lift: 3}];  // about 50 km out
const HIGH_LEVELS = [{z: 7, r: 2, lift: 1}, {z: 9, r: 2, lift: 2}, {z: 11, r: 2, lift: 3}];  // about 500 km out
const EYE = 5;  // pilot's eye above the ground when the wheels are on it
const UNIT = new THREE.PlaneGeometry(1, 1);  // shared by all tiles, scaled to each tile's size
const RUNWAY = (() => {  // asphalt with threshold stripes, numbers left out, and a dashed centre line
  const c = new OffscreenCanvas(64, 2048), g = c.getContext("2d");
  g.fillStyle = "#3a3c3f"; g.fillRect(0, 0, 64, 2048);
  g.fillStyle = "#e8e8e8";
  for (const y of [8, 2040 - 40]) for (let x = 6; x < 60; x += 7) g.fillRect(x, y, 4, 32);  // threshold stripes
  for (let y = 70; y < 1980; y += 40) g.fillRect(31, y, 2, 22);  // centre line
  g.fillRect(1, 0, 1.5, 2048); g.fillRect(61.5, 0, 1.5, 2048);  // edge lines
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
})();
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

  // The map origin: local metres are measured from here. Moving it in flight keeps the loaded tiles;
  // a jump to another place (keep = false) drops them.
  setOrigin(lat, lon, keep = false) {
    if (!keep) {
      for (const t of this.tiles.values()) this.drop(t);
      this.tiles.clear();
      this.queue = [];
    }
    this.k = Math.cos(lat * DEG);  // Mercator stretches distances by 1/cos(latitude)
    this.mx0 = R * lon * DEG;
    this.my0 = R * Math.log(Math.tan(Math.PI / 4 + lat * DEG / 2));
    for (const t of this.tiles.values()) this.place(t);
    for (const m of this.markers || []) this.place(m);
  }

  localOf(lat, lon) {
    const mx = R * lon * DEG, my = R * Math.log(Math.tan(Math.PI / 4 + lat * DEG / 2));
    return [(mx - this.mx0) * this.k, -(my - this.my0) * this.k];
  }

  place(t) {
    if (t.marker) {  // a runway, by its centre and direction
      const [x, z] = this.localOf(t.lat, t.lon);
      t.mesh.position.x = x; t.mesh.position.z = z;
      return;
    }
    const [x0, z0] = this.toLocal(t.u0, t.v0), [x1, z1] = this.toLocal(t.u1, t.v1);
    t.mesh.scale.set(x1 - x0, z1 - z0, 1);
    t.mesh.position.x = (x0 + x1) / 2; t.mesh.position.z = (z0 + z1) / 2;
  }

  // Runways drawn over the map at their real place; kept until the next flight is planned.
  setRunways(list) {
    for (const m of this.markers || []) { this.group.remove(m.mesh); m.mesh.material.dispose(); }
    this.markers = list.map(rw => {
      const mesh = new THREE.Mesh(UNIT, new THREE.MeshLambertMaterial({map: RUNWAY}));
      mesh.rotation.set(-Math.PI / 2, -rw.bearing, 0, "YXZ");  // flat, its length along the runway direction
      mesh.scale.set(45, rw.len, 1);
      this.group.add(mesh);
      const m = {marker: true, mesh, lat: (rw.from[0] + rw.to[0]) / 2, lon: (rw.from[1] + rw.to[1]) / 2};
      this.place(m);
      return m;
    });
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
    if (t.mesh.material.map) t.mesh.material.map.dispose();
    t.mesh.material.dispose();
  }

  update(x, z) {
    const [u, v] = this.toUnit(x, z), wanted = new Set();
    for (const {z: zoom, r, lift} of this.levels) {
      const n = 2 ** zoom, cx = Math.floor(u * n), cy = Math.floor(v * n);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const tx = ((cx + dx) % n + n) % n, ty = cy + dy;
        if (ty < 0 || ty >= n) continue;
        const key = zoom + "/" + tx + "/" + ty;
        wanted.add(key);
        if (this.tiles.has(key)) continue;
        const mesh = new THREE.Mesh(UNIT, new THREE.MeshLambertMaterial({color: "#ffffff", transparent: true, opacity: 0}));
        mesh.rotation.x = -Math.PI / 2;
        mesh.visible = false;
        this.group.add(mesh);
        const tile = {key, mesh, lift, u0: (cx + dx) / n, v0: ty / n, u1: (cx + dx + 1) / n, v1: (ty + 1) / n,
                      dist: Math.hypot(dx, dy) + lift * 0.1};  // nearest tiles load first, the coarse rings ahead of the fine rings
        this.place(tile);
        this.tiles.set(key, tile);
        this.queue.push(tile);
      }
    }
    for (const [key, t] of this.tiles) if (!wanted.has(key)) { this.drop(t); this.tiles.delete(key); }
    this.queue = this.queue.filter(t => this.tiles.get(t.key) === t).sort((a, b) => a.dist - b.dist);
    while (this.loading < 2 && this.queue.length && this.failed < 20) this.load(this.queue.shift());
    // Rings sit a little apart, so the finer rings draw over the coarser rings; the gap grows with height.
    const gap = Math.max(0.02, (this.alt + EYE) * 0.0008);
    for (const t of this.tiles.values()) {
      t.mesh.position.y = t.lift * gap;
      if (t.mesh.material.map && t.mesh.material.opacity < 1) t.mesh.material.opacity = Math.min(1, t.mesh.material.opacity + 0.05);
    }
    for (const m of this.markers || []) m.mesh.position.y = 4 * gap;
    this.group.position.set(-x, -(this.alt + EYE), -z);
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

    // Flight state. The position follows from the departure time, so a flight goes on in real time
    // while the tab sleeps or is closed; x and z are metres from the map origin.
    this.onArrive = () => {};  // (waypoint passed, next waypoint)
    this.onPhase = () => {};  // (phase name) TAKEOFF, CLIMB, CRUISE, DESCENT, APPROACH, LANDING, PARKED
    this.onLand = () => {};  // (logbook entry) once the aircraft stops at the destination
    this.travel = {x: 0, z: 0};  // distance flown, for the farmland under the map
    this.roll = 0; this.pitch = 0; this.heading = 0; this.alt = 0; this.speed = 0;
    this.osm.levels = GROUND_LEVELS;
    for (const s of this.clouds) {  // clouds at fixed heights: above on the ground, below at cruise
      s.userData.y = 1200 + rand() * 3800;
      s.position.set((rand() - 0.5) * CLOUDS, 0, (rand() - 0.5) * CLOUDS);
      const k = 700 + rand() * 1900;
      s.scale.set(k * 1.6, k, 1);
    }
  }

  get routeName() { return this.plan.name; }
  get cities() { return this.plan.cities; }
  get cityName() { return this.cities[this.leg][0]; }  // last waypoint passed
  get nextName() { return this.parked ? "PARKED" : this.cities[this.leg + 1][0]; }
  get destination() { return this.cities.at(-1)[0]; }
  get timeLeft() {  // seconds until the aircraft stops at the destination
    const end = this.phases.at(-1);
    return end && !this.plan.parked ? Math.max(0, end.t0 + end.dt - (Date.now() - this.plan.departed) / 1000) : 0;
  }

  // Fly a plan: {route, name, alt, speed, cities, start, departed, runways}. cities run from the
  // departure runway (or the present position, for a route joined in flight) to the arrival runway.
  // The same plan always gives the same flight, so a stored plan resumes exactly.
  load(plan) {
    this.plan = plan;
    this.path = prepare({cities: plan.cities});
    this.phases = profile(this.path.total, plan);
    this.osm.setRunways(plan.runways || []);
    const p = this.at(Date.now());
    Object.assign(this, {leg: p.leg, phase: p.phase, parked: p.phase === "PARKED", heading: p.heading, alt: p.alt, speed: p.speed,
                         lat: p.lat, lon: p.lon});
    this.osm.setOrigin(p.lat, p.lon);
    this.x = this.z = 0;
    if (this.parked) this.land_();  // a flight that ended while the page was closed is logged once
  }

  // Stand still at a place, before the first flight.
  park(name, lat, lon) {
    const [lat2, lon2] = destPoint([lat, lon], 0, 100);
    this.load({name, alt: 0, speed: 0, cities: [[name, lat, lon], [name, lat2, lon2]], departed: 0, parked: true});
  }

  // Where the aircraft is at a time: distance along the path from the phase it is in, and the height
  // and speed of that phase; after the rollout it stands at the end of the path.
  at(ms) {
    const t = Math.max(0, (ms - this.plan.departed) / 1000), ph = this.plan.parked ? null : this.phases.find(p => t < p.t0 + p.dt);
    let s = this.path.total, v = 0, h = 0, name = "PARKED", f = 1;
    if (ph) {
      const tau = t - ph.t0, len = ph.s1 - ph.s0, a = len ? (ph.v1 ** 2 - ph.v0 ** 2) / (2 * len) : 0;
      const ds = Math.min(len, Math.max(0, ph.v0 * tau + a * tau * tau / 2));
      f = len ? ds / len : 1;
      s = ph.s0 + ds; v = Math.max(0, ph.v0 + a * tau); h = lerp(ph.h0, ph.h1, f); name = ph.name;
    }
    const w = Math.max(150, Math.min(1500, v * 6));  // heading from a short chord around the point
    const p = pointAt(this.path, s), A = pointAt(this.path, Math.max(0, s - w)), B = pointAt(this.path, Math.min(this.path.total, s + w));
    return {...p, heading: bearing(A, B), alt: h, speed: v, phase: name, f, left: this.path.total - s};
  }

  land_() {
    const p = this.plan;
    if (!p.runways) return;  // standing still before the first flight
    const end = this.phases.at(-1);
    this.onLand({route: p.name, from: p.cities[0][0], to: this.destination, departed: p.departed,
                 arrived: p.departed + (end.t0 + end.dt) * 1000, km: Math.round(this.path.total / 1000)});
  }

  respawn(i, anywhere) {
    const x = (rand() - 0.5) * 14, y = -3 + rand() * 9, z = anywhere ? -2 - rand() * 40 : -42;
    this.drops.set([x, y, z, x - 0.05, y - 0.25, z + 0.9], i * 6);
  }

  setTarget(t) { Object.assign(this.target, t); }
  snap(t) { Object.assign(this.target, t); Object.assign(this.weather, t); }

  // Follow the plan exactly: position, height and speed come from the clock; bank from the turn rate;
  // pitch from the phase, with the rotation at lift-off and the flare before touchdown.
  fly(dt, time, still) {
    const p = this.at(Date.now()), turn = wrap(p.heading - this.heading) / Math.max(dt, 1e-3);
    if (p.leg > this.leg && p.leg + 1 < this.cities.length) this.onArrive(this.cities[p.leg][0], this.cities[p.leg + 1][0]);
    if (p.phase !== this.phase) {
      this.onPhase(p.phase);
      if (p.phase === "PARKED") this.land_();
    }
    Object.assign(this, {leg: p.leg, phase: p.phase, parked: p.phase === "PARKED", left: p.left, alt: p.alt, speed: p.speed});
    const airborne = p.alt > 1;
    const want = airborne ? Math.max(-0.5, Math.min(0.5, Math.atan(turn * this.speed / G))) : 0;
    this.roll += (want - this.roll) * (1 - Math.exp(-dt * 1.5));
    this.heading = p.heading;
    const f = p.f, PITCH = {
      TAKEOFF: f > 0.8 ? (f - 0.8) / 0.2 * 0.14 : 0, CLIMB: lerp(0.14, 0.05, f), CRUISE: 0.035, DESCENT: -0.01,
      APPROACH: f > 0.96 ? 0.045 + (f - 0.96) / 0.04 * 0.05 : 0.045, LANDING: f < 0.12 ? lerp(0.08, 0, f / 0.12) : 0, PARKED: 0,
    };
    const want2 = PITCH[p.phase] + (airborne && !still ? Math.sin(time * 0.11) * 0.006 : 0);
    this.pitch += (want2 - this.pitch) * (1 - Math.exp(-dt * 2));
    const d = this.speed * dt;
    this.travel.x += Math.sin(this.heading) * d;
    this.travel.z -= Math.cos(this.heading) * d;
    this.lat = p.lat; this.lon = p.lon;
    [this.x, this.z] = this.osm.localOf(this.lat, this.lon);
    if (Math.hypot(this.x, this.z) > RECENTRE) {  // move the map origin under the aircraft; loaded tiles stay
      this.osm.setOrigin(this.lat, this.lon, true);
      this.x = this.z = 0;
    }
  }

  update(dt, time, still) {
    this.fly(dt, time, still);
    const w = this.weather, k = still ? 1 : 1 - Math.exp(-dt * 0.8);
    for (const key of Object.keys(w)) w[key] = lerp(w[key], this.target[key], k);
    const fog = w.fog;
    const over = Math.min(1, w.clouds * w.clouds * 0.6 + w.rain), {top, horizon} = this.uniforms;
    top.value.copy(COL.top[0]).lerp(COL.top[1], over).lerp(COL.top[2], fog * 0.9).lerp(COL.top[3], w.night);
    horizon.value.copy(COL.horizon[0]).lerp(COL.horizon[1], over).lerp(COL.horizon[2], fog).lerp(COL.horizon[3], w.night);
    this.uniforms.below.value.copy(horizon.value).multiplyScalar(0.7);
    this.uniforms.sunAmount.value = (1 - over) * (1 - fog) * (1 - w.night);
    this.scene.fog.color.copy(horizon.value);
    // Haze thins with height: tens of kilometres of view near the ground, hundreds at cruise.
    const clear = lerp(4e-5, 5e-6, Math.min(1, this.alt / 10000));
    this.scene.fog.density = lerp(lerp(clear, clear * 3, w.rain), 1.3e-3, fog);
    this.hemi.intensity = lerp(lerp(1.4, 0.75, over), 0.06, w.night);
    this.sun.intensity = lerp(2.2 * (1 - over * 0.7), 0.03, w.night);
    this.stars.material.opacity = w.night * (1 - over) * (1 - fog);
    this.cloudMat.color.setRGB(1, 1, 1).lerp(new THREE.Color("#5c636b"), w.rain).lerp(new THREE.Color("#1a1d24"), w.night);
    this.rain.material.opacity = w.rain * 0.55;

    // The ground stays put and the aircraft moves over it; the farmland repeats under the map out to
    // the horizon. Map detail follows the height, with a margin so it does not switch back and forth.
    const k2 = Math.min(12, Math.max(1, (this.alt + 500) / 1000));
    this.base.scale.setScalar(k2);
    this.land.repeat.setScalar(REPEAT * k2);
    this.base.position.y = -(this.alt + EYE);
    this.land.offset.set(this.travel.x * REPEAT / BASE % 1, -this.travel.z * REPEAT / BASE % 1);
    const L = this.osm.levels;
    if (this.alt < 300) this.osm.levels = GROUND_LEVELS;
    else if (this.alt > 6000) this.osm.levels = HIGH_LEVELS;
    else if ((L === GROUND_LEVELS && this.alt > 600) || (L === HIGH_LEVELS && this.alt < 4000)) this.osm.levels = LEVELS;
    this.osm.alt = this.alt;
    this.osm.update(this.x, this.z);
    const fx = Math.sin(this.heading), fz = -Math.cos(this.heading), d = this.speed * dt, S = CLOUDS;
    const shown = Math.round(10 + w.clouds * 150);
    this.clouds.forEach((s, i) => {
      s.visible = i < shown;
      s.position.y = s.userData.y - this.alt - EYE;
      s.position.x -= fx * d;
      s.position.z -= fz * d;
      if (s.position.x * fx + s.position.z * fz < -S / 6) {  // passed behind: put it far ahead again
        const ahead = S * (0.8 + rand() * 0.2), side = (rand() - 0.5) * S;
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
