// WireClaude cockpit: review what Claude Code sends to Claude from a flight-simulator cockpit.
// The game shares no code with the swipe page; both read the same server data.
import * as THREE from "three";
import {C, loadFonts} from "./display.js";
import {kindOf, isError, target, KINDS} from "./doc.js";
import {ReviewDisplay} from "./review.js";
import {Eicas, NavDisplay, Standby, messages} from "./instruments.js";
import {Fms, FMS_KEYS} from "./fms.js";
import {SideDisplay} from "./side.js";
import {World, ROUTES, directRoute, destPoint, bearingOf, distanceOf, FINAL, ROLLOUT} from "./world.js";
import {Cabin, cabinEnvironment} from "./cabin.js";
import {Hud} from "./hud.js";

const post = async (path, body) => {
  const r = await fetch(path, {method: "POST", body: JSON.stringify(body)});
  if (!r.ok) throw new Error("server answered " + r.status);
  return r.json();
};
const get = async path => (await fetch(path)).json();

await loadFonts();

// ---- renderer, scene, aircraft ----
const renderer = new THREE.WebGLRenderer({antialias: true, logarithmicDepthBuffer: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
document.body.append(renderer.domElement);
renderer.domElement.tabIndex = 0;

const scene = new THREE.Scene(), aircraft = new THREE.Group();
scene.add(aircraft);
const camera = new THREE.PerspectiveCamera(60, 1, 0.02, 1.5e6);  // far enough for the map to the horizon at cruise
aircraft.add(camera);
const world = new World(scene, aircraft);
const hud = new Hud();
// Cabin lighting: reflections and soft light from a small room model, plus a warm dome light overhead.
scene.environment = cabinEnvironment(renderer);
const dome = new THREE.PointLight("#ffe2b8", 1.6, 4, 2);
dome.position.set(0, 1.75, 0.3);
aircraft.add(dome);
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- displays and cabin ----
const displays = {
  review: new ReviewDisplay(), eicas: new Eicas(), nd: new NavDisplay(), standby: new Standby(), side: new SideDisplay(),
  fms: new Fms(async (page, text) => page === "explain"
    ? (await post("/style", {style: text})).style
    : (await post("/watchlist", {watchlist: text})).watchlist),
};
const review = displays.review;
const cabin = new Cabin(aircraft, displays, {
  reviewKeys: [0, 1, 2, 3, 4].map(i => () => review.softKey(i, toggleZoom)),
  sideKeys: [0, 1, 2, 3, 4].map(i => () => displays.side.softKey(i)),
  fmsKeys: FMS_KEYS,
  checks: () => post("/pause", {paused: !state.paused}).then(poll),
  hold: () => post("/bash-before", {on: !state.bash_before}).then(poll),
  block: () => decide(false),
  trust: () => decide(true, true),
  send: () => decide(true),
  original: () => decide(true, false, true),
  fms: () => setView(view === "fms" ? "panel" : "fms"),
  side: () => setView(view === "side" ? "panel" : "side"),
  zoom: () => toggleZoom(),
  classic: () => { location.href = "/"; },
});
const B = cabin.b;

// ---- camera views: the pilot's seat, or close in front of a display ----
const VIEWS = {
  panel: {eye: new THREE.Vector3(0, 1.2, 0.15), look: new THREE.Vector3(0, 0.86, -0.9)},
  zoom: {mesh: cabin.mounts.review, w: 0.7, h: 0.53, down: 0.02},
  fms: {mesh: cabin.mounts.fmsUnit, w: 0.21, h: 0.3, down: 0.03},
  side: {mesh: cabin.mounts.side, w: 0.36, h: 0.47, down: 0.026},
};
let view = "panel", from = null, to = null, blend = 1, routeChosen = false;
function pose(name) {
  const v = VIEWS[name], m = new THREE.Matrix4();
  if (v.eye) return {pos: v.eye.clone(), quat: new THREE.Quaternion().setFromRotationMatrix(m.lookAt(v.eye, v.look, new THREE.Vector3(0, 1, 0)))};
  // In front of the object, far enough to fit it on screen, in aircraft space.
  v.mesh.updateWorldMatrix(true, false);
  const inv = new THREE.Matrix4().copy(aircraft.matrixWorld).invert(), local = new THREE.Matrix4().multiplyMatrices(inv, v.mesh.matrixWorld);
  const center = new THREE.Vector3(0, -v.down, 0).applyMatrix4(local);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(local), up = new THREE.Vector3(0, 1, 0).transformDirection(local);
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(v.h / (2 * t), v.w / (2 * t * camera.aspect)) * 1.04;
  const eye = center.clone().addScaledVector(normal, dist);
  return {pos: eye, quat: new THREE.Quaternion().setFromRotationMatrix(m.lookAt(eye, center, up))};
}
function setView(name, instant = false) {
  if (name !== "fms") routeChosen = true;  // leaving the start prompt keeps the route
  from = {pos: camera.position.clone(), quat: camera.quaternion.clone()};
  view = name;
  to = pose(name);
  blend = still || instant ? 1 : 0;
  if (blend === 1) { scene.updateMatrixWorld(true); requestAnimationFrame(fitDisplays); }
  review.zoomed = name === "zoom";
  review.dirty = true;
  displays.fms.active = displays.fms.animated = name === "fms";  // the cursor blinks only while in use
  displays.fms.dirty = true;
  for (const [k, b] of [["fms", B.fms], ["side", B.side], ["zoom", B.zoom]]) b.set({active: view === k});
}
function toggleZoom() { autoZoomed = false; setView(view === "zoom" ? "panel" : "zoom"); }

// Each display's canvas follows its size on screen, so text is sharp at every distance.
function fitDisplays() {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), H = renderer.domElement.height;
  for (const d of Object.values(displays)) {
    const g = d.mesh.geometry.parameters;
    a.set(0, g.height / 2, 0); b.set(0, -g.height / 2, 0);
    d.mesh.localToWorld(a).project(camera);
    d.mesh.localToWorld(b).project(camera);
    d.fit(Math.abs(a.y - b.y) / 2 * H);
  }
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  hud.resize(innerWidth, innerHeight);
  const p = pose(view);
  camera.position.copy(p.pos);
  camera.quaternion.copy(p.quat);
  from = to = null;
  blend = 1;
  scene.updateMatrixWorld(true);
  fitDisplays();
}
addEventListener("resize", resize);
resize();
// ---- routes: chosen on the FMS at the start, and with R or the ROUTE key at any time ----
// The flight in progress is stored as its plan (runways, waypoints, departure time). Its position
// follows from the clock, so a flight chosen in the morning lands in the evening even across reloads
// and closed tabs.
const fms = displays.fms, now = () => performance.now() / 1000;
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const saved = read("flight", null), resumed = saved && Array.isArray(saved.cities) ? saved : null;
let storedPlan = null;
fms.routes = ROUTES;
world.onLand = entry => {  // a finished flight goes into the logbook once
  const log = read("logbook", []);
  if (!log.some(e => e.departed === entry.departed)) {
    log.push(entry);
    localStorage.setItem("logbook", JSON.stringify(log));
    hud.notice("ARRIVED IN " + entry.to + ": " + entry.route + ", " + entry.km + " KM. LOGGED ON THE SIDE DISPLAY", C.green, now(), 12);
  }
  displays.side.setLogbook(log);
};
displays.side.setLogbook(read("logbook", []));
world.onArrive = (city, next) => hud.notice("OVER " + city + ", NEXT " + next + ". R CHANGES THE ROUTE", C.cyan, now(), 6);
const feet = m => Math.round(m * 3.281 / 100) * 100;
world.onPhase = phase => {
  const text = {
    TAKEOFF: "TAKEOFF FROM " + world.cities[0][0], CLIMB: "CLIMBING TO " + feet(world.plan.alt) + " FT",
    CRUISE: "CRUISING AT " + feet(world.alt) + " FT TO " + world.destination, DESCENT: "DESCENDING INTO " + world.destination,
    APPROACH: "FINAL APPROACH: " + world.cities.at(-2)[0], LANDING: "TOUCHDOWN IN " + world.destination,
  }[phase];
  if (text) hud.notice(text, C.cyan, now(), 6);
};
if (resumed) { world.load(resumed); storedPlan = resumed; fms.route = resumed.route ?? -1; }
else world.park(ROUTES[0].cities[0][0], ROUTES[0].cities[0][1], ROUTES[0].cities[0][2]);  // before the first flight
fms.flying = world.parked ? "" : world.routeName + ", NEXT " + world.nextName;
fms.onContinue = () => setView("panel");
fms.onRoute = i => { fms.route = i; plan(ROUTES[i], i); };

// ---- flight planning: real runways from OpenStreetMap, and no shortcuts ----
// The very first flight starts at its origin airport. After that, a flight departs from the airport
// where the aircraft stands (over the route's origin, if that is somewhere else); in the air, it
// leaves the present position for the route's next waypoints.
const deg = Math.PI / 180, wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
async function runway(place, want, radius) {  // the runway near [lat, lon] best lined up with direction want
  const number = b => String(Math.round(((b / deg) % 360 + 360) % 360 / 10) % 36 || 36).padStart(2, "0");
  const synthetic = () => ({name: number(want), from: destPoint(place, want + Math.PI, 1500), to: destPoint(place, want, 1500), bearing: want, len: 3000});
  try {
    const q = "[out:json][timeout:10];way[\"aeroway\"=\"runway\"](around:" + radius + "," + place[0] + "," + place[1] + ");out geom;";
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 9000);
    const data = await (await fetch("https://overpass-api.de/api/interpreter", {method: "POST", body: "data=" + encodeURIComponent(q), signal: stop.signal})).json();
    const ways = data.elements.filter(e => e.geometry && e.geometry.length > 1).map(e => ({
      a: [e.geometry[0].lat, e.geometry[0].lon], b: [e.geometry.at(-1).lat, e.geometry.at(-1).lon], ref: (e.tags && e.tags.ref) || ""}));
    if (!ways.length) return synthetic();
    const mid = w => [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    const nearest = ways.reduce((m, w) => (distanceOf(place, mid(w)) < distanceOf(place, mid(m)) ? w : m));
    const best = ways.filter(w => distanceOf(mid(w), mid(nearest)) < 6000)  // runways of the nearest airport
      .flatMap(w => [[w.a, w.b, w.ref], [w.b, w.a, w.ref]]).map(([from, to, ref]) => ({from, to, ref, bearing: bearingOf(from, to)}))
      .reduce((m, c) => (Math.abs(wrapAngle(c.bearing - want)) < Math.abs(wrapAngle(m.bearing - want)) ? c : m));
    // The OSM name uses magnetic headings; take the part of "04L/22R" closest to the true direction.
    const part = best.ref.split("/").map(p => [p, Math.abs(wrapAngle(parseInt(p, 10) * 10 * deg - best.bearing))]).sort((x, y) => x[1] - y[1])[0];
    return {name: part && part[1] < 35 * deg ? part[0] : number(best.bearing), from: best.from, to: best.to, bearing: best.bearing,
            len: distanceOf(best.from, best.to)};
  } catch {
    return synthetic();
  }
}
let planning = 0;
async function plan(route, index = null) {
  const ticket = ++planning, direct = index === null, ll = p => [p[1], p[2]];
  const firstFlight = !world.plan.runways, airborne = !world.parked && world.phase !== "TAKEOFF" && world.alt > 1;
  const origin = route.cities[0], dest = route.cities.at(-1);
  let mid = route.cities.slice(1, -1), depAt = null, depName = origin[0];
  if (!airborne && firstFlight) depAt = ll(origin);
  else if (!airborne) {
    depAt = [world.lat, world.lon];
    depName = world.destination;
    if (distanceOf(depAt, ll(origin)) > 30000) mid = [origin, ...mid];  // fly to the route's origin first
  }
  routeChosen = true;
  setView("panel");
  hud.notice(airborne ? "NEW ROUTE " + route.name + ": LOOKING UP THE ARRIVAL RUNWAY" : "ROUTE " + route.name + ": LOOKING UP RUNWAYS", C.cyan, now(), 8);
  const here = airborne ? [world.lat, world.lon] : depAt, after = mid.length ? ll(mid[0]) : ll(dest);
  const dep = airborne ? null : await runway(depAt, bearingOf(depAt, after), firstFlight && !direct ? 6000 : 30000);
  const arr = await runway(ll(dest), bearingOf(mid.length ? ll(mid.at(-1)) : here, ll(dest)), direct ? 30000 : 6000);
  if (ticket !== planning) return;  // a newer choice won
  const cities = airborne ? [["PRESENT POSITION", world.lat, world.lon]]
    : [["RWY " + dep.name + " " + depName, ...dep.from], ["CLIMB OUT", ...destPoint(dep.to, dep.bearing, 6000)]];
  cities.push(...mid, ["FINAL " + arr.name, ...destPoint(arr.from, arr.bearing + Math.PI, FINAL)],
              ["RWY " + arr.name + " " + dest[0], ...arr.from], [dest[0], ...destPoint(arr.from, arr.bearing, ROLLOUT)]);
  world.load({route: index, name: route.name, alt: route.alt, speed: route.speed, cities,
              start: airborne ? {alt: world.alt, speed: world.speed} : null, departed: Date.now(), runways: [dep, arr].filter(Boolean)});
  hud.notice(airborne ? "NEW ROUTE " + route.name : "CLEARED FOR TAKEOFF, RUNWAY " + dep.name + ": " + route.name, C.green, now(), 8);
}
// DIRECT flights: places by name through OpenStreetMap's Nominatim search (a lookup each time a field
// is set, well within its limit of a request a second), or typed as "lat lon".
fms.geocode = async text => {
  const m = /^\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (m) return [text.toUpperCase(), Number(m[1]), Number(m[2])];
  const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(text));
  const [hit] = await r.json();
  return hit ? [(hit.name || hit.display_name.split(",")[0]).toUpperCase(), Number(hit.lat), Number(hit.lon)] : null;
};
fms.describe = (from, to) => {
  const r = directRoute(from, to), d = r.cities.slice(1).reduce((s, p, i) => {
    const [, a, b] = r.cities[i], rad = Math.PI / 180;
    return s + 6371 * Math.acos(Math.min(1, Math.sin(a * rad) * Math.sin(p[1] * rad) + Math.cos(a * rad) * Math.cos(p[1] * rad) * Math.cos((p[2] - b) * rad)));
  }, 0), h = d * 1000 / r.speed / 3600;
  return Math.round(d) + " KM  " + Math.floor(h) + "H" + String(Math.round(h % 1 * 60)).padStart(2, "0") + (r.alt > 5000 ? "  CRUISE" : "  LOW LEVEL");
};
fms.onDirect = (from, to) => { fms.route = -1; plan(directRoute(from, to)); };
function askRoute() {
  fms.page = "route";
  fms.dirty = true;
  setView("fms");
}

