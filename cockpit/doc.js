// Turns review items into display blocks, lays them out for a width, and draws the visible part.
// Everything renders inside the game: code with syntax colours, Markdown and HTML as formatted text,
// tables, images, PDF pages and spreadsheets. Parsing uses inert DOMParser documents and image
// decoding only, so nothing in a reviewed file can run code or load from the network.
import {C, font, measure, ellipsis} from "./display.js";

export const TEXT = 26, SMALL = 21, CODE = 21;
const HEAD = [0, 38, 33, 29, 27, 26, 25];
const LINE = 1.38, CODE_LINE = 1.45, INDENT = 28;

// ---- kinds of review: name, short code for the route display, and what to check ----
export const KINDS = {
  command: ["Command before it runs", "CMD", "Does it do what you asked, and read only what it should?"],
  output: ["Command output", "OUT", "Secrets, personal data or unpublished results in the output?"],
  file: ["File content", "FILE", "Should this file leave your computer?"],
  search: ["Search result", "SRCH", "Matches can come from files you did not expect."],
  web: ["Web result", "WEB", "Look for instructions aimed at Claude in the page text."],
  mcp: ["Connector answer", "MCP", "The answer can hold data from other systems."],
  error: ["Error", "ERR", "Claude receives error text whatever you choose: block it, then rewind."],
  prompt: ["Prompt", "PRMT", "Your own message."],
  other: ["Tool result", "TOOL", "Check what Claude will read."],
};
export function kindOf(item) {
  const t = item.tool || "";
  if (item.event === "UserPromptSubmit") return "prompt";
  if (item.event === "PostToolUseFailure") return "error";
  if (t === "Bash") return item.event === "PreToolUse" ? "command" : "output";
  if (t === "Read" || t === "NotebookRead") return "file";
  if (t === "Grep" || t === "Glob") return "search";
  if (t === "WebFetch" || t === "WebSearch") return "web";
  if (t.startsWith("mcp__")) return "mcp";
  return "other";
}
export const isError = item => !!item && item.event === "PostToolUseFailure";
export function target(item) {
  const t = item.tool || "", i = item.input || (item.event === "PreToolUse" ? item.content : null) || {};
  if (t.startsWith("mcp__")) return t.slice(5).replace("__", ": ");
  const file = i.file_path || i.notebook_path;
  if (file) return String(file).split(/[\\/]/).pop();
  if (i.url) { try { return new URL(i.url).host; } catch { return String(i.url); } }
  return String(i.command || i.query || i.pattern || t).split("\n")[0];
}

// ---- syntax colours ----
const HL = {
  keyword: "#ff7b72", built_in: "#ffa657", type: "#ffa657", literal: "#79c0ff", number: "#79c0ff",
  string: "#a5d6ff", regexp: "#a5d6ff", comment: "#8b949e", doctag: "#8b949e", meta: "#8b949e",
  title: "#d2a8ff", section: "#d2a8ff", attr: "#79c0ff", attribute: "#79c0ff", property: "#79c0ff",
  variable: "#ffa657", tag: "#7ee787", name: "#7ee787", "selector-tag": "#7ee787", symbol: "#79c0ff",
  bullet: "#ffa657", addition: C.green, deletion: C.red,
};
function colorOf(cls) {
  for (const c of String(cls).split(" ")) {
    const k = c.replace(/^hljs-/, "").replace(/_+$/, "");
    if (HL[k]) return HL[k];
  }
  return null;
}
// Lines of coloured tokens. Long texts and unknown languages stay plain.
export function highlight(text, lang) {
  const lines = [[]];
  const push = (t, color) => t.split("\n").forEach((part, i) => {
    if (i) lines.push([]);
    if (part) lines.at(-1).push({text: part.replace(/\t/g, "    "), color});
  });
  const hljs = globalThis.hljs;
  let html = null;
  if (hljs && text.length <= 20000 && lang !== "plaintext") {
    try {
      if (lang && hljs.getLanguage(lang)) html = hljs.highlight(text, {language: lang, ignoreIllegals: true}).value;
      else if (!lang) html = hljs.highlightAuto(text).value;
    } catch { html = null; }
  }
  if (html === null) { push(text, null); return lines; }
  const root = new DOMParser().parseFromString("<pre>" + html + "</pre>", "text/html").body.firstChild;
  const walk = (node, color) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) push(n.nodeValue, color);
      else if (n.nodeType === 1) walk(n, colorOf(n.className) || color);
    }
  };
  walk(root, null);
  return lines;
}

