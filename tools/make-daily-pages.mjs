#!/usr/bin/env node
/**
 * One page per PAST Puzzle of the Day, at /daily/<YYYY-MM-DD>/.
 *
 * Why these exist: every past daily was reachable only as /solve/?p=<id>, a query string on a
 * single page. Google largely treats that as ONE url, so 48 real artifacts -- a different
 * public-domain photograph, caption, difficulty and credit each -- were competing for one
 * address. These give each one its own, with the words that make it findable.
 *
 * ONLY PAST DAILIES. The vetted pool holds 368 photographs queued as future dailies; a page per
 * pool entry would publish the next year of answers, which is the one thing the product is about.
 * The source of truth for "has been the daily" is the potd_days collection, so a puzzle cannot
 * appear here before the day it ran.
 *
 * THE PREVIEW IS SCRAMBLED, for the same reason /daily/ scrambles its cards: the stored thumbnail
 * is the SOLVED picture. Each page cuts it into a 3x3 grid and shuffles with a seed derived from
 * the puzzle id, so the scramble is stable across regenerations and the order() helper never
 * returns the identity permutation. og:image is the site's generic card rather than the thumbnail,
 * because a social preview of the solved photo would spoil the puzzle in the feed.
 *
 * Attribution is not decoration. Every photograph is CC0 or public domain, and some licences --
 * NASA/JPL among them -- require the credit line. The credit, licence and the source page come
 * from ~/boss/data/phuzzles-potd/manifest.json, joined to the puzzle on its exact message text,
 * which is what seed-potd.mjs wrote into Firestore. A puzzle with no manifest match (an older
 * daily, from before the manifest) gets a page without a provenance block rather than an invented
 * one.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=~/.config/rebel-studios/firebase-boss-sa.json \
 *     node tools/make-daily-pages.mjs            write the pages and refresh sitemap.xml
 *   node tools/make-daily-pages.mjs --dry        say what it would write, touch nothing
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const DRY = process.argv.includes("--dry");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const require = createRequire("/home/me/AndroidStudioProjects/PhuzzlesApp/functions/package.json");
const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: "phuzzles" });
}
const db = admin.firestore();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const PIECES = { EASY: 9, MEDIUM: 16, HARD: 25, EXPERT: 36 };

const fmt = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
};

/** Deterministic per-puzzle shuffle, identical to the archive's, and never the identity. */
const order = (seedStr) => {
  let h = 2166136261;
  for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const a = [...Array(9).keys()];
  for (let i = 8; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.every((v, i) => v === i) ? [...a.slice(1), a[0]] : a;
};

/** Join key: the caption text itself, which seed-potd.mjs copied verbatim into Firestore. */
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// ─── The photographs' provenance ────────────────────────────────────────────────
const MANIFEST = "/home/me/boss/data/phuzzles-potd/manifest.json";
const byMessage = new Map();
if (fs.existsSync(MANIFEST)) {
  const raw = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  for (const e of Array.isArray(raw) ? raw : raw.entries || []) {
    if (e && e.message) byMessage.set(norm(e.message), e);
  }
}

// ─── What has actually been the daily ───────────────────────────────────────────
const days = (await db.collection("potd_days").get()).docs
  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.id))
  .sort((a, b) => b.id.localeCompare(a.id));

const rows = [];
for (const d of days) {
  const pid = d.get("puzzleId");
  if (!pid) continue;
  const p = await db.collection("puzzles").doc(pid).get();
  if (!p.exists) continue;
  const message = String(p.get("message") || "");
  const lines = message.split("\n").map((s) => s.trim()).filter(Boolean);
  // line 0 is "Puzzle of the Day for <weekday>, <month> <day>." The caption is what follows, and
  // the credit is split off so it can be presented as a credit rather than as prose.
  const body = lines.slice(1).join(" ");
  const caption = body.split(/\s(?:Photo|Image|Credit):/)[0].trim();
  const entry = byMessage.get(norm(caption));
  rows.push({
    date: d.id,
    id: pid,
    thumb: p.get("thumbnailUrl") || "",
    pieces: PIECES[p.get("difficulty") || "MEDIUM"] || 16,
    caption,
    title: entry?.title || "",
    credit: entry?.credit || "",
    licence: entry?.licence || "",
    source: entry?.sourcePage || "",
  });
}