if (VIEWS[location.hash.slice(1)]) setView(location.hash.slice(1), true);  // /cockpit#fms opens a view directly
else {  // ask for the route before take-off
  fms.page = "route";
  setView("fms", true);
  hud.notice(resumed ? "IN FLIGHT: " + world.routeName + ". CONTINUE> OR ESC FLIES ON, OR CHOOSE A NEW ROUTE"
                     : "CHOOSE A ROUTE: LEFT KEYS BESIDE THE FMS OR 1 TO 5; PREV AND NEXT FOR MORE", C.cyan, 0, 20);
}

// ---- data from the server ----
let state = {pending: [], history: [], paused: false, bash_before: false, totals: {}};
let current = null, deciding = false, historyKey = null, spokenKey = "", firstState = true, shownId = null, autoZoomed = false;

function weather(next, paused) {
  const night = paused ? 1 : 0;
  if (!next) return [{clouds: 0.15, fog: 0, rain: 0, night}, paused ? "NIGHT" : "CLEAR"];
  if (isError(next)) return [{clouds: 1, fog: 0.15, rain: 1, night}, "STORM"];
  if (next.findings && next.findings.length) return [{clouds: 0.4, fog: 1, rain: 0, night}, "FOG"];
  if (["web", "mcp"].includes(kindOf(next))) return [{clouds: 0.85, fog: 0, rain: 0, night}, "OVERCAST"];
  return [{clouds: 0.4, fog: 0, rain: 0, night}, "SCATTERED"];
}

