// Per-language copies of the reader-facing pages, at addresses a crawler can read.
//
// index.html and plus/index.html each carry five translations and hand them to a browser that asks
// in that language. A crawler asks in none, so Google has only ever seen the English pages, and a
// link pasted in a Japanese chat previews in English. This writes /ja/, /fr/, /es/, /de/, /pt/ and
// the same five under /plus/ out of those pages' own dictionaries: no second copy of the words, no
// hand-edited page to go stale. The English page is the only source. Re-run after editing either:
//
//   node tools/make-lang-pages.mjs
//
// Each page is the same markup with the strings already substituted, <html lang> and data-lang set
// (so the runtime agrees with the address instead of re-guessing), its own canonical and og tags,
// and the shared block of hreflang alternates. Within a language the pages link to each other, so
// a reader who arrives at /ja/ stays in Japanese when they tap through to Plus. The
// MobileApplication JSON-LD is dropped from the translated home pages: one app entity belongs to
// one URL, and that URL is the English home page.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// What differs between the two pages, and nothing else does.
const PAGES = [
  {
    src: "index.html",
    out: (lang) => [lang, "index.html"],
    canonical: "https://phuzzles.app/",
    ogUrl: "https://phuzzles.app/",
    href: (lang) => `https://phuzzles.app/${lang}/`,
    // The deck is the sentence the page leads with, already written and already shipped in this
    // language. A search snippet and a chat preview get that, rather than new words.
    descKey: "deck",
    dropJsonLd: true,
    // Keep a reader inside their own language when they tap through to the Plus page.
    links: (lang) => [['href="/plus"', `href="/${lang}/plus/"`]],
  },
  {
    src: "plus/index.html",
    out: (lang) => [lang, "plus", "index.html"],
    canonical: "https://phuzzles.app/plus/",
    ogUrl: "https://phuzzles.app/plus",
    href: (lang) => `https://phuzzles.app/${lang}/plus/`,
    descKey: "lede",
    dropJsonLd: false,
    // The logo and the footer point home: the translated home page, not the English one.
    links: (lang) => [['href="/"', `href="/${lang}/"`]],
  },
  {
    // The daily archive. Written by tools/make-daily-archive.mjs, which re-runs this script, so the
    // copies cannot survive a restock of the page they were copied from.
    src: "daily/index.html",
    out: (lang) => [lang, "daily", "index.html"],
    canonical: "https://phuzzles.app/daily/",
    ogUrl: "https://phuzzles.app/daily/",
    href: (lang) => `https://phuzzles.app/${lang}/daily/`,
    // This page marks its strings with `id="t-h1"` rather than data-i18n, because its own runtime
    // i18n addresses them by id.
    attr: "id",
    keyOf: (key) => `t-${key}`,
    // It has no title string of its own: the h1 is the headline in every language, and the lede is
    // the sentence it leads with, so the snippet and the chat preview get words already shipped.
    titleKey: "h1",
    descKey: "lede1",
    // Several of its strings are functions of the puzzle count, which the page states once.
    fnArg: (src) => Number(src.match(/var N = (\d+);/)[1]),
    // The ItemList describes the 39 puzzles once, at the English address.
    dropJsonLd: true,
    // "How Phuzzles works" and the footer wordmark point home; both appear in the markup with double
    // quotes and inside the dictionary with single ones. /today/ is left alone: it has no address of
    // its own and localises itself from the browser.
    links: (lang) => [['href="/"', `href="/${lang}/"`], ["href='/'", `href='/${lang}/'`]],
    // The per-card "16 pieces" labels are the one string that repeats, so they are keyed by piece
    // count in the markup rather than by name. Without this a translated page carries 39 English
    // labels until its own script re-applies them.
    each: (out, d) => d.pieces ? out.replace(/(<em data-pc="(\d+)">)[^<]*/g,
      (_, open, pc) => open + d.pieces(Number(pc))) : out,
  },
];

