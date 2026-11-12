// A plain-text editor for the FMS: text, a cursor, word-wrapped rows of a fixed column count.
export class Editor {
  constructor() {
    this.text = "";
    this.saved = "";
    this.pos = 0;
    this.top = 0;  // first visible row
  }

  set(text) {
    this.text = this.saved = text;
    this.pos = 0;
    this.top = 0;
  }

  get modified() { return this.text !== this.saved; }

  // Visual rows as [start, end) string indices; a long line breaks after its last space that fits.
  rows(cols) {
    const rows = [];
    let i = 0;
    for (const line of this.text.split("\n")) {
      if (!line.length) rows.push({start: i, end: i});
      let s = 0;
      while (s < line.length) {
        let e = Math.min(line.length, s + cols);
        if (e < line.length) { const sp = line.lastIndexOf(" ", e - 1); if (sp >= s) e = sp + 1; }
        rows.push({start: i + s, end: i + e});
        s = e;
      }
      i += line.length + 1;
    }
    return rows;
  }

  rowOf(rows) {  // the row that shows the cursor
    let r = 0;
    while (r + 1 < rows.length && rows[r + 1].start <= this.pos) r++;
    return r;
  }

  insert(s) {
    s = s.replace(/\r\n?/g, "\n").replace(/\t/g, "  ");
    this.text = this.text.slice(0, this.pos) + s + this.text.slice(this.pos);
    this.pos += s.length;
  }

  // Keyboard handling; true when the key was used.
  key(e, cols) {
    const rows = this.rows(cols), r = this.rowOf(rows), col = this.pos - rows[r].start;
    const lineEnd = row => {  // last cursor position on a row: before the space a wrap left behind
      const next = rows[rows.indexOf(row) + 1];
      return next && next.start === row.end && row.end > row.start ? row.end - 1 : row.end;
    };
    switch (e.key) {
      case "ArrowLeft": this.pos = Math.max(0, this.pos - 1); return true;
      case "ArrowRight": this.pos = Math.min(this.text.length, this.pos + 1); return true;
      case "ArrowUp": if (r > 0) this.pos = Math.min(rows[r - 1].start + col, lineEnd(rows[r - 1])); return true;
      case "ArrowDown": if (r + 1 < rows.length) this.pos = Math.min(rows[r + 1].start + col, lineEnd(rows[r + 1])); return true;
      case "Home": this.pos = rows[r].start; return true;
      case "End": this.pos = lineEnd(rows[r]); return true;
      case "Backspace":
        if (this.pos > 0) { this.text = this.text.slice(0, this.pos - 1) + this.text.slice(this.pos); this.pos--; }
        return true;
      case "Delete": this.text = this.text.slice(0, this.pos) + this.text.slice(this.pos + 1); return true;
      case "Enter": this.insert("\n"); return true;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) { this.insert(e.key); return true; }
    return false;
  }

  // Place the cursor at a visible row and column, as from a click.
  click(row, col, cols) {
    const rows = this.rows(cols), r = Math.min(rows.length - 1, this.top + row);
    if (r < 0) return;
    this.pos = Math.min(rows[r].start + Math.max(0, col), rows[r].end);
  }

  // Keep the cursor row on screen.
  scrollTo(rows, visible) {
    const r = this.rowOf(rows);
    if (r < this.top) this.top = r;
    if (r >= this.top + visible) this.top = r - visible + 1;
    this.top = Math.max(0, Math.min(this.top, Math.max(0, rows.length - visible)));
  }
}

// The smallest check: run with node cockpit/editor.js
if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("editor.js")) {
  const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
  const ed = new Editor();
  ed.set("alpha beta gamma\ndelta");
  const rows = ed.rows(11);
  ok(JSON.stringify(rows.map(r => ed.text.slice(r.start, r.end))) === '["alpha beta ","gamma","delta"]', "wrap");
  ed.pos = 13;  // "ga|mma", column 2 of the second row
  ed.key({key: "ArrowUp"}, 11);
  ok(ed.pos === 2, "up keeps the column: " + ed.pos);
  ed.key({key: "End"}, 11);
  ok(ed.pos === 10, "end stops before the wrap space: " + ed.pos);
  ed.key({key: "x"}, 11);
  ok(ed.text.startsWith("alpha betax"), ed.text);
  ed.key({key: "Backspace"}, 11);
  ok(ed.text === "alpha beta gamma\ndelta" && !ed.modified, ed.text);
  console.log("editor ok");
}