function apply(s) {
  state = s;
  const next = s.pending[0] || null, n = s.pending.length, t = s.totals || {};
  if (!deciding) current = next;
  review.show(current, n, s.paused);
  // A new item zooms in from the seat; when the queue empties, the camera goes back to the seat.
  // The FMS and side views are left alone, so typing or reading there is never interrupted.
  const id = next && next.id;
  // Wait for a camera move to finish, then zoom in on the next card; only from the seat or the zoom.
  if (id !== shownId && blend >= 1 && (view === "panel" || view === "zoom")) {
    if (next && view === "panel") { setView("zoom"); autoZoomed = true; }
    else if (!next && view === "zoom" && autoZoomed) setView("panel");
    shownId = id;
  }
  const [wx, wxName] = weather(next, s.paused);
  if (firstState) world.snap(wx); else world.setTarget(wx);  // the first data sets the weather at once
  firstState = false;
  displays.eicas.set([n, t.sent || 0, t.blocked || 0, t.auto || 0], messages(s, next, wxName));
  displays.nd.queue = s.pending;
  displays.nd.wx = [wx.clouds, wx.fog, wx.rain];
  displays.nd.wxName = wxName;
  const hk = s.history.map(i => i.id).join();
  if (hk !== historyKey) { historyKey = hk; displays.side.setHistory(s.history); }

  const has = !!next, err = isError(next), cleanable = !!(next && next.cleanable);
  B.send.set({lines: cleanable ? ["SEND", "CLEANED"] : ["SEND"], color: "green", lit: has && !err, enabled: has && !err});
  B.block.set({color: "red", lit: has, enabled: has});
  B.trust.set({color: "cyan", lit: !!(next && next.site), enabled: !!(next && next.site)});
  B.original.set({color: "amber", lit: cleanable || err, enabled: cleanable || err});
  B.checks.set({lines: ["CHECKS", s.paused ? "OFF" : "ON"], color: s.paused ? "amber" : "green"});
  B.hold.set({lines: ["BASH HOLD", s.bash_before ? "ON" : "OFF"], color: s.bash_before ? "green" : "white"});
  B.warning.set({lines: ["MASTER", "WARN"], color: "red", lit: err});
  B.caution.set({lines: ["MASTER", "CAUTION"], color: "amber", lit: (!!(next && next.findings && next.findings.length) && !err) || s.paused});

  document.title = (s.paused ? "[OFF] " : "") + (n ? "(" + n + ") " : "") + "WireClaude cockpit";
  const spoken = next ? `${n} waiting. ${KINDS[kindOf(next)][0]}: ${target(next)}. ` +
    (next.findings && next.findings.length ? next.findings.length + " findings. " : "") +
    (err ? "Error: press O to send it unchanged, or N to block it." : "Press Y to send, N to block.")
    : "No items waiting.";
  if (spoken !== spokenKey) { spokenKey = spoken; document.getElementById("spoken").textContent = spoken; }
}

