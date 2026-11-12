// The centre display: the waiting item, scrollable, with five soft keys on the bezel below it.
import {Display, C, font, ellipsis} from "./display.js";
import {Doc, itemBlocks, KINDS, kindOf} from "./doc.js";

const W = 1600, H = 1100, HEAD = 150, FOOT = 70, PAD = 34;

export class ReviewDisplay extends Display {
  constructor() {
    super(W, H);
    this.item = null;
    this.doc = null;
    this.scroll = 0;
    this.count = 0;
    this.paused = false;
    this.flash = null;
    this.zoomed = false;
  }

  show(item, count, paused) {
    if ((item && item.id) !== (this.item && this.item.id)) {
      this.item = item;
      this.scroll = 0;
      this.doc = item ? new Doc(itemBlocks(item), () => { this.dirty = true; }) : null;
    }
    if (count !== this.count || paused !== this.paused) this.dirty = true;
    this.count = count;
    this.paused = paused;
  }

  // A short banner while a decision is sent: SENT, BLOCKED, TRUSTED.
  banner(text, color, time) {
    this.flash = {text, color, until: time + 0.7};
    this.dirty = true;
  }

  get area() { return {x: PAD, y: HEAD + 12, w: W - PAD * 2 - 26, h: H - HEAD - FOOT - 24}; }

  scrollBy(dy) {
    if (!this.doc) return;
    this.scroll = Math.max(0, Math.min(Math.max(0, this.doc.height - this.area.h), this.scroll + dy));
    this.dirty = true;
  }
  page(dir) { this.scrollBy(dir * this.area.h * 0.9); }
  wheel(dy) { this.scrollBy(dy); }

  cycleView() {
    if (!this.doc || this.doc.views < 2) return;
    this.doc.view++;
    this.doc.width = -1;
    this.dirty = true;
  }

  softLabels() {
    return [this.doc && this.doc.views > 1 ? "VIEW" : "", "PAGE UP", "PAGE DOWN", "TOP", this.zoomed ? "PANEL" : "ZOOM"];
  }
  softKey(i, zoom) {
    if (i === 0) this.cycleView();
    else if (i === 1) this.page(-1);
    else if (i === 2) this.page(1);
    else if (i === 3) this.scrollBy(-1e9);
    else zoom();
  }

  draw(c, time) {
    this.animated = !!this.flash && time < this.flash.until;
    if (this.flash && time >= this.flash.until) this.flash = null;
    if (!this.item) return this.drawEmpty(c);
    const kind = kindOf(this.item), [name, , check] = KINDS[kind];
    c.fillStyle = "#07111a";
    c.fillRect(0, 0, W, HEAD);
    c.font = font(24, true);
    c.fillStyle = kind === "error" ? C.red : C.cyan;
    c.fillText(name.toUpperCase(), PAD, 42);
    let x = PAD + c.measureText(name.toUpperCase()).width + 22;
    c.font = font(22);
    c.fillStyle = C.grey;
    c.fillText("#" + this.item.id, x, 42);
    x += c.measureText("#" + this.item.id).width + 22;
    if (this.item.agent) {
      c.font = font(22, true);
      c.fillStyle = C.magenta;
      c.fillText("SUBAGENT " + this.item.agent.toUpperCase(), x, 42);
    }
    c.textAlign = "right";
    c.font = font(22);
    c.fillStyle = C.grey;
    c.fillText("ITEM 1 OF " + this.count, W - PAD, 42);
    c.textAlign = "left";
    c.font = font(34, true);
    c.fillStyle = C.white;
    c.fillText(ellipsis(c, this.item.title || "", W - PAD * 2), PAD, 92);
    c.font = font(22);
    c.fillStyle = C.grey;
    c.fillText(ellipsis(c, check, W - PAD * 2), PAD, 130);
    c.fillStyle = C.line;
    c.fillRect(0, HEAD - 2, W, 2);

    const a = this.area;
    if (this.doc.width !== a.w) {  // lay out first, so a shorter new layout cannot leave the view past its end
      this.doc.layout(a.w);
      this.scroll = Math.max(0, Math.min(Math.max(0, this.doc.height - a.h), this.scroll));
    }
    this.doc.draw(c, a.x, a.y, a.h, this.scroll, a.w);
    if (this.doc.height > a.h) {  // scroll bar
      const tx = W - PAD + 4, th = Math.max(40, a.h * a.h / this.doc.height);
      const ty = a.y + (a.h - th) * this.scroll / (this.doc.height - a.h);
      c.fillStyle = C.line;
      c.fillRect(tx, a.y, 8, a.h);
      c.fillStyle = C.grey;
      c.fillRect(tx, ty, 8, th);
    }
    this.drawSoftLabels(c);
    if (this.flash) {
      c.fillStyle = "rgba(3, 6, 10, 0.82)";
      c.fillRect(0, H / 2 - 70, W, 140);
      c.strokeStyle = this.flash.color;
      c.lineWidth = 4;
      c.strokeRect(-4, H / 2 - 70, W + 8, 140);
      c.font = font(64, true);
      c.fillStyle = this.flash.color;
      c.textAlign = "center";
      c.fillText(this.flash.text, W / 2, H / 2 + 22);
      c.textAlign = "left";
    }
  }

  drawEmpty(c) {
    c.textAlign = "center";
    c.font = font(46, true);
    c.fillStyle = C.white;
    c.fillText("NO ITEMS WAITING", W / 2, H / 2 - 30);
    c.font = font(26);
    c.fillStyle = C.grey;
    c.fillText("Claude is idle, or nothing needs a review.", W / 2, H / 2 + 24);
    if (this.paused) {
      c.font = font(26, true);
      c.fillStyle = C.amber;
      c.fillText("CHECKS OFF: items go to Claude without a review", W / 2, H / 2 + 80);
    }
    c.textAlign = "left";
    this.drawSoftLabels(c);
  }

  drawSoftLabels(c) {
    c.fillStyle = C.line;
    c.fillRect(0, H - FOOT, W, 2);
    c.font = font(22, true);
    c.textAlign = "center";
    this.softLabels().forEach((label, i) => {
      if (!label) return;
      const x = W * (i + 0.5) / 5;
      c.fillStyle = C.cyan;
      c.fillText(label, x, H - 26);
      c.fillRect(x - 1, H - 14, 2, 14);  // a tick toward the key below
    });
    c.textAlign = "left";
  }
}
