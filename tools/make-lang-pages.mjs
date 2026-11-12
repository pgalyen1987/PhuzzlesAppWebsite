// Per-language copies of the home page, at addresses a crawler can read.
//
// index.html already carries five translations and hands them to a browser that asks in that
// language. A crawler asks in none, so Google has only ever seen the English page, and a link to
// phuzzles.app pasted in a Japanese chat previews in English. This writes /ja/, /fr/, /es/, /de/
// and /pt/ out of index.html's own dictionary: no second copy of the words, no hand-edited page to
// go stale. index.html is the only source. Re-run it after any edit to index.html:
//
//   node tools/make-lang-pages.mjs
//
// Each page is the same markup with the strings already substituted, <html lang> and data-lang set
// (so the runtime agrees with the address instead of re-guessing), its own canonical and og tags,
// and the shared block of hreflang alternates. The MobileApplication JSON-LD is dropped: one app
// entity belongs to one URL, and that URL is the English home page.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "index.html"), "utf8");

// The dictionary, read out of the page rather than duplicated here.
const dict = src.match(/var STR = (\{[\s\S]*?\n {2}\});/);
if (!dict) throw new Error("index.html: could not find `var STR = {...};` — did the i18n block move?");
const STR = new Function("return " + dict[1])();

// Replace the contents of the element carrying `attr="key"`, counting nested tags of the same name
// so a <p data-i18n> holding a <b> is replaced whole and not cut at the inner tag.
function replaceInner(html, attr, key, value) {
  const at = html.indexOf(`${attr}="${key}"`);
  if (at < 0) return { html, hit: false };
  const open = html.lastIndexOf("<", at);
  const tag = html.slice(open + 1).match(/^[a-zA-Z0-9]+/)[0];
  const openEnd = html.indexOf(">", at);
  let i = openEnd + 1, depth = 1, close = -1;
  const o = new RegExp(`<${tag}[\\s>]`, "i"), c = new RegExp(`</${tag}>`, "i");
  while (i < html.length) {
    const no = html.slice(i).search(o), nc = html.slice(i).search(c);
    if (nc < 0) break;
    if (no >= 0 && no < nc) { depth++; i += no + 1; continue; }
    depth--;
    if (depth === 0) { close = i + nc; break; }
    i += nc + 1;
  }
  if (close < 0) throw new Error(`${attr}="${key}": no closing </${tag}>`);
  return { html: html.slice(0, openEnd + 1) + value + html.slice(close), hit: true };
}

function setAttr(html, selectorAttr, key, attrName, value) {
  const at = html.indexOf(`${selectorAttr}="${key}"`);
  if (at < 0) return { html, hit: false };
  const open = html.lastIndexOf("<", at);
  const openEnd = html.indexOf(">", at);
  let tag = html.slice(open, openEnd + 1);
  const re = new RegExp(`\\s${attrName}="[^"]*"`);
  if (!re.test(tag)) return { html, hit: false };
  tag = tag.replace(re, ` ${attrName}="${value.replace(/"/g, "&quot;")}"`);
  return { html: html.slice(0, open) + tag + html.slice(openEnd + 1), hit: true };
}

// Entities and tags are fine inside the page; a <meta content> wants neither.
const plain = (s) => s.replace(/<[^>]+>/g, "").replace(/&middot;/g, "·").replace(/&times;/g, "×");

let total = 0;
for (const [lang, d] of Object.entries(STR)) {
  let out = src;
  let n = 0;

  out = out.replace('<html lang="en">', `<html lang="${lang}" data-lang="${lang}">`);
  if (out.indexOf(`data-lang="${lang}"`) < 0) throw new Error("index.html: <html lang=\"en\"> not found");

  if (d.title) {
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${d.title}</title>`);
    out = out.replace(/(<meta property="og:title" content=")[^"]*"/, `$1${plain(d.title)}"`);
  }
  // The deck is the sentence the page leads with, already written and already shipped in this
  // language. A search snippet and a chat preview get that, rather than new words.
  if (d.deck) {
    out = out.replace(/(<meta name="description" content=")[^"]*"/, `$1${plain(d.deck)}"`);
    out = out.replace(/(<meta property="og:description" content=")[^"]*"/, `$1${plain(d.deck)}"`);
  }
  out = out.replace('<link rel="canonical" href="https://phuzzles.app/" />',
                    `<link rel="canonical" href="https://phuzzles.app/${lang}/" />`);
  out = out.replace('<meta property="og:url" content="https://phuzzles.app/" />',
                    `<meta property="og:url" content="https://phuzzles.app/${lang}/" />`);
  out = out.replace(/ {2}<script type="application\/ld\+json">[\s\S]*?<\/script>\n/, "");

  for (const [key, value] of Object.entries(d)) {
    if (typeof value !== "string") continue;      // swaps(), inPlace() and friends stay runtime
    let r = replaceInner(out, "data-i18n", key, value);
    if (r.hit) { out = r.html; n++; }
    r = setAttr(out, "data-i18n-alt", key, "alt", plain(value));
    if (r.hit) { out = r.html; n++; }
    r = setAttr(out, "data-i18n-label", key, "aria-label", plain(value));
    if (r.hit) { out = r.html; n++; }
  }

  mkdirSync(join(root, lang), { recursive: true });
  writeFileSync(join(root, lang, "index.html"), out);
  const left = (out.match(/data-i18n="/g) || []).length;
  console.log(`${lang}/index.html  ${n} strings substituted, ${out.length} bytes`);
  total += n;
}
console.log(`${Object.keys(STR).length} pages, ${total} substitutions`);