async function poll() {
  if (deciding) return;
  try { apply(await get("/state")); } catch (e) { hud.notice("NO CONNECTION TO THE WIRECLAUDE SERVER", C.amber, clock); }
}
async function loadAccess() {
  try { displays.side.setAccess(await get("/access")); } catch {}
}
async function loadSettings() {
  const [style, watch] = await Promise.all([get("/style"), get("/watchlist")]);
  displays.fms.load({style: style.style, defaultStyle: style.default, watchlist: watch.watchlist, detectors: watch.detectors});
}

// With findings, SEND sends the cleaned version and ORIGINAL keeps the findings.
// An error cannot be cleaned, so it goes only through ORIGINAL.
async function decide(approve, trust = false, unchanged = false) {
  const item = current;
  if (!item || deciding) return;
  if (trust && !item.site) return hud.notice("TRUST SITE WORKS ONLY FOR WEB RESULTS", C.amber, clock);
  if (approve && !unchanged && isError(item)) return hud.notice("AN ERROR CANNOT BE CLEANED: SEND ORIGINAL OR BLOCK", C.amber, clock);
  if (unchanged && !item.cleanable && !isError(item)) return;
  deciding = true;
  const text = !approve ? "BLOCKED" : trust ? "SENT, SITE TRUSTED" : unchanged ? "SENT ORIGINAL" : item.cleanable ? "SENT CLEANED" : "SENT";
  review.banner(text, approve ? C.green : C.red, clock);
  if (view === "zoom" && autoZoomed) setView("panel");  // back to the seat; the next card zooms in again
  try {
    await post("/decide", {id: item.id, approve, trust, clean: approve && !unchanged && !!item.cleanable});
  } catch (e) {
    hud.notice("DECISION NOT SENT: " + e.message, C.red, clock);
  }
  setTimeout(() => {
    deciding = false;
    current = null;
    poll();
    if (trust) loadAccess();
  }, 450);
}

