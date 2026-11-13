// The cabin, modelled in 3D: main panel with three displays and a standby instrument, a curved glare
// shield with lit push buttons, windshield frame, overhead panel, side console with the side display,
// pedestal with the FMS and thrust levers, and a sidestick.
// Positions are metres in aircraft space: x right, y up, -z forward; the pilot's eye is at (0, 1.2, 0.15).
import * as THREE from "three";
import {font} from "./display.js";

// Fine grain for painted metal, the textured glare shield and the cabin lining.
function grain(size, contrast) {
  const c = new OffscreenCanvas(size, size), g = c.getContext("2d"), img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * contrast;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  return t;
}
const FINE = grain(128, 60), COARSE = grain(64, 160);
const mat = (color, roughness = 0.7, metalness = 0.1, bump = null, bumpScale = 0.4) =>
  new THREE.MeshStandardMaterial({color, roughness, metalness, bumpMap: bump, bumpScale});
const PANEL = mat("#4a5159", 0.72, 0.12, FINE, 0.25), SHIELD = mat("#1d1f22", 0.95, 0, COARSE, 1.2),
      BEZEL = mat("#2b2e33", 0.45, 0.3), FRAME = mat("#3b4148", 0.6, 0.2, FINE, 0.2), TRIM = mat("#626a73", 0.5, 0.3),
      KEYCAP = mat("#24272b", 0.45, 0.2), LINING = mat("#8b8f93", 0.9, 0, COARSE, 0.6), METAL = mat("#9aa1a8", 0.3, 0.8),
      RUBBER = mat("#121314", 0.9, 0, FINE, 0.5);

// Printed white lettering on the panel, like the placards beside real instruments.
function placard(text, w) {  // w metres wide, an eighth of that tall
  const c = new OffscreenCanvas(1024, 128), g = c.getContext("2d");
  g.font = font(84, true);
  g.fillStyle = "#e8eaec";
  g.textAlign = "center";
  g.fillText(text, 512, 96);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshStandardMaterial({map: t, transparent: true, roughness: 0.8}));
  m.userData.ignore = true;
  return m;
}

// A rounded, bevelled slab: w x h, d deep, centred, front face toward +z.
function slab(w, h, d, r, material, bevel = 0.004) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, {depth: d - 2 * bevel, bevelEnabled: true, bevelThickness: bevel,
                                          bevelSize: bevel, bevelSegments: 3, curveSegments: 6});
  g.translate(0, 0, -d / 2 + bevel);
  return new THREE.Mesh(g, material);
}
function at(mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}
function beam(a, b, t, material) {  // a rounded bar between two points
  const dir = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CapsuleGeometry(t / 2, dir.length() - t, 4, 8), material);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

// ---- lit push buttons with a printed legend ----
const COLORS = {white: "#f2f4f6", green: "#3ddc84", amber: "#ffb020", red: "#ff4136", cyan: "#3fd6ff"};
export class Button {
  constructor(w, h, lines, onPress, px = 160) {  // px: legend canvas height
    this.canvas = new OffscreenCanvas(Math.round(px * w / h), px);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.face = new THREE.MeshStandardMaterial({map: this.texture, emissiveMap: this.texture, emissive: "#ffffff",
                                                emissiveIntensity: 0.9, roughness: 0.35});
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.016), [KEYCAP, KEYCAP, KEYCAP, KEYCAP, this.face, KEYCAP]);
    this.mesh.userData.button = this;
    this.onPress = onPress;
    this.state = {lines, color: "white", lit: true, enabled: true, active: false};
    this.key = "";
    this.depth = 0;
    this.base = 0;
    this.redraw();
  }

  set(state) {
    const next = {...this.state, ...state};
    if (JSON.stringify(next) === this.key) return;
    this.state = next;
    this.redraw();
  }

  redraw() {
    const {lines, color, lit, enabled, active} = this.state, c = this.canvas.getContext("2d");
    const W = this.canvas.width, H = this.canvas.height, e = H / 32;
    this.key = JSON.stringify(this.state);
    c.fillStyle = "#141518"; c.fillRect(0, 0, W, H);
    c.strokeStyle = active ? COLORS.cyan : "#30343a"; c.lineWidth = active ? e * 2 : e; c.strokeRect(e, e, W - 2 * e, H - 2 * e);
    const on = lit && enabled;
    c.textAlign = "center";
    lines.forEach((text, i) => {
      const n = lines.length, size = H * (n > 1 ? 0.29 : 0.36);
      c.font = font(size, true);
      // a split legend: the first line names the function, the second shows its state in colour
      c.fillStyle = !on ? "#3d4146" : n > 1 && i === 0 ? COLORS.white : COLORS[color];
      c.fillText(text, W / 2, H / 2 + (i - (n - 1) / 2) * size * 1.05 + size * 0.35);
    });
    this.texture.needsUpdate = true;
    this.face.emissiveIntensity = on ? 0.9 : 0.2;
  }

  press() {
    if (!this.state.enabled) return;
    this.depth = 1;
    this.onPress();
  }

  animate(dt) {
    if (!this.depth) return;
    this.depth = Math.max(0, this.depth - dt * 6);
    this.mesh.position.z = this.base - 0.005 * Math.sin(this.depth * Math.PI);
  }
}
const keycap = (w, h) => new Button(w, h, [""], () => {}, 64);  // blank: the display draws its label