const decode = s => String(s).replace(/&(lt|gt|amp|quot|#39);/g, (_, e) => ({lt: "<", gt: ">", amp: "&", quot: '"', "#39": "'"}[e]));

// ---- strings: which viewer fits ----
const MAGIC = {"JVBERi0": "application/pdf", "iVBORw0KGgo": "image/png", "/9j/": "image/jpeg",
               "R0lGOD": "image/gif", "UklGR": "image/webp", "UEsDBA": "application/zip"};
function formatOf(s, ext) {
  const known = {html: "html", htm: "html", md: "markdown", markdown: "markdown", svg: "svg", csv: "csv", tsv: "tsv",
                 json: "json", plaintext: "text", txt: "text", log: "text"};
  if (ext) return known[ext.toLowerCase()] || "code";
  const t = s.trimStart();
  if (/^(<!doctype html|<html)/i.test(t)) return "html";
  if (/^<svg/i.test(t)) return "svg";
  if (/^[\[{]/.test(t)) { try { JSON.parse(s); return "json"; } catch {} }
  return "auto";
}

const code = (text, lang, more = {}) => ({t: "code", text, lang, gutter: true, ...more});
const views = options => ({t: "views", options, cache: []});

function later(label, promise) {  // a block that fills in when the work finishes
  const b = {t: "async", label, blocks: null, error: null};
  b.promise = promise.then(blocks => { b.blocks = blocks; }, e => { b.error = String(e && e.message || e); });
  return b;
}

function binary(s) {
  const type = s.length > 100 && Object.entries(MAGIC).find(([m]) => s.startsWith(m));
  if (!type) return null;
  let bytes;
  try { bytes = Uint8Array.from(atob(s), c => c.charCodeAt(0)); } catch { return null; }
  if (type[1] === "application/pdf") return later("PDF", pdfPages(bytes));
  if (type[1] === "application/zip") return later("SPREADSHEET", workbook(bytes));
  return later("IMAGE", createImageBitmap(new Blob([bytes], {type: type[1]})).then(img => [{t: "image", img}]));
}

function renderString(s, hint) {
  const bin = binary(s);
  if (bin) return [bin];
  switch (formatOf(s, hint.ext)) {
    case "html": {
      const page = /^\s*(<!doctype html|<html)/i.test(s);
      const preview = ["PREVIEW", () => htmlBlocks(s)], source = ["SOURCE", () => [code(s, "html")]];
      return [views(page ? [preview, source] : [source, preview])];
    }
    case "markdown": return [views([["PREVIEW", () => mdBlocks(s)], ["SOURCE", () => [code(s, "markdown")]]])];
    case "svg": return [views([["PREVIEW", () => [later("SVG", svgImage(s))]], ["SOURCE", () => [code(s, "xml")]]])];
    case "csv": return [views([["TABLE", () => [{t: "table", rows: parseCSV(s, ",")}]], ["SOURCE", () => [code(s, "plaintext")]]])];
    case "tsv": return [views([["TABLE", () => [{t: "table", rows: parseCSV(s, "\t")}]], ["SOURCE", () => [code(s, "plaintext")]]])];
    case "json": return [code(JSON.stringify(JSON.parse(s), null, 2), "json")];
    case "code": return [code(s, hint.ext)];
    case "text": return [code(s, "plaintext", {gutter: false})];
    default: return [code(s, null)];
  }
}

const PLAIN = /^(stdout|stderr|description|filePath|file_path|path|pattern|url)$/;
const CODEKEY = /^(content|oldString|newString|old_string|new_string|originalFile|file_text)$/;
const isInline = v => v === null || typeof v !== "object" && !(typeof v === "string" && (v.includes("\n") || v.length > 160));

// Objects as labelled fields, short values on a line, every string through the matching viewer.
export function render(v, hint = {}, indent = 0) {
  if (typeof v === "string") return renderString(v, hint).map(b => ({...b, indent}));
  if (Array.isArray(v) && v.length && v.every(l => typeof l === "string" && /^[-+ \\]/.test(l)))
    return [code(v.join("\n"), "diff", {indent})];
  if (v && typeof v === "object") {
    const path = [v.filePath, v.file_path, v.path].find(p => typeof p === "string");
    const name = path && path.split(/[\\/]/).pop();
    const ext = name && name.includes(".") ? name.split(".").pop() : undefined;
    const out = [];
    for (const [k, child] of Object.entries(v)) {
      const label = Array.isArray(v) ? "[" + k + "]" : k;
      if (isInline(child)) { out.push({t: "kv", key: label, value: String(child), indent}); continue; }
      const h = k === "command" ? {ext: "bash"} : PLAIN.test(k) ? {ext: "plaintext"} : CODEKEY.test(k) ? {ext} : {};
      out.push({t: "field", text: label, indent}, ...render(child, h, indent + 1));
    }
    return out;
  }
  return [{t: "kv", key: "", value: String(v), indent}];
}

// Bash calls as a terminal: status, the command, then stdout and stderr.
const BASH_SHOWN = new Set(["command", "description", "stdout", "stderr", "interrupted", "isImage"]);
function terminal(item) {
  const pre = item.event === "PreToolUse", failed = isError(item);
  const input = (pre ? item.content : item.input) || {}, out = pre ? {} : item.content || {};
  const chips = [[pre ? "WAITING FOR APPROVAL" : failed ? "ERROR" : "OUTPUT WAITING TO BE SENT", C.cyan]];
  if (input.run_in_background) chips.push(["BACKGROUND TASK", C.white]);
  if (input.timeout) chips.push(["TIMEOUT " + Math.round(input.timeout / 1000) + " S", C.white]);
  if (failed) chips.push(["FAILED", C.red]);
  else if (!pre) {
    const exit = /(?:^|\n)Exit code (\d+)\s*$/.exec(out.stdout || "");
    if (out.interrupted) chips.push(["INTERRUPTED", C.red]);
    else if (exit) chips.push(["FAILED WITH EXIT CODE " + exit[1], C.red]);
    else chips.push(out.stderr ? ["FINISHED WITH ERROR OUTPUT", C.amber] : ["FINISHED", C.green]);
  }
  const blocks = [{t: "chips", chips}];
  if (input.description) blocks.push({t: "kv", key: "description", value: input.description});
  blocks.push({t: "label", text: "COMMAND"}, code(input.command || "", "bash", {prompt: true}));
  if (failed) blocks.push({t: "label", text: "ERROR WAITING TO BE SENT", color: C.red},
                          code(out.error || "(empty)", "plaintext", {color: C.red, gutter: false}));
  else if (!pre) {
    blocks.push({t: "label", text: "STDOUT"});
    const img = out.isImage && binary(out.stdout || "");
    blocks.push(img || code(out.stdout || "(empty)", "plaintext", {color: out.stdout ? null : C.dim}));
    blocks.push({t: "label", text: "STDERR"},
                code(out.stderr || "(empty)", "plaintext", {color: out.stderr ? C.red : C.dim}));
  }
  const rest = Object.fromEntries(Object.entries(pre ? input : out).filter(([k]) => !BASH_SHOWN.has(k)));
  if (Object.keys(rest).length) blocks.push(...render(rest));
  return blocks;
}

// The whole item: explanation, note and findings first, then the content.
export function itemBlocks(item) {
  const blocks = [];
  if (item.summary) blocks.push({t: "box", color: C.green, title: "COMMAND EXPLANATION", runs: [{text: item.summary}]});
  if (item.note) blocks.push({t: "box", color: C.amber, title: "NOTE", runs: [{text: item.note}]});
  if (item.findings && item.findings.length) {
    const list = item.findings.map(f => [
      {text: f.label + "  ", bold: true, color: C.amber},
      {text: f.match.length > 60 ? f.match.slice(0, 57) + "..." : f.match, mono: true, size: CODE},
      {text: f.count > 1 ? "  x" + f.count : "", color: C.grey},
    ]);
    blocks.push({t: "box", color: C.amber, title: "FINDINGS: REVIEW BEFORE SENDING", list, runs: [{
      text: item.cleanable ? "SEND removes the listed text. ORIGINAL keeps it."
                           : "Claude receives this error whatever you choose. Block it, then rewind past this step.",
      color: C.grey}]});
  }
  if (item.tool === "Bash") blocks.push(...terminal(item));
  else if (item.event === "UserPromptSubmit") blocks.push(...renderString(String(item.content || ""), {ext: "md"}));
  else blocks.push(...render(item.content));
  for (const s of item.scripts || []) {
    const name = s.path.split(/[\\/]/).pop(), ext = name.includes(".") ? name.split(".").pop() : "bash";
    blocks.push({t: "label", text: "SCRIPT READ FROM YOUR DISK: " + s.path}, code(s.content, ext));
  }
  return blocks;
}

// ---- Markdown, as formatted text ----
function mdInline(tokens, s = {}) {
  const out = [];
  for (const t of tokens || []) {
    if (t.type === "strong") out.push(...mdInline(t.tokens, {...s, bold: true}));
    else if (t.type === "em" || t.type === "del") out.push(...mdInline(t.tokens, s));
    else if (t.type === "codespan") out.push({text: decode(t.text), mono: true, color: C.cyan, size: CODE});
    else if (t.type === "link") out.push(...mdInline(t.tokens, {...s, color: C.cyan}));
    else if (t.type === "image") out.push({text: "[image: " + (t.text || t.href) + "]", color: C.grey});
    else if (t.type === "br") out.push({text: "\n"});
    else if (t.type === "text" && t.tokens) out.push(...mdInline(t.tokens, s));
    else out.push({...s, text: decode(t.text ?? t.raw ?? "")});
  }
  return out;
}
function mdBlocks(src) {
  const out = [];
  const walk = (tokens, indent) => {
    for (const t of tokens || []) {
      if (t.type === "heading") out.push({t: "h", level: t.depth, runs: mdInline(t.tokens, {bold: true}), indent});
      else if (t.type === "paragraph" || t.type === "text")
        out.push({t: "p", runs: t.tokens ? mdInline(t.tokens) : [{text: decode(t.text)}], indent});
      else if (t.type === "list") t.items.forEach((it, i) => {
        const mark = (it.task ? (it.checked ? "[x] " : "[ ] ") : "") + (t.ordered ? (Number(t.start) || 1) + i + ". " : "• ");
        const first = out.length;
        walk(it.tokens, indent + 1);
        if (out[first] && out[first].runs) out[first].runs.unshift({text: mark, color: C.cyan, bold: true});
        else out.splice(first, 0, {t: "p", runs: [{text: mark, color: C.cyan}], indent: indent + 1});
      });
      else if (t.type === "code") out.push(code(t.text, t.lang || null, {indent}));
      else if (t.type === "blockquote") walk(t.tokens, indent + 1);
      else if (t.type === "table")
        out.push({t: "table", rows: [t.header.map(c => decode(c.text)), ...t.rows.map(r => r.map(c => decode(c.text)))], indent});
      else if (t.type === "hr") out.push({t: "rule"});
      else if (t.type === "html") out.push({t: "p", runs: [{text: t.text, mono: true, size: CODE, color: C.grey}], indent});
      else if (t.type !== "space" && t.text) out.push({t: "p", runs: [{text: decode(t.text)}], indent});
    }
  };
  if (globalThis.marked) walk(globalThis.marked.lexer(src), 0);
  else out.push(code(src, "markdown"));
  return out;
}

// ---- HTML, as formatted text from an inert parsed document ----
const BLOCK = new Set(["P", "DIV", "SECTION", "ARTICLE", "MAIN", "HEADER", "FOOTER", "NAV", "ASIDE", "FORM", "FIGURE",
                       "FIGCAPTION", "BLOCKQUOTE", "ADDRESS", "DL", "DT", "DD", "FIELDSET", "DETAILS", "SUMMARY", "CENTER", "LI"]);
function htmlBlocks(src) {
  const doc = new DOMParser().parseFromString(src, "text/html");
  const out = [];
  if (doc.title) out.push({t: "h", level: 1, runs: [{text: doc.title, bold: true}], indent: 0});
  doc.querySelectorAll("script, style, noscript, template, iframe, object, embed, svg, canvas").forEach(e => e.remove());
  let runs = [];
  const flush = indent => {
    if (runs.some(r => r.text.trim())) {
      runs[0] = {...runs[0], text: runs[0].text.replace(/^\s+/, "")};
      out.push({t: "p", runs, indent});
    }
    runs = [];
  };
  const inline = (n, s) => {
    if (n.nodeType === 3) { runs.push({...s, text: n.nodeValue.replace(/\s+/g, " ")}); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === "BR") { runs.push({text: "\n"}); return; }
    if (tag === "IMG") { runs.push({text: "[image" + (n.alt ? ": " + n.alt : "") + "]", color: C.grey}); return; }
    const st = tag === "B" || tag === "STRONG" ? {...s, bold: true}
             : tag === "A" ? {...s, color: C.cyan}
             : /^(CODE|KBD|SAMP|TT)$/.test(tag) ? {...s, mono: true, color: C.cyan, size: CODE} : s;
    for (const c of n.childNodes) inline(c, st);
  };
  const walk = (el, indent) => {
    for (const n of el.childNodes) {
      const tag = n.nodeType === 1 ? n.tagName : "";
      if (/^H[1-6]$/.test(tag)) {
        flush(indent);
        inline(n, {bold: true});
        const r = runs;
        runs = [];
        if (r.some(x => x.text.trim())) out.push({t: "h", level: Number(tag[1]), runs: r, indent});
      } else if (tag === "UL" || tag === "OL") {
        flush(indent);
        [...n.children].filter(c => c.tagName === "LI").forEach((li, i) => {
          runs.push({text: tag === "OL" ? i + 1 + ". " : "• ", color: C.cyan, bold: true});
          walk(li, indent + 1);
          flush(indent + 1);
        });
      } else if (tag === "PRE") {
        flush(indent);
        const lang = (/language-(\w+)/.exec(n.querySelector("code")?.className || "") || [])[1] || null;
        out.push(code(n.textContent, lang, {indent}));
      } else if (tag === "TABLE") {
        flush(indent);
        out.push({t: "table", rows: [...n.rows].map(r => [...r.cells].map(c => c.textContent.trim().replace(/\s+/g, " "))), indent});
      } else if (tag === "HR") { flush(indent); out.push({t: "rule"}); }
      else if (BLOCK.has(tag)) { flush(indent); walk(n, indent + (tag === "BLOCKQUOTE" ? 1 : 0)); flush(indent); }
      else inline(n, {});
    }
  };
  walk(doc.body, 0);
  flush(0);
  return out.length ? out : [{t: "p", runs: [{text: "(no text in this page)", color: C.grey}]}];
}

// An SVG drawn as an image: images run no scripts and load nothing from the network.
async function svgImage(s) {
  const url = URL.createObjectURL(new Blob([s], {type: "image/svg+xml"}));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 800, h = img.naturalHeight || 600, k = Math.min(1, 2000 / Math.max(w, h));
    const c = new OffscreenCanvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    g.getImageData(0, 0, 1, 1);  // throws if the browser marked the image as unsafe to read
    return [{t: "image", img: c}];
  } finally {
    URL.revokeObjectURL(url);
  }
}

function parseCSV(text, sep) {
  const rows = [[]];
  let field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { rows.at(-1).push(field); field = ""; }
    else if (c === "\n") { rows.at(-1).push(field.replace(/\r$/, "")); field = ""; rows.push([]); }
    else field += c;
  }
  rows.at(-1).push(field);
  return rows.filter(r => r.length > 1 || r[0] !== "");
}

// ---- PDF pages through pdf.js, its worker loaded with an integrity check ----
const PDF_WORKER = ["https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs",
                    "sha384-ToeVvShCxKc6CEvhHeMt0Q8A06pSPDbAlngO9nokrDmh914gk/pYd0N7D0a4Lz2o"];
let pdfjsReady;
function pdfjs() {
  return pdfjsReady ??= (async () => {
    const lib = await import("pdfjs");
    const src = await (await fetch(PDF_WORKER[0], {integrity: PDF_WORKER[1]})).text();
    lib.GlobalWorkerOptions.workerPort =
      new Worker(URL.createObjectURL(new Blob([src], {type: "text/javascript"})), {type: "module"});
    return lib;
  })();
}
async function pdfPages(bytes) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({data: bytes, isEvalSupported: false}).promise;
  const shown = Math.min(doc.numPages, 40), out = [];
  for (let i = 1; i <= shown; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({scale: 1.6});
    const c = new OffscreenCanvas(Math.round(vp.width), Math.round(vp.height));
    await page.render({canvasContext: c.getContext("2d"), viewport: vp}).promise;
    out.push({t: "label", text: "PAGE " + i + " OF " + doc.numPages}, {t: "image", img: c});
  }
  if (doc.numPages > shown) out.push({t: "p", runs: [{text: doc.numPages - shown + " more pages not shown", color: C.amber}]});
  return out;
}

// ---- spreadsheets through SheetJS, a sheet per view ----
const SHEETJS = ["https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
                 "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT"];
let sheetjsReady;
function sheetjs() {
  return sheetjsReady ??= new Promise((ok, fail) => {
    const s = document.createElement("script");  // a library loader, never shown
    s.src = SHEETJS[0]; s.integrity = SHEETJS[1]; s.crossOrigin = "anonymous";
    s.onload = ok; s.onerror = () => fail(new Error("could not load SheetJS"));
    document.head.append(s);
  });
}
async function workbook(bytes) {
  await sheetjs();
  const wb = globalThis.XLSX.read(bytes, {type: "array"});
  return [views(wb.SheetNames.map(name => [name.toUpperCase(), () => [{t: "table", rows:
    globalThis.XLSX.utils.sheet_to_json(wb.Sheets[name], {header: 1, defval: ""}).map(r => r.map(String))}]]))];
}

// ---- layout ----
function wrap(runs, width) {  // lines of positioned segments
  const lines = [{segs: [], h: 0}];
  let x = 0;
  const newline = () => { lines.push({segs: [], h: 0}); x = 0; };
  for (const r of runs) {
    const size = r.size || TEXT, f = font(size, r.bold, r.mono);
    measure.font = f;
    for (const part of String(r.text).split(/(\n|\s+)/)) {
      if (!part) continue;
      if (part === "\n") { lines.at(-1).h = Math.max(lines.at(-1).h, size * LINE); newline(); continue; }
      const space = /^\s+$/.test(part);
      if (space && x === 0) continue;
      let w = measure.measureText(part).width;
      if (!space && x > 0 && x + w > width) newline();
      let text = part;
      while (!space && w > width) {  // a word longer than the line: break it
        let n = Math.max(1, Math.floor(text.length * width / w));
        while (n > 1 && measure.measureText(text.slice(0, n)).width > width - x) n--;
        lines.at(-1).segs.push({text: text.slice(0, n), x, f, color: r.color});
        lines.at(-1).h = Math.max(lines.at(-1).h, size * LINE);
        newline();
        text = text.slice(n);
        w = measure.measureText(text).width;
      }
      lines.at(-1).segs.push({text, x, f, color: r.color});
      lines.at(-1).h = Math.max(lines.at(-1).h, size * LINE);
      x += w;
    }
  }
  return lines.filter((l, i) => l.segs.length || i < lines.length - 1).map(l => ({...l, h: l.h || TEXT * LINE}));
}
function drawSegs(ctx, segs, x, y, color = C.white) {
  for (const s of segs) {
    ctx.font = s.f;
    ctx.fillStyle = s.color || color;
    ctx.fillText(s.text, x + s.x, y);
  }
}

export class Doc {
  constructor(blocks, changed) {
    this.blocks = blocks;
    this.view = 0;  // which option every multi-view block shows (PREVIEW / SOURCE, sheets)
    this.views = 0;  // the most options a block has; 0 when no block has a choice
    this.changed = changed;
    this.items = [];
    this.height = 0;
    this.width = -1;
    this.pending = 0;
  }

  layout(width) {
    this.width = width;
    const items = [];
    let y = 0, maxViews = 0;
    const add = (h, draw, extra) => { items.push({y, h, draw, ...extra}); y += h; };
    const place = (b, w0, base = 0) => {  // base: indent of the enclosing views or async block
      const ind = ((b.indent || 0) + base) * INDENT, x = ind, w = w0 - ind;
      switch (b.t) {
        case "p": case "h": {
          const size = b.t === "h" ? HEAD[b.level] || TEXT : TEXT;
          const runs = b.t === "h" ? b.runs.map(r => ({...r, size, bold: true})) : b.runs;
          if (b.t === "h") y += 10;
          for (const l of wrap(runs, w)) add(l.h, (c, X, Y) => drawSegs(c, l.segs, X + x, Y + l.h * 0.78));
          y += b.t === "h" ? 6 : 10;
          break;
        }
        case "field": {
          y += 6;
          add(SMALL * 1.6, (c, X, Y) => {
            c.font = font(SMALL, true);
            c.fillStyle = C.cyan;
            c.fillText("▸ " + b.text, X + x, Y + SMALL * 1.15);
          });
          break;
        }
        case "label": {
          y += 8;
          add(SMALL * 1.5, (c, X, Y) => {
            c.font = font(SMALL - 2, true);
            c.fillStyle = b.color || C.grey;
            c.fillText(b.text, X + x, Y + SMALL * 1.1);
          });
          break;
        }
        case "kv": {
          measure.font = font(SMALL, true);
          const kw = b.key ? Math.min(w * 0.35, measure.measureText(b.key).width + 18) : 0;
          const lines = wrap([{text: b.value, mono: true, size: CODE}], w - kw);
          lines.forEach((l, i) => add(l.h, (c, X, Y) => {
            if (i === 0 && b.key) {
              c.font = font(SMALL, true);
              c.fillStyle = C.grey;
              c.fillText(ellipsis(c, b.key, kw - 18), X + x, Y + l.h * 0.78);
            }
            drawSegs(c, l.segs, X + x + kw, Y + l.h * 0.78);
          }));
          y += 4;
          break;
        }
        case "chips": {
          y += 6;
          add(44, (c, X, Y) => {
            let cx = X + x;
            c.font = font(SMALL - 2, true);
            for (const [text, color] of b.chips) {
              const tw = c.measureText(text).width + 24;
              c.strokeStyle = color; c.lineWidth = 2;
              c.strokeRect(cx + 1, Y + 4, tw, 32);
              c.fillStyle = color;
              c.fillText(text, cx + 13, Y + 27);
              cx += tw + 12;
            }
          });
          break;
        }
        case "box": {
          const lines = [...(b.list || []).flatMap(r => wrap(r, w - 40)), ...wrap(b.runs || [], w - 40)];
          const h = 54 + lines.reduce((s, l) => s + l.h, 0) + 14;
          y += 6;
          add(h, (c, X, Y) => {
            c.fillStyle = C.panel;
            c.fillRect(X + x, Y, w, h);
            c.fillStyle = b.color;
            c.fillRect(X + x, Y, 6, h);
            c.font = font(SMALL, true);
            c.fillText(b.title, X + x + 24, Y + 34);
            let ly = Y + 50;
            for (const l of lines) { drawSegs(c, l.segs, X + x + 24, ly + l.h * 0.78); ly += l.h; }
          });
          y += 12;
          break;
        }
        case "rule": y += 12; add(14, (c, X, Y) => { c.fillStyle = C.line; c.fillRect(X, Y + 6, w0, 2); }); break;
        case "code": placeCode(b, x, w, add, () => y, v => { y = v; }); break;
        case "table": placeTable(b, x, w, add); y += 10; break;
        case "image": {
          const k = Math.min(1, w / b.img.width), h = b.img.height * k;
          add(h + 12, (c, X, Y) => {
            c.drawImage(b.img, X + x, Y, b.img.width * k, h);
            c.strokeStyle = C.line; c.lineWidth = 2;
            c.strokeRect(X + x, Y, b.img.width * k, h);
          });
          break;
        }
        case "views": {
          maxViews = Math.max(maxViews, b.options.length);
          const i = this.view % b.options.length;
          const names = b.options.map(([name], j) => (j === i ? "[" + name + "]" : name)).join("   ");
          add(SMALL * 1.7, (c, X, Y) => {
            c.font = font(SMALL - 2, true);
            c.fillStyle = C.magenta;
            c.fillText("VIEW  " + names + "   (V or VIEW key)", X + x, Y + SMALL * 1.2);
          });
          for (const inner of (b.cache[i] ??= b.options[i][1]())) place(inner, w0, base + (b.indent || 0));
          break;
        }
        case "async": {
          if (b.blocks) { for (const inner of b.blocks) place(inner, w0, base + (b.indent || 0)); break; }
          if (!b.error && !b.watched) {
            b.watched = true;
            this.pending++;
            b.promise.finally(() => { this.pending--; this.width = -1; this.changed(); });
          }
          add(SMALL * 1.8, (c, X, Y) => {
            c.font = font(SMALL, true);
            c.fillStyle = b.error ? C.red : C.amber;
            c.fillText(b.error ? b.label + " COULD NOT BE SHOWN: " + b.error : "LOADING " + b.label + "…", X + x, Y + SMALL * 1.2);
          });
          break;
        }
        case "row": {
          add(SMALL * 1.9, (c, X, Y) => {
            if (b.selected) { c.fillStyle = C.panel; c.fillRect(X + x, Y, w, SMALL * 1.9); }
            drawSegs(c, wrap(b.runs, 1e6)[0].segs, X + x + 8, Y + SMALL * 1.3);
          }, {hit: b.hit});
          break;
        }
        case "gap": y += b.h; break;
      }
    };
    for (const b of this.blocks) place(b, width);
    this.items = items;
    this.height = y;
    this.views = maxViews;
  }

  draw(ctx, x, top, height, scroll, width) {
    if (width !== this.width) this.layout(width);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 4, top, width + 8, height);
    ctx.clip();
    let lo = 0, hi = this.items.length;  // first item that reaches the top edge
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.items[m].y + this.items[m].h < scroll) lo = m + 1; else hi = m; }
    for (let i = lo; i < this.items.length && this.items[i].y < scroll + height; i++)
      this.items[i].draw(ctx, x, top + this.items[i].y - scroll);
    ctx.restore();
  }

  hit(y) {
    const item = this.items.find(i => y >= i.y && y < i.y + i.h);
    return item && item.hit;
  }
}

