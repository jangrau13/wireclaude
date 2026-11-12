// The FMS on the pedestal: two pages that edit the command-explanation instructions and the private
// watch list. Typing on the keyboard or on the keypad edits the page; SAVE stores it on the server.
import {Display, C, font, measure, ellipsis} from "./display.js";
import {Editor} from "./editor.js";

const W = 960, H = 760, TOP = 64, ROWS = 15, SIZE = 26;
export const FMS_KEYS = [
  ["EXPL", "WATCH", "SAVE", "DFLT", "CLR"],
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

  key(e) {
    if (e.key === "Escape") return false;
    const used = this.editor.key(e, this.cols);
    if (used) this.message = "";
    return used;
  }

  paste(text) { this.editor.insert(text); this.message = ""; }

  press(label) {  // a keypad key
    const ed = this.editor;
    if (label === "EXPL") this.page = "explain";
    else if (label === "WATCH") this.page = "watch";
    else if (label === "SAVE") this.store();
    else if (label === "DFLT" && this.page === "explain") { ed.text = this.defaultStyle; ed.pos = 0; this.message = "DEFAULT LOADED: SAVE TO KEEP"; }
    else if (label === "CLR") ed.key({key: "Backspace"}, this.cols);
    else if (label === "SHIFT") { this.shift = !this.shift; return; }
    else if (label === "ENTER") ed.insert("\n");
    else if (label === "SP") ed.insert(" ");
    else if (label.length === 1) ed.insert(this.shift ? label : label.toLowerCase());
    this.shift = false;
  }

  pointer(x, y) {
    if (y < TOP || y > TOP + ROWS * SIZE * 1.4) return;
    this.editor.click(Math.floor((y - TOP) / (SIZE * 1.4)), Math.round((x - 30) / this.cw), this.cols);
  }
  hover(x, y) { return y >= TOP && y <= TOP + ROWS * SIZE * 1.4; }

  draw(c, time) {
    const ed = this.editor, rows = ed.rows(this.cols), lh = SIZE * 1.4;
    ed.scrollTo(rows, ROWS);
    c.font = font(30, true);
    c.textAlign = "center";
    c.fillStyle = C.white;
    c.fillText(this.page === "explain" ? "EXPLAIN INSTRUCTIONS" : "PRIVATE WATCH LIST", W / 2, 44);
    c.textAlign = "right";
    c.font = font(24);
    c.fillText(this.page === "explain" ? "1/2" : "2/2", W - 24, 44);
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