// Thin glass over a screen: reflects the cabin, never catches clicks.
function glassOver(w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    color: "#000000", roughness: 0.08, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false}));
  m.userData.ignore = true;
  return m;
}

export class Cabin {
  constructor(aircraft, displays, actions) {
    const g = this.group = new THREE.Group();
    aircraft.add(g);
    this.buttons = [];
    this.mounts = {};
    const place = (button, parent, x, y, z) => {
      button.mesh.position.set(x, y, z);
      button.base = z;
      parent.add(button.mesh);
      this.buttons.push(button);
      return button;
    };

    // ---- main panel, tilted back; displays in raised bezels ----
    const panel = at(new THREE.Group(), 0, 0.62, -0.80, -0.2);
    g.add(panel);
    panel.add(at(slab(2.24, 0.64, 0.07, 0.03, PANEL), 0, -0.02, -0.035));
    const mount = (display, w, h, x, y, keys) => {
      const extra = keys ? 0.07 : 0.035;
      panel.add(at(slab(w + 0.045, h + extra, 0.026, 0.012, BEZEL), x, y - (keys ? 0.0175 : 0), 0.013));
      const screen = display.makeMesh(w, h);
      screen.position.set(x, y, 0.0265);
      panel.add(screen, at(glassOver(w, h), x, y, 0.028));
      if (keys) keys.forEach((fn, i) => {
        const b = keycap(0.07, 0.016);
        b.onPress = fn;
        place(b, panel, x + w * ((i + 0.5) / 5 - 0.5), y - h / 2 - 0.026, 0.03);
      });
      return screen;
    };
    this.mounts.review = mount(displays.review, 0.64, 0.44, 0, 0.02, actions.reviewKeys);
    this.mounts.eicas = mount(displays.eicas, 0.30, 0.367, -0.53, 0.03);
    this.mounts.nd = mount(displays.nd, 0.30, 0.367, 0.53, 0.03);
    this.mounts.standby = mount(displays.standby, 0.1, 0.1, 0.84, 0.1);
    for (const [text, x, y, w] of [["EICAS", -0.53, 0.245, 0.12], ["REVIEW", 0, 0.268, 0.14], ["NAV", 0.53, 0.245, 0.1],
                                   ["STBY ATT", 0.84, 0.175, 0.1]])
      panel.add(at(placard(text, w), x, y, 0.002));
    for (const x of [-0.84, 0.84]) for (const y of [-0.28, 0.24])  // panel fasteners
      panel.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 12), METAL), x, y, 0.002, Math.PI / 2));

    // ---- glare shield: a curved profile run across the cabin, buttons on its face ----
    const prof = new THREE.Shape();
    prof.moveTo(-1.12, 0.9); prof.lineTo(-1.12, 0.99); prof.lineTo(-0.88, 1.0);
    prof.quadraticCurveTo(-0.8, 1.0, -0.795, 0.965); prof.lineTo(-0.795, 0.912);
    prof.quadraticCurveTo(-0.8, 0.9, -0.83, 0.9); prof.lineTo(-1.12, 0.9);
    const shieldGeo = new THREE.ExtrudeGeometry(prof, {depth: 2.36, bevelEnabled: false, curveSegments: 10});
    shieldGeo.rotateY(-Math.PI / 2);
    shieldGeo.translate(1.18, 0, 0);
    g.add(new THREE.Mesh(shieldGeo, SHIELD));
    const face = at(new THREE.Group(), 0, 0.938, -0.795);
    g.add(face);
    const B = (x, w, lines, fn) => {  // a button in its own bevelled housing
      face.add(at(slab(w + 0.01, 0.046, 0.008, 0.005, BEZEL), x, 0, 0.004));
      return place(new Button(w, 0.036, lines, fn), face, x, 0, 0.012);
    };
    this.b = {
      // kept within about 0.8 m of the centre, so a 16:10 screen shows every button from the seat
      warning: B(-0.765, 0.085, ["MASTER", "WARN"], () => {}),
      caution: B(-0.67, 0.085, ["MASTER", "CAUTION"], () => {}),
      checks: B(-0.52, 0.095, ["CHECKS", "ON"], actions.checks),
      hold: B(-0.415, 0.095, ["BASH HOLD", "ON"], actions.hold),
      block: B(-0.195, 0.115, ["BLOCK"], actions.block),
      trust: B(-0.065, 0.115, ["TRUST", "SITE"], actions.trust),
      send: B(0.065, 0.115, ["SEND"], actions.send),
      original: B(0.195, 0.115, ["SEND", "ORIGINAL"], actions.original),
      fms: B(0.415, 0.085, ["FMS"], actions.fms),
      side: B(0.51, 0.085, ["SIDE"], actions.side),
      zoom: B(0.605, 0.085, ["ZOOM"], actions.zoom),
      classic: B(0.735, 0.11, ["SWIPE", "VIEW"], actions.classic),
    };
    face.add(at(slab(0.56, 0.05, 0.006, 0.006, TRIM), 0, 0, 0.001));  // decision panel plate behind the four buttons

    // ---- windshield frame and overhead ----
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    g.add(beam(v(0, 0.99, -1.08), v(0, 1.5, -0.96), 0.05, FRAME));
    for (const s of [-1, 1]) {
      g.add(beam(v(s * 1.1, 0.98, -1.02), v(s * 0.98, 1.52, -0.9), 0.1, FRAME));  // front pillars
      g.add(beam(v(s * 1.16, 0.98, -0.25), v(s * 1.08, 1.58, -0.3), 0.08, FRAME));  // side window pillars
      g.add(at(slab(0.06, 0.28, 0.02, 0.01, FRAME), s * 1.14, 1.0, -0.62, 0, s * Math.PI / 2));  // side window sill
    }
    g.add(beam(v(-1.15, 1.53, -0.93), v(1.15, 1.53, -0.93), 0.08, FRAME));
    const overhead = at(new THREE.Group(), 0, 1.68, -0.5, 0.75);
    g.add(overhead);
    overhead.add(slab(1.3, 0.8, 0.06, 0.03, PANEL));
    for (let i = 0; i < 24; i++)  // rows of overhead switches, for depth; not used
      overhead.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.02), KEYCAP), -0.5 + (i % 12) * 0.09, -0.15 - Math.floor(i / 12) * 0.12, 0.035));
    g.add(at(slab(2.7, 1.9, 0.05, 0.05, LINING), 0, 1.86, -0.1, Math.PI / 2));  // ceiling
    this.glass = new THREE.MeshBasicMaterial({map: dropsTexture(), transparent: true, opacity: 0, depthWrite: false});
    const glass = at(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), this.glass), 0, 1.26, -1.0, -0.25);
    glass.userData.ignore = true;
    g.add(glass);

    // ---- side walls and the left console with the side display ----
    for (const s of [-1, 1]) g.add(at(slab(1.9, 1.0, 0.05, 0.03, LINING), s * 1.18, 0.5, -0.2, 0, Math.PI / 2));
    g.add(at(slab(0.32, 0.6, 0.06, 0.02, PANEL), -0.95, 0.42, 0.0, -Math.PI / 2));  // console top, below the side display
    g.add(at(slab(2.4, 0.06, 2.0, 0.02, RUBBER), 0, 0.0, -0.2));  // floor
    g.add(at(slab(2.3, 0.4, 0.05, 0.03, LINING), 0, 0.2, -0.82, -0.15));  // knee panel under the main panel
    const side = at(new THREE.Group(), -0.8, 0.8, -0.32);
    side.rotation.set(-0.18, 1.05, 0, "YXZ");  // turned to face the pilot
    g.add(side);
    side.add(at(slab(0.37, 0.48, 0.05, 0.02, PANEL), 0, -0.025, -0.03));
    side.add(at(slab(0.335, 0.45, 0.02, 0.012, BEZEL), 0, -0.025, 0.004));
    const sideScreen = displays.side.makeMesh(0.30, 0.355);
    sideScreen.position.set(0, 0.012, 0.0145);
    side.add(sideScreen, at(glassOver(0.30, 0.355), 0, 0.012, 0.016));
    this.mounts.side = sideScreen;
    actions.sideKeys.forEach((fn, i) => {
      const b = keycap(0.05, 0.016);
      b.onPress = fn;
      place(b, side, 0.30 * ((i + 0.5) / 5 - 0.5), -0.215, 0.018);
    });
    const stick = at(new THREE.Group(), -0.72, 0.6, 0.05);  // sidestick
    g.add(stick);
    stick.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.03, 24), RUBBER), 0, 0, 0));
    stick.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.11, 6, 16), RUBBER), 0, 0.08, -0.01, -0.2));

    // ---- pedestal: FMS in front, thrust levers behind it ----
    // Kept below the line of sight from the seat to the bottom of the review display.
    g.add(at(slab(0.6, 0.5, 0.44, 0.04, PANEL), 0, 0.25, -0.15, 0, Math.PI / 2));
    const fms = at(new THREE.Group(), 0, 0.6, -0.3, -1.15);  // its lowest keys stay above the pedestal top
    g.add(fms);
    fms.add(at(slab(0.2, 0.29, 0.03, 0.012, BEZEL), 0, -0.03, -0.012));
    const fmsScreen = displays.fms.makeMesh(0.13, 0.103);
    fmsScreen.position.set(0, 0.06, 0.0035);
    fms.add(fmsScreen);
    this.mounts.fms = fmsScreen;
    this.mounts.fmsUnit = fms;
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {  // line select keys: routes, or <DFLT and SAVE> at the bottom
      const b = keycap(0.014, 0.009);
      b.onPress = () => displays.fms.lsk(s, i);
      place(b, fms, s * 0.08, 0.1 - i * 0.0165, 0.006);
    }
    actions.fmsKeys.forEach((row, r) => row.forEach((label, i) => {
      const w = 0.165 / row.length - 0.004, b = new Button(w, 0.0125, [label], () => displays.fms.press(label), 96);
      place(b, fms, -0.0825 + (i + 0.5) * (0.165 / row.length), -0.01 - r * 0.0155, 0.006);
    }));
    for (const s of [-1, 1]) {  // thrust levers
      const lever = at(new THREE.Group(), s * 0.06, 0.5, 0.02, 0.35);
      g.add(lever);
      lever.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.16, 0.014), METAL), 0, 0.08, 0));
      lever.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.05, 6, 12), RUBBER), 0, 0.17, 0, 0, 0, Math.PI / 2));
    }
  }

  setRain(r) { this.glass.opacity = r * 0.55; }

  animate(dt) { for (const b of this.buttons) b.animate(dt); }
}