// ---- input ----
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
// In the seat, the head follows the mouse a little, so the cabin shows its depth.
const look = new THREE.Vector2(), head = new THREE.Vector2(), turn = new THREE.Quaternion(), euler = new THREE.Euler();
function pick(e) {
  pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(cabin.group, true).find(h => !h.object.userData.ignore);
  if (!hit) return null;
  const o = hit.object;
  if (o.userData.button) return {button: o.userData.button};
  if (o.userData.display) {
    const d = o.userData.display;
    return {display: d, x: hit.uv.x * d.lw, y: (1 - hit.uv.y) * d.lh};
  }
  return null;
}
renderer.domElement.addEventListener("pointermove", e => {
  const p = pick(e);
  const clickable = p && (p.button ? p.button.state.enabled : p.display.hover(p.x, p.y));
  renderer.domElement.style.cursor = clickable ? "pointer" : "default";
  look.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
});
renderer.domElement.addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  renderer.domElement.focus();
  if (hud.help.mesh.visible) return hud.toggleHelp();
  const p = pick(e);
  if (!p) return;
  if (p.button) p.button.press();
  else if (p.display === displays.fms && view !== "fms") setView("fms");
  else if (p.display === displays.side && view !== "side") setView("side");
  else p.display.pointer(p.x, p.y);
});
renderer.domElement.addEventListener("dblclick", e => { const p = pick(e); if (p && p.display === review) toggleZoom(); });
renderer.domElement.addEventListener("wheel", e => {
  const p = pick(e);
  const d = p && p.display ? p.display : view === "side" ? displays.side : review;
  d.wheel(e.deltaY * (e.deltaMode === 1 ? 30 : 1.4));
  e.preventDefault();
}, {passive: false});

