// Screen-space layer over the cockpit: a key hint in the corner, the key list on H, and short notices.
import * as THREE from "three";
import {C, font} from "./display.js";

const KEYS = [
  ["Y  Enter  Right Arrow", "Send"],
  ["N  Left Arrow", "Block"],
  ["T  Up Arrow", "Send a web result and trust its site"],
  ["O", "Send the original: keeps findings, or sends an error"],
  ["Page Up  Page Down  wheel", "Scroll the review display"],
  ["V", "Switch PREVIEW and SOURCE, or spreadsheet sheets"],
  ["Z", "Zoom on the review display"],
  ["F", "FMS: explain instructions and private watch list"],
  ["S", "Side display: access rules and history"],
  ["Esc", "Back to the panel"],
  ["R", "Choose the flight route on the FMS"],
  ["H", "Show or hide this list"],
];

function sprite(w, h) {
  const canvas = new OffscreenCanvas(w, h), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({map: texture, transparent: true, toneMapped: false, depthTest: false}));
  return {canvas, texture, mesh, ctx: canvas.getContext("2d"), w, h};
}

export class Hud {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    this.hint = sprite(420, 56);
    this.help = sprite(980, 720);
    this.note = sprite(900, 70);
    this.credit = sprite(520, 44);  // the map data licence asks for this credit wherever the map shows
    this.scene.add(this.hint.mesh, this.help.mesh, this.note.mesh, this.credit.mesh);
    const {ctx: c} = this.credit;
    c.fillStyle = "rgba(3,6,10,0.72)"; c.fillRect(0, 0, 520, 44);
    c.font = font(20); c.fillStyle = C.white; c.textAlign = "right";
    c.fillText("Map © OpenStreetMap contributors", 504, 29);
    this.credit.texture.needsUpdate = true;
    this.help.mesh.visible = false;
    this.note.mesh.visible = false;
    this.noteUntil = 0;
    this.drawHint();
    this.drawHelp();
  }

  drawHint() {
    const {ctx: c, w, h} = this.hint;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "rgba(3,6,10,0.72)"; c.fillRect(0, 0, w, h);
    c.font = font(22, true); c.fillStyle = C.cyan; c.fillText("H", 18, 36);
    c.fillStyle = C.white; c.font = font(22); c.fillText("keys and views", 48, 36);
    this.hint.texture.needsUpdate = true;
  }

  drawHelp() {
    const {ctx: c, w, h} = this.help;
    c.fillStyle = "rgba(3,6,10,0.92)"; c.fillRect(0, 0, w, h);
    c.strokeStyle = C.line; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
    c.font = font(30, true); c.fillStyle = C.white; c.fillText("KEYS", 40, 64);
    c.font = font(21); c.fillStyle = C.grey;
    c.fillText("Or press the lit buttons on the glare shield and the keys around each display.", 40, 102);
    KEYS.forEach(([k, what], i) => {
      c.font = font(22, true); c.fillStyle = C.cyan; c.fillText(k, 40, 160 + i * 46);
      c.font = font(22); c.fillStyle = C.white; c.fillText(what, 360, 160 + i * 46);
    });
    this.help.texture.needsUpdate = true;
  }

  toggleHelp() { this.help.mesh.visible = !this.help.mesh.visible; }

  notice(text, color, time, seconds = 3) {
    const {ctx: c, w, h} = this.note;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "rgba(3,6,10,0.85)"; c.fillRect(0, 0, w, h);
    c.strokeStyle = color; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
    c.font = font(28, true); c.fillStyle = color; c.textAlign = "center";
    c.fillText(text, w / 2, 46);
    c.textAlign = "left";
    this.note.texture.needsUpdate = true;
    this.note.mesh.visible = true;
    this.noteUntil = time + seconds;
  }

  resize(W, H) {
    this.camera.right = W; this.camera.top = H; this.camera.updateProjectionMatrix();
    const at = (s, x, y, scale = 1) => { s.mesh.scale.set(s.w * scale, s.h * scale, 1); s.mesh.position.set(x, y, 0); };
    at(this.hint, 16 + 210 * 0.8, 16 + 28 * 0.8, 0.8);
    const k = Math.min(1, (W - 40) / 980, (H - 40) / 720);
    at(this.help, W / 2, H / 2, k);
    at(this.note, W / 2, H - 60, Math.min(1, (W - 40) / 900) * 0.8);
    at(this.credit, W - 16 - 260 * 0.8, 16 + 22 * 0.8, 0.8);
  }

  update(time) { if (this.note.mesh.visible && time > this.noteUntil) this.note.mesh.visible = false; }
}
