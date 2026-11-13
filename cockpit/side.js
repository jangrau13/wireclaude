// The side display: what Claude Code may reach (ACCESS) and the decided items (HISTORY).
import {Display, C, font} from "./display.js";
import {Doc, itemBlocks, KINDS, kindOf, SMALL} from "./doc.js";

const W = 1100, H = 1300, HEAD = 90, FOOT = 70, PAD = 32;
const STATE = {allow: ["ALLOWED", C.green], ask: ["ASK", C.amber], deny: ["BLOCKED", C.red]};

function accessBlocks(a) {
  const out = [{t: "label", text: "PROJECT  " + a.root, color: C.cyan}];
  const node = (n, depth) => {
    const [r, rc] = STATE[n.read] || ["?", C.grey], [e, ec] = STATE[n.edit] || ["?", C.grey];
    out.push({t: "p", indent: depth, runs: [
      {text: (n.dir ? "▸ " : "  ") + n.name, color: C.white, size: SMALL},
      {text: "   READ ", color: C.grey, size: SMALL}, {text: r, color: rc, bold: true, size: SMALL},
      {text: "  EDIT ", color: C.grey, size: SMALL}, {text: e, color: ec, bold: true, size: SMALL},
    ]});
    if (!n.dir) return;
    if (depth >= 3 && n.children.length) {
      out.push({t: "p", indent: depth + 1, runs: [{text: n.children.length + " entries below", color: C.dim, size: SMALL}]});
      return;
    }
    n.children.forEach(ch => node(ch, depth + 1));
    if (n.truncated) out.push({t: "p", indent: depth + 1, runs: [{text: "additional entries hidden", color: C.dim, size: SMALL}]});
  };
  node(a.tree, 0);
  out.push({t: "label", text: "OUTSIDE THE PROJECT", color: C.cyan});
  if (!a.outside.length) out.push({t: "p", runs: [{text: "No entries", color: C.dim, size: SMALL}]});
  for (const o of a.outside) {
    const [w, color] = STATE[o.kind] || ["?", C.grey];
    out.push({t: "p", runs: [{text: w + " " + o.action + "  ", color, bold: true, size: SMALL},
                              {text: o.path, mono: true, size: SMALL},
                              {text: "  " + o.rule + " (" + o.source + ")", color: C.dim, size: SMALL}]});
  }
  out.push({t: "label", text: "WEBSITES", color: C.cyan});
  const project = a.sites.filter(s => s.source === "project" || s.source === "local");
  if (!project.length) out.push({t: "p", runs: [{text: "No sites trusted for this project", color: C.dim, size: SMALL}]});
  for (const s of project) out.push({t: "p", runs: [{text: s.tool + "  ", color: C.grey, size: SMALL}, {text: s.site, size: SMALL}]});
  const other = a.sites.length - project.length;
  if (other) out.push({t: "p", runs: [{text: other + " more rules in user and managed settings", color: C.dim, size: SMALL}]});
  out.push({t: "label", text: "BASH ACCESS", color: C.cyan});
  const sb = a.sandbox || {};
  out.push(sb.enabled
    ? {t: "box", color: C.green, title: "SANDBOX ON", runs: [{text: "Bash changes are limited to the project, temporary folders and "
        + (sb.allowWrite || []).length + " more folders. Read deny rules limit what Bash can read."}]}
    : {t: "box", color: C.red, title: "SANDBOX OFF", runs: [{text: (sb.windows ? "Native Windows supports the sandbox only through WSL2. " : "")
        + "Bash commands can read and change anything your user account can, whatever the rules above say."}]});
  out.push({t: "p", runs: [{text: "From Claude Code settings. Hooks may enforce more rules.", color: C.dim, size: SMALL}]});
  return out;
}

export class SideDisplay extends Display {
  constructor() {
    super(W, H);
    this.tab = "access";
    this.access = null;
    this.history = [];
    this.selected = null;  // a history item shown in full
    this.docs = {};
    this.scroll = {access: 0, history: 0, detail: 0, logbook: 0};
  }

  setAccess(a) { this.access = a; this.docs.access = new Doc(accessBlocks(a), () => { this.dirty = true; }); this.dirty = true; }