function dropsTexture() {
  const c = new OffscreenCanvas(1024, 256), g = c.getContext("2d");
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * 1024, y = Math.random() * 256, r = 0.6 + Math.random() * 2.4;
    g.fillStyle = `rgba(220,230,240,${0.25 + Math.random() * 0.4})`;
    g.beginPath(); g.ellipse(x, y, r, r * (1 + Math.random() * 1.5), 0, 0, 6.3); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A small room as the reflection and ambient light source: bright windshield ahead, sky above,
// grey cabin sides, dark floor. Built in the game, so no extra download.
export function cabinEnvironment(renderer) {
  const room = new THREE.Scene(), geo = new THREE.BoxGeometry(1, 1, 1);
  const add = (color, intensity, sx, sy, sz, x, y, z) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.BackSide}));
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); room.add(m);
  };
  add("#7d838a", 1, 12, 8, 12, 0, 3, 0);  // walls
  add("#dfe9f5", 4, 8, 0.1, 3, 0, 5.5, -3);  // sky through the windshield, from above and ahead
  add("#ffffff", 3, 6, 2.5, 0.1, 0, 2, -5.8);  // windshield
  add("#2a2c2f", 1, 11.8, 0.1, 11.8, 0, -0.9, 0);  // floor
  const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  return env;
}