if (!rows.length) {
  console.error("make-daily-pages: potd_days returned nothing; writing no pages.");
  process.exit(1);
}

// The gtag block is read from the shipped index.html rather than copied, so a change there cannot
// silently drop analytics from these pages. Fail loudly if it ever moves.
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const gtagMatch = indexHtml.match(/<script>\s*window\.dataLayer[\s\S]*?<\/script>/);
if (!gtagMatch) throw new Error("make-daily-pages: gtag <script> block not found in index.html");
const gtag = gtagMatch[0];

/** A heading that says what the picture is, which is also what somebody would type. */
const headingOf = (r) => r.title || r.caption.split(/[.,;]/)[0].trim() || `Phuzzle of ${fmt(r.date)}`;

const page = (r, prev, next) => {
  const heading = headingOf(r);
  const url = `https://phuzzles.app/daily/${r.date}/`;
  const tiles = order(r.id).map((src) => {
    const x = (src % 3) * 50, y = Math.floor(src / 3) * 50;
    return `<i style="background-image:url('${esc(r.thumb)}');background-position:${x}% ${y}%"></i>`;
  }).join("");

  // Schema that is true: the page is about a photograph we may republish, and the licence and
  // credit are the facts worth marking up. No ratings, no counts, nothing we cannot show.
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Game",
    name: `${heading} — photo puzzle`,
    url,
    datePublished: r.date,
    genre: "Jigsaw puzzle",
    gamePlatform: "Web browser",
    description: r.caption,
    isAccessibleForFree: true,
    ...(r.source || r.licence || r.credit
      ? {
          about: {
            "@type": "ImageObject",
            ...(r.caption ? { caption: r.caption } : {}),
            ...(r.source ? { sameAs: r.source } : {}),
            ...(r.licence ? { license: r.licence } : {}),
            ...(r.credit ? { creditText: r.credit.replace(/^(Photo|Image|Credit):\s*/, "") } : {}),
          },
        }
      : {}),
  };

  const provenance = (r.credit || r.licence || r.source)
    ? `
    <section class="prov">
      <h2>The photograph</h2>
      ${r.credit ? `<p class="credit">${esc(r.credit)}</p>` : ""}
      ${r.licence ? `<p>${esc(r.licence)}</p>` : ""}
      ${r.source ? `<p><a href="${esc(r.source)}" rel="noopener nofollow">Where this picture came from</a></p>` : ""}
    </section>`
    : "";

  const nav = `
    <nav class="pager">
      ${next ? `<a href="/daily/${next.date}/" rel="next">Newer: ${esc(fmt(next.date))}</a>` : "<span></span>"}
      ${prev ? `<a href="/daily/${prev.date}/" rel="prev">Older: ${esc(fmt(prev.date))}</a>` : "<span></span>"}
    </nav>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(heading)} — photo puzzle, ${r.pieces} pieces</title>
<meta name="description" content="${esc(`${r.caption} A ${r.pieces}-piece photo puzzle you can solve in your browser: no app, no account.`)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(heading)} — photo puzzle, ${r.pieces} pieces" />
<meta property="og:description" content="${esc(r.caption)}" />
<!-- Deliberately the generic card: the stored thumbnail is the SOLVED picture, and a feed preview
     of it would give the puzzle away before anyone opened it. -->
<meta property="og:image" content="https://phuzzles.app/img/og-daily.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#1A1A2E" />
<link rel="icon" href="/logo-128.png" />
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
${gtag}
<style>
@font-face { font-family:'Archivo'; src:url('/fonts/archivo-var-latin.woff2') format('woff2'); font-weight:700 900; font-stretch:62% 125%; font-display:swap; }
@font-face { font-family:'DM Sans'; src:url('/fonts/dm-sans-var-latin.woff2') format('woff2'); font-weight:400 600; font-display:swap; }
:root{--coral:#FF6B6B;--ink:#1A1A2E;--muted:#A9A9C6;--panel:#23233E;--teal:#4ECDC4;--text:#F5F3EF}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--ink);color:var(--text);font-family:'DM Sans',system-ui,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
/* 610px of content against the 987px wrap is phi; the grid sits in the narrower column. */
.wrap{max-width:987px;margin:0 auto;padding:56px 20px 80px}
.crumb{color:var(--muted);font-size:14px}
.crumb a{color:var(--teal)}
h1{font-family:'Archivo',sans-serif;font-weight:800;font-size:clamp(30px,5vw,47px);line-height:1.08;letter-spacing:-.02em;margin-top:13px;max-width:34ch}
.when{color:var(--muted);margin-top:10px;font-size:15px}
.lede{margin-top:21px;max-width:60ch;font-size:18px}
.board{display:grid;grid-template-columns:repeat(3,1fr);aspect-ratio:1;gap:1px;background:#15152a;max-width:377px;margin-top:34px;border-radius:14px;overflow:hidden}
.board i{display:block;background-size:300% 300%;background-repeat:no-repeat}
.play{display:inline-block;margin-top:21px;background:var(--coral);color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:10px}
.play:focus-visible{outline:2px solid var(--teal);outline-offset:3px}
.scrambled{color:var(--muted);font-size:13.5px;margin-top:13px}
.prov{margin-top:55px;max-width:60ch;border-top:1px solid #32324f;padding-top:21px}
.prov h2{font-family:'Archivo',sans-serif;font-weight:800;font-size:21px;letter-spacing:-.01em}
.prov p{color:var(--muted);font-size:14.5px;margin-top:8px}
.prov .credit{color:var(--text)}
.prov a{color:var(--teal)}
.pager{display:flex;justify-content:space-between;gap:16px;margin-top:55px;font-size:14.5px}
.pager a{color:var(--teal);text-decoration:none}
.pager a:hover{text-decoration:underline}
footer{margin-top:34px;color:var(--muted);font-size:14px}
footer a{color:var(--teal)}
</style>
</head>
<body>
<div class="wrap">
  <p class="crumb"><a href="/">Phuzzles</a> &rsaquo; <a href="/daily/">Every daily puzzle</a></p>
  <h1>${esc(heading)}</h1>
  <p class="when">Puzzle of the Day, ${esc(fmt(r.date))} &middot; ${r.pieces} pieces</p>
  <p class="lede">${esc(r.caption)}</p>
  <div class="board" aria-hidden="true">${tiles}</div>
  <p class="scrambled">The tiles above are shuffled, not the picture.</p>
  <p><a class="play" href="/solve/?p=${esc(r.id)}">Solve this puzzle</a></p>
${provenance}
${nav}
  <footer><a href="/daily/">All ${rows.length} daily puzzles</a> &middot; <a href="/">What Phuzzles is</a></footer>
</div>
</body>
</html>
`;
};