function placeCode(b, x, w, add, getY, setY) {
  const lines = b.lines || (b.lines = highlight(b.text, b.lang));
  measure.font = font(CODE, false, true);
  const cw = measure.measureText("MMMMMMMMMM").width / 10, lh = CODE * CODE_LINE;
  const gutter = b.gutter ? String(lines.length).length * cw + 22 : 0;
  const cols = Math.max(10, Math.floor((w - gutter - 28) / cw));
  const rows = [];
  lines.forEach((tokens, i) => {
    let row = {num: i + 1, segs: [], n: 0};
    rows.push(row);
    if (b.prompt && i === 0) { row.segs.push({text: "$ ", color: C.green}); row.n = 2; }
    for (const t of tokens) {
      let text = t.text;
      while (text) {
        const room = cols - row.n;
        if (room <= 0) { row = {num: null, segs: [], n: 0}; rows.push(row); continue; }
        row.segs.push({text: text.slice(0, room), color: t.color});
        row.n += Math.min(room, text.length);
        text = text.slice(room);
      }
    }
  });
  setY(getY() + 4);
  const pad = 10, last = rows.length - 1;
  rows.forEach((r, i) => {
    const h = lh + (i === 0 ? pad : 0) + (i === last ? pad : 0), off = i === 0 ? pad : 0;
    add(h, (c, X, Y) => {
      c.fillStyle = C.panel;
      c.fillRect(X + x, Y, w, h);
      c.font = font(CODE, false, true);
      if (b.gutter && r.num !== null) {
        c.fillStyle = C.dim;
        c.textAlign = "right";
        c.fillText(String(r.num), X + x + gutter - 12, Y + off + lh * 0.75);
        c.textAlign = "left";
      }
      let cx = X + x + gutter + 14;
      for (const s of r.segs) {
        c.fillStyle = s.color || b.color || C.white;
        c.fillText(s.text, cx, Y + off + lh * 0.75);
        cx += s.text.length * cw;
      }
    });
  });
  setY(getY() + 12);
}