addEventListener("keydown", e => {
  if (view === "fms") {
    if (e.key === "Escape") { setView("panel"); e.preventDefault(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;  // keep browser shortcuts and paste
    if (displays.fms.key(e)) e.preventDefault();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const scrolled = view === "side" ? displays.side : review;
  const act = {
    ArrowRight: () => decide(true), Enter: () => decide(true), y: () => decide(true),
    ArrowLeft: () => decide(false), n: () => decide(false),
    ArrowUp: () => decide(true, true), t: () => decide(true, true),
    o: () => decide(true, false, true),
    PageDown: () => scrolled.wheel(900), PageUp: () => scrolled.wheel(-900), " ": () => scrolled.wheel(900),
    Home: () => scrolled.wheel(-1e9), End: () => scrolled.wheel(1e9),
    v: () => review.cycleView(), z: toggleZoom, f: () => setView("fms"), s: () => setView("side"), r: askRoute,
    Escape: () => (hud.help.mesh.visible ? hud.toggleHelp() : setView("panel")),
    h: () => hud.toggleHelp(), "?": () => hud.toggleHelp(),
  }[key];
  if (act) { e.preventDefault(); act(); }
});
addEventListener("paste", e => {
  if (view !== "fms") return;
  displays.fms.paste(e.clipboardData.getData("text"));
  e.preventDefault();
});

// ---- flight and frame loop ----
let clock = 0;
renderer.setAnimationLoop(ms => {
  const time = ms / 1000, dt = Math.min(0.05, time - clock || 0.016);
  clock = time;
  world.update(dt, time, still);
  // The autopilot banks to circle the city; a storm adds a little turbulence. Reduced motion: wings level.
  const rain = world.weather.rain;
  const roll = still ? 0 : world.roll + Math.sin(time * 6.7) * 0.004 * rain;
  const pitch = world.pitch + (still ? 0 : Math.sin(time * 4.3) * 0.003 * rain);
  aircraft.rotation.set(pitch, -world.heading, -roll, "YXZ");
  cabin.setRain(rain);
  cabin.animate(dt);
  displays.standby.roll = roll;
  displays.standby.pitch = pitch * 57.3;
  displays.nd.heading = world.heading;
  displays.nd.city = world.cityName;
  displays.nd.next = world.nextName;
  displays.nd.route = world.routeName;
  displays.nd.flight = {speed: world.speed, alt: world.alt, left: world.left, to: world.destination, phase: world.phase,
                        timeLeft: world.timeLeft};
  if (world.plan !== storedPlan && !world.plan.parked) {  // a new flight: remember its plan for reloads
    storedPlan = world.plan;
    localStorage.setItem("flight", JSON.stringify(world.plan));
  }
  fms.flying = world.parked ? "" : world.routeName + ", NEXT " + world.nextName;
  if (to && blend < 1) {
    blend = Math.min(1, blend + dt / 0.55);
    const k = blend * blend * (3 - 2 * blend);
    camera.position.lerpVectors(from.pos, to.pos, k);
    camera.quaternion.slerpQuaternions(from.quat, to.quat, k);
    if (blend === 1) { scene.updateMatrixWorld(true); fitDisplays(); }
  } else if (to) {
    head.lerp(view === "panel" && !still ? look : new THREE.Vector2(), 1 - Math.exp(-dt * 4));
    camera.position.copy(to.pos).add(new THREE.Vector3(head.x * 0.05, -head.y * 0.025, 0));
    camera.quaternion.copy(to.quat).multiply(turn.setFromEuler(euler.set(-head.y * 0.08, -head.x * 0.12, 0)));
  }
  scene.environmentIntensity = 1 - 0.8 * world.weather.night;
  for (const d of Object.values(displays)) d.update(time);
  hud.update(time);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(hud.scene, hud.camera);
});

setInterval(poll, 1000);
setInterval(loadAccess, 15000);
poll();
loadAccess();
loadSettings().catch(() => hud.notice("SETTINGS NOT LOADED", C.amber, clock));
renderer.domElement.focus();
