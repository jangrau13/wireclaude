// A cockpit display: an offscreen 2D canvas shown as a lit screen on a mesh.
// Each display draws in its own logical units (lw x lh); the canvas resolution follows the size the
// screen has on the monitor, so text stays sharp in every camera view.
import * as THREE from "three";

// Glass-cockpit colours. State is always spelled out in words too, so the displays read in greyscale.
export const C = {
  bg: "#03060a", panel: "#0b1117", line: "#1f2a33", dim: "#56636e", grey: "#9aa6b0", white: "#eef3f6",
  cyan: "#3fd6ff", green: "#3ddc84", amber: "#ffb020", red: "#ff4136", magenta: "#ff5ad9",
};

export function font(px, bold = false, mono = false) {
  return `${bold ? 700 : 400} ${px}px ${mono ? '"B612 Mono", ui-monospace, Menlo, monospace' : '"B612", system-ui, sans-serif'}`;
}

// The B612 typeface was designed for Airbus cockpit displays; loaded with integrity checks.
const FONTS = [
  ["B612", 400, "npm/@fontsource/b612@5.1.0/files/b612-latin-400-normal.woff2",
   "sha384-WmJxeCavWRAmKlxPuvP+DkLQ/WBeb1EvxH0qgBa86kUYvKZAscjS3fujo7tzqXi6"],
  ["B612", 700, "npm/@fontsource/b612@5.1.0/files/b612-latin-700-normal.woff2",
   "sha384-3dRmlpWYx++c+k/lPtnuSSdgFn130L3b448xgig418kABsoL4tY7e8P4Mu+qZSNN"],
  ["B612 Mono", 400, "npm/@fontsource/b612-mono@5.1.0/files/b612-mono-latin-400-normal.woff2",
   "sha384-PIInCstWP+ofXPG6i3/88yX7IfSxTO25NKLqgvAfUhDIkRSHlRFvdwGFu7+IEJzw"],
  ["B612 Mono", 700, "npm/@fontsource/b612-mono@5.1.0/files/b612-mono-latin-700-normal.woff2",
   "sha384-X7deVU9mGb54S186LW2wLlI2HFWr6niDl3aCWc/0rQAmKIBmt6xRkLRIbbD/MGlk"],
];
export async function loadFonts() {
  await Promise.all(FONTS.map(async ([family, weight, path, integrity]) => {
    try {
      const data = await (await fetch("https://cdn.jsdelivr.net/" + path, {integrity})).arrayBuffer();
      document.fonts.add(await new FontFace(family, data, {weight: String(weight)}).load());
    } catch (e) {
      console.warn("font not loaded, using the fallback", family, weight, e);  // the cockpit still works
    }
  }));
}

// Shared measuring context, so layout code can measure text without a display.
export const measure = new OffscreenCanvas(8, 8).getContext("2d");

export function ellipsis(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + "…").width <= width) lo = mid; else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

export class Display {
  constructor(lw, lh) {
    this.lw = lw;
    this.lh = lh;
    this.k = 1;
    this.canvas = new OffscreenCanvas(lw, lh);
    this.ctx = this.canvas.getContext("2d");
    this.material = new THREE.MeshBasicMaterial({toneMapped: false});
    this.texture = null;
    this.makeTexture();
    this.dirty = true;
    this.animated = false;
    this.drawn = -1;
  }

  makeTexture() {
    if (this.texture) this.texture.dispose();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.material.map = this.texture;
    this.material.needsUpdate = true;
  }

  // The screen as a plane of width x height metres, facing +z.
  makeMesh(width, height) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    this.mesh.userData.display = this;
    return this.mesh;
  }

  // Match the canvas to the screen's size on the monitor (pixels tall), within limits.
  fit(pixelsTall) {
    const k = Math.min(3, Math.max(0.5, Math.round((pixelsTall / this.lh) * 4) / 4));
    if (k === this.k) return;
    this.k = k;
    this.canvas.width = Math.round(this.lw * k);
    this.canvas.height = Math.round(this.lh * k);
    this.makeTexture();
    this.dirty = true;
  }

  update(time) {
    // Animated displays redraw at 30 frames a second at most: each redraw uploads the whole texture.
    if (!this.dirty && !(this.animated && time - this.drawn >= 1 / 30)) return;
    this.dirty = false;
    this.drawn = time;
    const c = this.ctx;
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    c.textBaseline = "alphabetic";
    c.fillStyle = C.bg;
    c.fillRect(0, 0, this.lw, this.lh);
    c.save();
    this.draw(c, time);
    c.restore();
    this.texture.needsUpdate = true;
  }

  draw() {}
  pointer() {}  // (x, y) in logical units
  wheel() {}
  hover() { return false; }  // true when the point is clickable
}

// A labelled frame like on real displays: a cyan title on a thin line.
export function title(ctx, text, x, y, w) {
  ctx.font = font(22, true);
  ctx.fillStyle = C.cyan;
  ctx.fillText(text, x, y);
  ctx.fillStyle = C.line;
  ctx.fillRect(x, y + 10, w, 2);
}
