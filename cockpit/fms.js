// The FMS on the pedestal: two pages that edit the command-explanation instructions and the private
// watch list. Typing on the keyboard or on the keypad edits the page; SAVE stores it on the server.
import {Display, C, font, measure, ellipsis} from "./display.js";
import {Editor} from "./editor.js";

const W = 960, H = 760, TOP = 64, ROWS = 15, SIZE = 26, ROW0 = 85, ROW = 122;
export const FMS_KEYS = [
  ["ROUTE", "EXPL", "WATCH", "PREV", "NEXT", "SAVE", "DFLT", "CLR"],
  ["A", "B", "C", "D", "E", "F"], ["G", "H", "I", "J", "K", "L"], ["M", "N", "O", "P", "Q", "R"],
  ["S", "T", "U", "V", "W", "X"], ["Y", "Z", "SP", "/", ".", "-"], ["1", "2", "3", "4", "5", "6"],
  ["7", "8", "9", "0", "SHIFT", "ENTER"],
];

export class Fms extends Display {
  constructor(save) {
    super(W, H);
    this.save = save;  // async (page, text) -> saved text
    this.page = "explain";
    this.editors = {explain: new Editor(), watch: new Editor()};
    this.defaultStyle = "";
    this.detectors = [];
    this.message = "";
    this.shift = false;
    this.active = false;  // true while the FMS view is open
    this.routes = [];  // [{name, cities, km, speed}] from the world
    this.route = 0;  // the route being flown
    this.routePage = 0;  // five routes a page
    this.onRoute = () => {};  // called with the index of a chosen route
    this.flying = "";  // the flight in progress, offered as CONTINUE>
    this.onContinue = () => {};
    // DIRECT page: type a place or "lat lon" into the scratchpad, put it into FROM or TO with the left keys.
    this.pad = "";
    this.direct = {from: null, to: null};  // [name, lat, lon], or {searching: text}, or {missing: text}
    this.geocode = async () => null;  // set by the game: text -> [name, lat, lon] or null
    this.describe = () => "";  // set by the game: (from, to) -> "6400 KM  7H05"
    this.onDirect = () => {};  // (from, to): fly it
    measure.font = font(SIZE, false, true);
    this.cw = measure.measureText("MMMMMMMMMM").width / 10;
    this.cols = Math.floor((W - 60) / this.cw);
  }

  load({style, defaultStyle, watchlist, detectors}) {
    if (style !== undefined && !this.editors.explain.modified) this.editors.explain.set(style);
    if (defaultStyle !== undefined) this.defaultStyle = defaultStyle;
    if (watchlist !== undefined && !this.editors.watch.modified) this.editors.watch.set(watchlist);
    if (detectors) this.detectors = detectors;
    this.dirty = true;
  }

  get editor() { return this.editors[this.page]; }

  async store() {
    this.message = "SAVING…";
    try {
      this.editor.set(await this.save(this.page, this.editor.text));
      this.message = "SAVED";
    } catch (e) {
      this.message = "NOT SAVED: " + (e.message || e);
    }
  }

  get pages() { return Math.ceil(this.routes.length / 5); }
  turnPage(d) { this.routePage = (this.routePage + d + this.pages) % this.pages; }

  choose(row) {  // a row of the current page
    const i = this.routePage * 5 + row;
    if (row < 0 || row > 4 || i >= this.routes.length) return;
    this.route = i;
    this.onRoute(i);
  }

  async setPlace(which) {
    const text = this.pad.trim();
    if (!text) return;
    this.pad = "";
    this.direct[which] = {searching: text};
    const place = await this.geocode(text).catch(() => null);
    this.direct[which] = place || {missing: text};
  }