// ─── Write ──────────────────────────────────────────────────────────────────────
let written = 0;
rows.forEach((r, i) => {
  // rows are newest-first, so the NEXT page chronologically is the previous index.
  const html = page(r, rows[i + 1], rows[i - 1]);
  const dir = path.join(root, "daily", r.date);
  const file = path.join(dir, "index.html");
  if (DRY) {
    console.log(`would write daily/${r.date}/index.html  ${String(html.length).padStart(6)} bytes  ${headingOf(r)}`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, html);
  written += 1;
});

// ─── sitemap.xml, between markers so re-running replaces rather than appends ────
const SITEMAP = path.join(root, "sitemap.xml");
const START = "  <!-- daily-pages: written by tools/make-daily-pages.mjs, do not hand-edit -->";
const END = "  <!-- /daily-pages -->";
const block = [START,
  ...rows.map((r) =>
    `  <url><loc>https://phuzzles.app/daily/${r.date}/</loc><lastmod>${r.date}</lastmod>` +
    `<changefreq>yearly</changefreq><priority>0.5</priority></url>`),
  END].join("\n");

if (!DRY && fs.existsSync(SITEMAP)) {
  let xml = fs.readFileSync(SITEMAP, "utf8");
  const re = new RegExp(`${START.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  xml = re.test(xml)
    ? xml.replace(re, block.trim())
    : xml.replace(/<\/urlset>/, `${block}\n</urlset>`);
  fs.writeFileSync(SITEMAP, xml);
}

const withProv = rows.filter((r) => r.credit || r.licence || r.source).length;
console.log(`${DRY ? "would write" : "wrote"} ${DRY ? rows.length : written} pages under daily/`);
console.log(`  ${withProv} of ${rows.length} carry full photo provenance (credit, licence, source)`);
console.log(`  ${rows[rows.length - 1].date} .. ${rows[0].date}`);
if (!DRY) console.log(`  sitemap.xml: ${rows.length} urls in the daily-pages block`);