function placeTable(b, x, w, add) {
  const rows = b.rows.slice(0, 3000), cols = Math.max(1, ...rows.map(r => r.length));
  measure.font = font(SMALL);
  const widths = Array(cols).fill(60);
  for (const r of rows.slice(0, 200)) r.forEach((cell, i) => {
    widths[i] = Math.max(widths[i], Math.min(420, measure.measureText(String(cell)).width + 24));
  });
  const total = widths.reduce((a, b) => a + b, 0), k = total > w ? w / total : 1;
  const ws = widths.map(v => v * k), rh = SMALL * 1.7;
  rows.forEach((r, ri) => add(rh, (c, X, Y) => {
    c.fillStyle = ri === 0 ? "#10202a" : ri % 2 ? C.panel : C.bg;
    c.fillRect(X + x, Y, ws.reduce((a, b) => a + b, 0), rh);
    c.font = font(SMALL, ri === 0);
    let cx = X + x;
    for (let i = 0; i < cols; i++) {
      c.fillStyle = ri === 0 ? C.cyan : C.white;
      c.fillText(ellipsis(c, String(r[i] ?? ""), ws[i] - 16), cx + 8, Y + rh * 0.7);
      c.fillStyle = C.line;
      c.fillRect(cx, Y, 1, rh);
      cx += ws[i];
    }
  }));
  if (b.rows.length > rows.length)
    add(SMALL * 1.6, (c, X, Y) => {
      c.font = font(SMALL, true);
      c.fillStyle = C.amber;
      c.fillText(b.rows.length - rows.length + " more rows not shown", X + x, Y + SMALL * 1.2);
    });
}
