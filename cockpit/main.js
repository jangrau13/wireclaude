// WireClaude cockpit: review what Claude Code sends to Claude from a flight-simulator cockpit.
// The game shares no code with the swipe page; both read the same server data.
import * as THREE from "three";
import {C, loadFonts} from "./display.js";
import {kindOf, isError, target, KINDS} from "./doc.js";
import {ReviewDisplay} from "./review.js";
import {Eicas, NavDisplay, Standby, messages} from "./instruments.js";
import {Fms, FMS_KEYS} from "./fms.js";
import {SideDisplay} from "./side.js";
import {World} from "./world.js";
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
const camera = new THREE.PerspectiveCamera(60, 1, 0.02, 60000);
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
let view = "panel", from = null, to = null, blend = 1;
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
function toggleZoom() { setView(view === "zoom" ? "panel" : "zoom"); }

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
if (VIEWS[location.hash.slice(1)]) setView(location.hash.slice(1), true);  // /cockpit#fms opens a view directly

// ---- data from the server ----
let state = {pending: [], history: [], paused: false, bash_before: false, totals: {}};
let current = null, deciding = false, historyKey = null, spokenKey = "", firstState = true;

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
    v: () => review.cycleView(), z: toggleZoom, f: () => setView("fms"), s: () => setView("side"),
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
