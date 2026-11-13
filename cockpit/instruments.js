// Panel instruments: EICAS (review counts and messages), navigation display (the review queue as a
// route, with weather radar), and the standby attitude indicator.
import {Display, C, font, ellipsis, title} from "./display.js";
import {KINDS, kindOf, target, isError} from "./doc.js";

const TAU = Math.PI * 2, rad = d => d * Math.PI / 180;

// ---- EICAS ----
const GAUGES = [  // label, softening constant k (needle at k is half way), amber and red from
  ["WAIT", 5, 5, 12], ["SENT", 60], ["BLOCKED", 15], ["AUTO", 120],
];
export class Eicas extends Display {
  constructor() {
    super(900, 1100);
    this.animated = true;
    this.values = [0, 0, 0, 0];
    this.needles = [0, 0, 0, 0];
    this.messages = [];
  }

  set(values, messages) {
    this.values = values;
    this.messages = messages;
  }

  draw(c) {
    title(c, "REVIEW STATUS", 34, 50, 832);
    GAUGES.forEach(([label, k, amber, red], i) => {
      const cx = i % 2 ? 660 : 240, cy = i < 2 ? 260 : 560, r = 130, v = this.values[i];
      const u = n => n / (n + k);
      this.needles[i] += (u(v) - this.needles[i]) * 0.12;
      const a0 = rad(180), sweep = rad(210), at = f => a0 + sweep * f;
      c.fillStyle = "#26313a";  // filled sector up to the needle, as on engine gauges
      c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, a0, at(this.needles[i])); c.closePath(); c.fill();
      c.strokeStyle = C.white; c.lineWidth = 5;
      c.beginPath(); c.arc(cx, cy, r, a0, at(1)); c.stroke();
      if (amber) {
        c.lineWidth = 9;
        c.strokeStyle = C.amber; c.beginPath(); c.arc(cx, cy, r + 9, at(u(amber)), at(u(red))); c.stroke();
        c.strokeStyle = C.red; c.beginPath(); c.arc(cx, cy, r + 9, at(u(red)), at(1)); c.stroke();
      }
      c.lineWidth = 4; c.strokeStyle = C.white;
      for (let t = 0; t <= 4; t++) {
        const a = at(t / 4);
        c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22));
        c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke();
      }
      const na = at(this.needles[i]);
      c.lineWidth = 6;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(na) * (r - 6), cy + Math.sin(na) * (r - 6)); c.stroke();
      const state = amber && v >= red ? C.red : amber && v >= amber ? C.amber : C.white;
      c.lineWidth = 3; c.strokeStyle = state;
      c.strokeRect(cx - 80, cy + 16, 160, 58);  // the digital readout sits below the dial centre, clear of the arc
      c.font = font(44, true, true); c.fillStyle = state; c.textAlign = "right";
      c.fillText(String(v), cx + 66, cy + 62);
      c.textAlign = "center"; c.font = font(28, true); c.fillStyle = C.grey;
      c.fillText(label, cx, cy + 112);
      c.textAlign = "left";
    });
    title(c, "MESSAGES", 34, 760, 832);
    c.font = font(28, true);
    this.messages.slice(0, 7).forEach(([text, color], i) => {
      c.fillStyle = color;
      c.fillText(ellipsis(c, text, 832), 34, 812 + i * 42);
    });
  }
}

// ---- navigation display ----
export class NavDisplay extends Display {
  constructor() {
    super(900, 1100);
    this.animated = true;
    this.heading = 0;
    this.queue = [];
    this.wx = [0, 0, 0];
    this.wxName = "";
    // Weather radar cells, in nautical-mile-like units ahead of the aircraft; they drift past.
    this.cells = Array.from({length: 26}, (_, i) => ({x: Math.sin(i * 12.9898) * 38, y: (i * 37.3) % 80, s: 2 + (i * 7.1) % 5}));
    this.last = 0;
  }