// Replace the contents of the element carrying `attr="key"`, counting nested tags of the same name
// so a <p data-i18n> holding a <b> is replaced whole and not cut at the inner tag.
function replaceInner(html, attr, key, value) {
  const at = html.indexOf(`${attr}="${key}"`);
  if (at < 0) return { html, hit: false };
  const open = html.lastIndexOf("<", at);
  const tag = html.slice(open + 1).match(/^[a-zA-Z0-9]+/)[0];
  // An <img> marked with the key carries its string in alt, not in children it cannot have.
  if (/^(img|input|br|hr|meta|link|source)$/i.test(tag)) return { html, hit: false };
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

// Rewrite a link everywhere it appears, including inside the runtime dictionary further down the
// page, where the same link is a JS string literal with its quotes escaped. Measured: substituting
// the markup alone is not enough. The i18n script re-applies every dictionary string on load, so a
// link missed in the dictionary is silently put back and the reader leaves their own language.
function relink(html, pairs) {
  const esc = (s) => s.replace(/"/g, '\\"');
  for (const [from, to] of pairs) html = html.replaceAll(from, to).replaceAll(esc(from), esc(to));
  return html;
}

// Entities and tags are fine inside the page; a <meta content> wants neither.
const plain = (s) => s.replace(/<[^>]+>/g, "").replace(/&middot;/g, "·").replace(/&times;/g, "×");

// A dictionary value is a finished string, or a function of the one number the page states (the
// puzzle count). Anything else -- a function needing runtime state -- stays for the page's own
// script to apply.
function str(value, n) {
  if (typeof value === "string") return value;
  if (typeof value === "function" && n !== null && value.length === 1) {
    const out = value(n);
    return typeof out === "string" ? out : null;
  }
  return null;
}

let pages = 0, total = 0;
for (const page of PAGES) {
  const src = readFileSync(join(root, page.src), "utf8");

  // The dictionary, read out of the page rather than duplicated here.
  const n0 = page.fnArg ? page.fnArg(src) : null;
  const dict = src.match(/var STR = (\{[\s\S]*?\n {2}\});/);
  if (!dict) throw new Error(`${page.src}: could not find \`var STR = {...};\` — did the i18n block move?`);
  const STR = new Function("return " + dict[1])();

  for (const [lang, d] of Object.entries(STR)) {
    let out = src;
    let n = 0;

    out = out.replace('<html lang="en">', `<html lang="${lang}" data-lang="${lang}">`);
    if (out.indexOf(`data-lang="${lang}"`) < 0) throw new Error(`${page.src}: <html lang="en"> not found`);

    const title = d[page.titleKey || "title"];
    if (title) {
      out = out.replace(/<title>[^<]*<\/title>/, `<title>${plain(title)}</title>`);
      out = out.replace(/(<meta property="og:title" content=")[^"]*"/, `$1${plain(title)}"`);
    }
    const desc = str(d[page.descKey], n0);
    if (desc) {
      out = out.replace(/(<meta name="description" content=")[^"]*"/, `$1${plain(desc)}"`);
      out = out.replace(/(<meta property="og:description" content=")[^"]*"/, `$1${plain(desc)}"`);
    }
    out = out.replace(`<link rel="canonical" href="${page.canonical}" />`,
                      `<link rel="canonical" href="${page.href(lang)}" />`);
    out = out.replace(`<meta property="og:url" content="${page.ogUrl}" />`,
                      `<meta property="og:url" content="${page.href(lang)}" />`);
    if (page.dropJsonLd) out = out.replace(/ *<script type="application\/ld\+json">[\s\S]*?<\/script>\n/, "");

    const attr = page.attr || "data-i18n";
    const keyOf = page.keyOf || ((key) => key);
    for (const [key, raw] of Object.entries(d)) {
      const value = str(raw, n0);
      if (value === null) continue;                 // swaps(), inPlace() and friends stay runtime
      const k = keyOf(key);
      let r = replaceInner(out, attr, k, value);
      if (r.hit) { out = r.html; n++; }
      r = setAttr(out, attr === "id" ? attr : "data-i18n-alt", attr === "id" ? k : key, "alt", plain(value));
      if (r.hit) { out = r.html; n++; }
      r = setAttr(out, attr === "id" ? attr : "data-i18n-label", attr === "id" ? k : key, "aria-label", plain(value));
      if (r.hit) { out = r.html; n++; }
    }

    if (page.each) out = page.each(out, d);
    out = relink(out, page.links(lang));

    const parts = page.out(lang);
    mkdirSync(join(root, ...parts.slice(0, -1)), { recursive: true });
    writeFileSync(join(root, ...parts), out);
    console.log(`${parts.join("/")}  ${n} strings substituted, ${out.length} bytes`);
    pages++; total += n;
  }
}
console.log(`${pages} pages, ${total} substitutions`);