  setHistory(items) {
    this.history = items;
    const STATUS = {sent: ["SENT", C.green], blocked: ["BLOCKED", C.red], auto: ["AUTO", C.grey]};
    this.docs.history = new Doc(items.length ? items.map(item => {
      const s = item.automatic ? "auto" : item.approved ? "sent" : "blocked", [word, color] = STATUS[s];
      return {t: "row", hit: () => this.open(item), runs: [
        {text: ("#" + item.id).padEnd(6), mono: true, color: C.grey, size: SMALL},
        {text: word.padEnd(9), mono: true, bold: true, color, size: SMALL},
        {text: KINDS[kindOf(item)][1].padEnd(6), mono: true, color: C.cyan, size: SMALL},
        {text: (item.agent ? "[" + item.agent + "] " : "") + item.title, size: SMALL},
      ]};
    }) : [{t: "p", runs: [{text: "Nothing decided yet.", color: C.dim}]}], () => { this.dirty = true; });
    this.dirty = true;
  }

  // Flights completed, newest first, with departure and arrival times.
  setLogbook(log) {
    const time = ms => { const d = new Date(ms); return d.toLocaleDateString() + " " + d.toTimeString().slice(0, 5); };
    this.docs.logbook = new Doc(log.length ? [...log].reverse().flatMap(e => [
      {t: "p", runs: [{text: e.from + " - " + e.to, bold: true, color: C.green}, {text: "   " + e.km + " KM", color: C.grey, size: SMALL}]},
      {t: "p", indent: 1, runs: [{text: "DEP " + time(e.departed) + "   ARR " + time(e.arrived), mono: true, size: SMALL, color: C.white}]},
      {t: "gap", h: 8},
    ]) : [{t: "p", runs: [{text: "No flights finished yet. Choose a route on the FMS.", color: C.dim}]}], () => { this.dirty = true; });
    this.dirty = true;
  }

  open(item) {
    this.selected = item;
    this.docs.detail = new Doc(itemBlocks(item), () => { this.dirty = true; });
    this.scroll.detail = 0;
    this.tab = "detail";
    this.dirty = true;
  }

  get area() { return {x: PAD, y: HEAD + 10, w: W - PAD * 2 - 20, h: H - HEAD - FOOT - 20}; }
  scrollBy(dy) {
    const doc = this.docs[this.tab];
    if (!doc) return;
    this.scroll[this.tab] = Math.max(0, Math.min(Math.max(0, doc.height - this.area.h), this.scroll[this.tab] + dy));
    this.dirty = true;
  }
  wheel(dy) { this.scrollBy(dy); }

  softLabels() { return ["ACCESS", this.tab === "detail" ? "BACK" : "HISTORY", "LOGBOOK", "PAGE UP", "PAGE DOWN"]; }
  softKey(i) {
    if (i === 0) this.tab = "access";
    else if (i === 1) this.tab = "history";
    else if (i === 2) this.tab = "logbook";
    else if (i === 3) this.scrollBy(-this.area.h * 0.9);
    else if (i === 4) this.scrollBy(this.area.h * 0.9);
    this.dirty = true;
  }

  pointer(x, y) {
    const a = this.area, doc = this.docs[this.tab];
    if (!doc || y < a.y || y > a.y + a.h) return;
    const hit = doc.hit(y - a.y + this.scroll[this.tab]);
    if (hit) hit();
  }
  hover(x, y) {
    const a = this.area, doc = this.docs[this.tab];
    return !!(doc && this.tab === "history" && y >= a.y && y <= a.y + a.h && doc.hit(y - a.y + this.scroll[this.tab]));
  }

  draw(c) {
    const names = {access: "CLAUDE CODE ACCESS", history: "HISTORY", logbook: "LOGBOOK", detail: "HISTORY ITEM #" + (this.selected && this.selected.id)};
    c.font = font(30, true);
    c.fillStyle = C.white;
    c.fillText(names[this.tab], PAD, 54);
    c.fillStyle = C.line;
    c.fillRect(0, HEAD - 2, W, 2);
    const doc = this.docs[this.tab], a = this.area;
    if (doc) {
      if (doc.width !== a.w) {
        doc.layout(a.w);
        this.scroll[this.tab] = Math.max(0, Math.min(Math.max(0, doc.height - a.h), this.scroll[this.tab]));
      }
      doc.draw(c, a.x, a.y, a.h, this.scroll[this.tab], a.w);
    } else {
      c.font = font(26); c.fillStyle = C.grey; c.fillText("LOADING…", PAD, HEAD + 60);
    }
    c.fillStyle = C.line;
    c.fillRect(0, H - FOOT, W, 2);
    c.font = font(22, true);
    c.textAlign = "center";
    this.softLabels().forEach((label, i) => {
      if (!label) return;
      const x = W * (i + 0.5) / 5;
      const on = [this.tab === "access", this.tab === "history" || this.tab === "detail", this.tab === "logbook"][i];
      c.fillStyle = on ? C.magenta : C.cyan;
      c.fillText(label, x, H - 26);
      c.fillRect(x - 1, H - 14, 2, 14);
    });
    c.textAlign = "left";
  }
}