  draw(c, time) {
    const cx = 450, cy = 930, R = 760, ppm = R / 80, dt = Math.min(0.1, time - this.last);
    this.last = time;
    const hdg = ((this.heading * 180 / Math.PI) % 360 + 360) % 360;
    // weather returns: green, amber in rain, red cores in a storm
    const [clouds, , rain] = this.wx;
    if (clouds > 0.45) {
      for (const cell of this.cells) {
        cell.y -= dt * 1.2;
        if (cell.y < -5) cell.y += 85;
        const x = cx + cell.x * ppm, y = cy - cell.y * ppm, s = cell.s * ppm * (0.6 + clouds * 0.6);
        const g = c.createRadialGradient(x, y, 0, x, y, s);
        g.addColorStop(0, rain > 0.4 ? "rgba(255,40,40,0.75)" : "rgba(60,220,110,0.55)");
        g.addColorStop(0.45, rain > 0.4 ? "rgba(255,176,32,0.6)" : "rgba(60,220,110,0.35)");
        g.addColorStop(1, "rgba(60,220,110,0)");
        c.fillStyle = g;
        c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
      }
    }
    // compass arc
    c.strokeStyle = C.white; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, R, rad(-150), rad(-30)); c.stroke();
    c.font = font(30, true); c.fillStyle = C.white; c.textAlign = "center";
    for (let d = Math.ceil((hdg - 62) / 5) * 5; d <= hdg + 62; d += 5) {
      const a = rad(d - hdg - 90), major = d % 10 === 0;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      c.lineTo(cx + Math.cos(a) * (R - (major ? 30 : 16)), cy + Math.sin(a) * (R - (major ? 30 : 16)));
      c.stroke();
      if (d % 30 === 0) {
        const n = ((d % 360) + 360) % 360 / 10;
        c.fillText(String(n), cx + Math.cos(a) * (R - 62), cy + Math.sin(a) * (R - 62) + 10);
      }
    }
    c.setLineDash([10, 14]); c.strokeStyle = C.dim;
    c.beginPath(); c.arc(cx, cy, R / 2, rad(-150), rad(-30)); c.stroke();
    c.setLineDash([]);
    c.font = font(22); c.fillStyle = C.dim; c.fillText("40", cx - R / 2 * 0.86 - 20, cy - R / 4);
    // heading box and lubber line
    c.fillStyle = C.bg; c.fillRect(cx - 70, 96, 140, 54);
    c.strokeStyle = C.white; c.lineWidth = 3; c.strokeRect(cx - 70, 96, 140, 54);
    c.font = font(36, true, true); c.fillStyle = C.white;
    c.fillText(String(Math.round(hdg) % 360).padStart(3, "0"), cx, 137);
    c.beginPath(); c.moveTo(cx, cy - R + 2); c.lineTo(cx - 12, cy - R - 22); c.lineTo(cx + 12, cy - R - 22); c.closePath(); c.fill();
    // the review queue as a route
    const shown = this.queue.slice(0, 6);
    const pts = shown.map((_, i) => [cx + (i === 0 ? 0 : i % 2 ? 110 : -90), cy - 150 - i * 112]);
    c.lineWidth = 5;
    pts.forEach(([x, y], i) => {
      const [px, py] = i ? pts[i - 1] : [cx, cy];
      c.strokeStyle = i === 0 ? C.magenta : C.white;
      c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
    });
    c.textAlign = "left";
    pts.forEach(([x, y], i) => {
      const item = shown[i], kind = kindOf(item), color = i === 0 ? C.magenta : kind === "error" ? C.red : C.white;
      c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x, y - 16); c.lineTo(x + 16, y); c.lineTo(x, y + 16); c.lineTo(x - 16, y); c.closePath();
      i === 0 ? c.fill() : c.stroke();
      const lx = x + (i % 2 || i === 0 ? 30 : -30);
      c.textAlign = i % 2 || i === 0 ? "left" : "right";
      c.font = font(28, true); c.fillStyle = color;
      c.fillText(KINDS[kind][1] + (item.findings && item.findings.length ? " !" : ""), lx, y - 2);
      c.font = font(22, false, true); c.fillStyle = C.grey;
      c.fillText(ellipsis(c, target(item), 300), lx, y + 26);
    });
    c.textAlign = "left";
    if (this.queue.length > shown.length) {
      c.font = font(24, true); c.fillStyle = C.grey;
      c.fillText("+" + (this.queue.length - shown.length) + " MORE", cx + 40, cy - 150 - shown.length * 112 + 30);
    }
    if (!this.queue.length) {
      c.textAlign = "center"; c.font = font(28, true); c.fillStyle = C.grey;
      c.fillText("NO ROUTE: QUEUE EMPTY", cx, cy - 300);
      c.textAlign = "left";
    }
    // aircraft symbol
    c.strokeStyle = C.white; c.lineWidth = 6;
    c.beginPath(); c.moveTo(cx, cy - 34); c.lineTo(cx, cy + 30); c.moveTo(cx - 36, cy - 4); c.lineTo(cx + 36, cy - 4);
    c.moveTo(cx - 14, cy + 26); c.lineTo(cx + 14, cy + 26); c.stroke();
    // data in the corners
    const f = this.flight || {speed: 0, alt: 0, left: 0, to: ""};
    c.font = font(26, true); c.fillStyle = C.white;
    c.fillText("GS " + Math.round(f.speed * 1.944) + "  ALT " + Math.round(f.alt * 3.281 / 100) * 100, 30, 50);
    // Distance and time to the destination, and the local arrival time.
    const s = f.timeLeft || 0, eta = new Date(Date.now() + s * 1000);
    c.font = font(24, true); c.fillStyle = C.magenta;
    c.fillText("DEST " + f.to, 30, 960);
    c.fillStyle = C.white;
    c.fillText(f.left > 0 ? Math.round(f.left / 1000) + " KM  ETE " + Math.floor(s / 3600) + "H" + String(Math.floor(s % 3600 / 60)).padStart(2, "0")
                            + "  ETA " + String(eta.getHours()).padStart(2, "0") + ":" + String(eta.getMinutes()).padStart(2, "0")
                          : f.phase === "PARKED" ? "ON THE GROUND" : "", 30, 996);
    c.font = font(26, true);
    c.fillStyle = C.cyan; c.fillText("MAP", 30, 88);
    c.fillStyle = C.green; c.fillText("OVER " + (this.city || ""), 30, 126);
    c.fillStyle = C.white; c.fillText("NEXT " + (this.next || ""), 30, 164);
    c.textAlign = "right"; c.fillStyle = C.white;
    c.fillText("QUEUE " + this.queue.length, 870, 50);
    c.fillStyle = clouds > 0.45 ? C.green : C.dim;
    c.fillText("WXR " + this.wxName, 870, 88);
    c.fillStyle = C.cyan;
    c.fillText("RTE " + (this.route || ""), 870, 126);
    c.fillStyle = C.green;
    c.fillText(f.phase || "", 870, 164);
    c.textAlign = "left";
  }
}