  key(e) {
    if (e.key === "Escape") return false;
    if (this.page === "direct") {
      if (e.key === "Backspace") this.pad = this.pad.slice(0, -1);
      else if (e.key === "Enter") this.setPlace(Array.isArray(this.direct.from) ? "to" : "from");
      else if (e.key.length === 1) this.pad = (this.pad + e.key.toUpperCase()).slice(0, 40);
      else return false;
      return true;
    }
    if (this.page === "route") {  // 1 to 5 choose a route on this page; arrows turn pages
      if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key)) { this.turnPage(1); return true; }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { this.turnPage(-1); return true; }
      const row = Number(e.key) - 1;
      if (e.key.length === 1 && row >= 0) { this.choose(row); return true; }
      return false;
    }
    const used = this.editor.key(e, this.cols);
    if (used) this.message = "";
    return used;
  }

  paste(text) { if (this.editor) { this.editor.insert(text); this.message = ""; } }

  // Line select keys beside the display: on the route page they choose a route; on the edit pages,
  // the bottom pair is <DFLT and SAVE>.
  lsk(side, row) {
    if (this.page === "direct") {
      if (side < 0 && row < 2) this.setPlace(row === 0 ? "from" : "to");
      else if (side < 0 && row === 5) this.page = "route";
      else if (side > 0 && row === 5 && this.ready) this.onDirect(this.direct.from, this.direct.to);
    } else if (this.page === "route") {
      if (side < 0 && row === 5) this.page = "direct";
      else if (side < 0) this.choose(row);
      else if (row === 5 && this.flying) this.onContinue();
    } else if (row === 5) this.press(side < 0 ? "DFLT" : "SAVE");
  }

  get ready() { return Array.isArray(this.direct.from) && Array.isArray(this.direct.to); }

  press(label) {  // a keypad key
    if (label === "ROUTE") { this.page = "route"; return; }
    if (label === "EXPL") { this.page = "explain"; return; }
    if (label === "WATCH") { this.page = "watch"; return; }
    if (label === "PREV" || label === "NEXT") { if (this.page === "route") this.turnPage(label === "NEXT" ? 1 : -1); return; }
    if (this.page === "direct") {  // the keypad types into the scratchpad
      if (label === "CLR") this.pad = this.pad.slice(0, -1);
      else if (label === "ENTER") this.key({key: "Enter"});
      else if (label === "SP") this.pad += " ";
      else if (label.length === 1) this.pad = (this.pad + label).slice(0, 40);
      return;
    }
    if (this.page === "route") { if (/^[1-5]$/.test(label)) this.choose(Number(label) - 1); return; }
    const ed = this.editor;
    if (label === "SAVE") this.store();
    else if (label === "DFLT" && this.page === "explain") { ed.text = this.defaultStyle; ed.pos = 0; this.message = "DEFAULT LOADED: SAVE TO KEEP"; }
    else if (label === "CLR") ed.key({key: "Backspace"}, this.cols);
    else if (label === "SHIFT") { this.shift = !this.shift; return; }
    else if (label === "ENTER") ed.insert("\n");
    else if (label === "SP") ed.insert(" ");
    else if (label.length === 1) ed.insert(this.shift ? label : label.toLowerCase());
    this.shift = false;
  }

  pointer(x, y) {
    if (this.page === "direct") return;  // the keys beside the display work this page
    if (this.page === "route") {
      const row = Math.round((y - ROW0) / ROW);
      return row === 5 ? this.lsk(x < W / 2 ? -1 : 1, 5) : this.choose(row);
    }
    if (y < TOP || y > TOP + ROWS * SIZE * 1.4) return;
    this.editor.click(Math.floor((y - TOP) / (SIZE * 1.4)), Math.round((x - 30) / this.cw), this.cols);
  }
  hover(x, y) {
    if (this.page === "direct") return false;
    if (this.page === "route") { const i = Math.round((y - ROW0) / ROW); return i === 5 || (i >= 0 && i < 5 && this.routePage * 5 + i < this.routes.length); }
    return y >= TOP && y <= TOP + ROWS * SIZE * 1.4;
  }

  // Routes beside the left line select keys, which sit 122 display units apart.
  drawRoutes(c) {
    c.font = font(30, true);
    c.textAlign = "center";
    c.fillStyle = C.white;
    c.fillText("ROUTE SELECT", W / 2, 44);
    c.textAlign = "right";
    c.font = font(24);
    c.fillText((this.routePage + 1) + "/" + this.pages, W - 24, 44);
    this.routes.slice(this.routePage * 5, this.routePage * 5 + 5).forEach((r, row) => {
      const y = ROW0 + row * ROW, i = this.routePage * 5 + row, hours = r.km * 1000 / r.speed / 3600;
      const time = Math.floor(hours) + "H" + String(Math.round(hours % 1 * 60)).padStart(2, "0");
      c.textAlign = "right";
      c.font = font(24, true);
      c.fillStyle = i === this.route ? C.green : C.white;
      c.fillText((i === this.route ? "ACT  " : "") + time, W - 24, y + 10);
      const right = c.measureText((i === this.route ? "ACT  " : "") + time).width;
      c.textAlign = "left";
      c.font = font(28, true);
      c.fillStyle = C.cyan;
      c.fillText(ellipsis(c, "<" + (row + 1) + " " + r.name, W - 70 - right), 24, y + 10);
      c.font = font(20, false, true);
      c.fillStyle = C.grey;
      c.fillText(ellipsis(c, r.km + " KM  " + r.cities.map(([name]) => name).join(" - "), W - 60), 48, y + 42);
    });
    c.fillStyle = C.line; c.fillRect(20, H - 96, W - 40, 2);
    c.font = font(26, true); c.fillStyle = C.cyan;
    c.fillText("<DIRECT: ANY PLACE", 24, ROW0 + 5 * ROW + 10);
    c.font = font(18); c.fillStyle = C.grey;
    c.fillText("PREV / NEXT OR ARROWS: MORE ROUTES", 24, ROW0 + 5 * ROW + 40);
    if (this.flying) {
      c.textAlign = "right"; c.font = font(26, true); c.fillStyle = C.green;
      c.fillText("CONTINUE>", W - 24, ROW0 + 5 * ROW + 10);
      c.font = font(18, false, true); c.fillStyle = C.grey;
      c.fillText(ellipsis(c, this.flying, W / 2), W - 24, ROW0 + 5 * ROW + 40);
      c.textAlign = "left";
    }
  }

  drawDirect(c, time) {
    c.font = font(30, true); c.textAlign = "center"; c.fillStyle = C.white;
    c.fillText("DIRECT FLIGHT", W / 2, 44);
    c.textAlign = "left";
    const show = (label, v, row) => {
      const y = ROW0 + row * ROW;
      c.font = font(22); c.fillStyle = C.grey; c.fillText(label, 24, y - 20);
      c.font = font(30, true);
      if (Array.isArray(v)) {
        c.fillStyle = C.green; c.fillText("<" + ellipsis(c, v[0], W - 300), 24, y + 14);
        c.font = font(20, false, true); c.fillStyle = C.grey;
        c.textAlign = "right"; c.fillText(v[1].toFixed(2) + " " + v[2].toFixed(2), W - 24, y + 14); c.textAlign = "left";
      } else {
        c.fillStyle = v && v.missing ? C.amber : C.cyan;
        c.fillText(v ? (v.searching ? "SEARCHING " + v.searching + "…" : "NOT FOUND: " + v.missing) : "<□□□□□", 24, y + 14);
      }
    };
    show("FROM", this.direct.from, 0);
    show("TO", this.direct.to, 1);
    if (this.ready) { c.font = font(26, true); c.fillStyle = C.white; c.fillText(this.describe(this.direct.from, this.direct.to), 24, ROW0 + 2 * ROW + 14); }
    c.font = font(20); c.fillStyle = C.grey;
    c.fillText("Type a place or \"lat lon\", then the key beside FROM or TO. Enter fills the next empty field.", 24, ROW0 + 3 * ROW);
    c.fillText("Places are looked up on OpenStreetMap (Nominatim).", 24, ROW0 + 3 * ROW + 30);
    c.font = font(26, true); c.fillStyle = C.cyan; c.fillText("<ROUTES", 24, ROW0 + 5 * ROW + 10);
    if (this.ready) { c.textAlign = "right"; c.fillStyle = C.green; c.fillText("ACTIVATE>", W - 24, ROW0 + 5 * ROW + 10); c.textAlign = "left"; }
    c.fillStyle = C.line; c.fillRect(20, H - 40, W - 40, 2);  // scratchpad
    c.font = font(28, false, true); c.fillStyle = C.white;
    c.fillText(this.pad + (Math.floor(time * 2) % 2 ? "_" : ""), 24, H - 10);
  }

  draw(c, time) {
    if (this.page === "direct") return this.drawDirect(c, time);
    if (this.page === "route") return this.drawRoutes(c);
    const ed = this.editor, rows = ed.rows(this.cols), lh = SIZE * 1.4;
    ed.scrollTo(rows, ROWS);
    c.font = font(30, true);
    c.textAlign = "center";
    c.fillStyle = C.white;
    c.fillText(this.page === "explain" ? "EXPLAIN INSTRUCTIONS" : "PRIVATE WATCH LIST", W / 2, 44);
    c.textAlign = "right";
    c.font = font(24);
    c.fillText(this.page === "explain" ? "1/3" : "2/3", W - 24, 44);
    c.textAlign = "left";
    if (ed.modified) { c.font = font(24, true); c.fillStyle = C.amber; c.fillText("MOD", 24, 44); }
    c.font = font(SIZE, false, true);
    const r0 = ed.rowOf(rows), blink = this.active && Math.floor(time * 2) % 2 === 0;
    for (let i = 0; i < ROWS && ed.top + i < rows.length; i++) {
      const row = rows[ed.top + i], y = TOP + i * lh;
      const text = ed.text.slice(row.start, row.end).replace(/\n/g, "");
      const comment = this.page === "watch" && /^\s*#/.test(text);
      c.fillStyle = comment ? C.grey : this.page === "watch" && /^\s*re:/.test(text) ? C.cyan : C.green;
      c.fillText(text, 30, y + lh * 0.75);
      if (ed.top + i === r0 && blink) {
        c.fillStyle = C.white;
        c.fillRect(30 + (ed.pos - row.start) * this.cw, y + 4, 3, lh - 6);
      }
    }
    if (rows.length > ROWS) {  // more rows than fit: a small position bar
      c.fillStyle = C.line; c.fillRect(W - 14, TOP, 6, ROWS * lh);
      c.fillStyle = C.grey; c.fillRect(W - 14, TOP + ROWS * lh * ed.top / rows.length, 6, ROWS * lh * ROWS / rows.length);
    }
    const bottom = H - 96;
    c.fillStyle = C.line; c.fillRect(20, bottom - 10, W - 40, 2);
    c.font = font(26, true);
    c.fillStyle = C.cyan;
    if (this.page === "explain") c.fillText("<DFLT", 24, bottom + 26);
    c.textAlign = "right";
    c.fillText("SAVE>", W - 24, bottom + 26);
    c.textAlign = "left";
    c.font = font(22);
    c.fillStyle = this.message.startsWith("NOT") ? C.amber : this.message ? C.green : C.grey;
    const hint = this.page === "watch"
      ? "A name or code per line. re: for patterns, # for comments. Also scans for " + this.detectors.join(", ") + "."
      : "Type to edit. Applies to the next command. ESC returns to the panel.";
    c.fillText(ellipsis(c, this.message || hint, W - 130), 24, bottom + 70);
    if (this.shift) { c.textAlign = "right"; c.fillStyle = C.amber; c.fillText("SHIFT", W - 24, bottom + 70); c.textAlign = "left"; }
  }
}