// ---- standby attitude indicator (round, analogue) ----
export class Standby extends Display {
  constructor() {
    super(512, 512);
    this.animated = true;
    this.roll = 0;
    this.pitch = 0;
  }

  draw(c) {
    const cx = 256, cy = 256, r = 220;
    c.fillStyle = "#111";
    c.fillRect(0, 0, 512, 512);
    c.save();
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.clip();
    c.translate(cx, cy);
    c.rotate(-this.roll);
    c.translate(0, this.pitch * 6);
    c.fillStyle = "#2f6fbf"; c.fillRect(-400, -800, 800, 800);
    c.fillStyle = "#7a4a22"; c.fillRect(-400, 0, 800, 800);
    c.fillStyle = "#fff"; c.fillRect(-400, -2, 800, 4);
    for (let p = -20; p <= 20; p += 5) {
      if (!p) continue;
      const w = p % 10 ? 30 : 60;
      c.fillRect(-w, -p * 6 - 1.5, w * 2, 3);
    }
    c.restore();
    c.strokeStyle = "#fff"; c.lineWidth = 4;  // roll scale
    for (const d of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const a = rad(d - 90), l = d % 30 === 0 ? 26 : 14;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      c.lineTo(cx + Math.cos(a) * (r - l), cy + Math.sin(a) * (r - l)); c.stroke();
    }
    c.fillStyle = "#ffa500"; c.strokeStyle = "#ffa500"; c.lineWidth = 8;  // aircraft symbol
    c.beginPath(); c.moveTo(cx - 120, cy); c.lineTo(cx - 40, cy); c.lineTo(cx - 40, cy + 18); c.stroke();
    c.beginPath(); c.moveTo(cx + 120, cy); c.lineTo(cx + 40, cy); c.lineTo(cx + 40, cy + 18); c.stroke();
    c.beginPath(); c.arc(cx, cy, 8, 0, TAU); c.fill();
    c.save(); c.translate(cx, cy); c.rotate(-this.roll);  // roll pointer
    c.beginPath(); c.moveTo(0, -r + 30); c.lineTo(-12, -r + 52); c.lineTo(12, -r + 52); c.closePath(); c.fill();
    c.restore();
    c.strokeStyle = "#333"; c.lineWidth = 30;
    c.beginPath(); c.arc(cx, cy, r + 15, 0, TAU); c.stroke();
    c.font = font(22, true); c.fillStyle = "#ccc"; c.textAlign = "center";
    c.fillText("ATT", cx, 500);
    c.textAlign = "left";
  }
}

// Messages for the EICAS, most serious first; a word for each, so colour is never the only signal.
export function messages(state, next, wxName) {
  const out = [];
  if (isError(next)) out.push(["WARNING  ERROR WAITING: BLOCK, THEN REWIND", C.red]);
  if (next && next.findings && next.findings.length && !isError(next)) out.push(["CAUTION  FINDINGS IN WAITING ITEM", C.amber]);
  if (state.paused) out.push(["CAUTION  CHECKS OFF", C.amber]);
  if (next && next.site) out.push(["WEB SITE  " + next.site.toUpperCase(), C.white]);
  out.push([state.bash_before ? "BASH HOLD ON" : "BASH HOLD OFF", C.cyan]);
  out.push(["WX  " + wxName, C.cyan]);
  return out;
}
