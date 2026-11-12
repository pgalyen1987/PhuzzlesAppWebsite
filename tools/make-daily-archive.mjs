#!/usr/bin/env node
/**
 * Generate /daily/ -- every past Puzzle of the Day, each one still solvable.
 *
 * Why this page exists: 39 dailies had been produced and only one was reachable. The data was
 * there, the solver already renders a past daily (it even labels it "Yesterday's Phuzzle"), but
 * nothing linked to them.
 *
 * THE PREVIEWS ARE SCRAMBLED ON PURPOSE. The stored thumbnail is the SOLVED picture, so printing
 * it would spoil all 39 puzzles at once -- the one thing the whole product is about. Each card
 * cuts its thumbnail into a 3x3 grid and shuffles it with a seed derived from the puzzle id, so
 * the scramble is stable across regenerations and nobody sees the answer early.
 *
 * Usage: node tools/make-daily-archive.mjs   (writes daily/index.html)
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/home/me/AndroidStudioProjects/PhuzzlesApp/functions/package.json");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: "phuzzles" });
const db = admin.firestore();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const PIECES = { EASY: 9, MEDIUM: 16, HARD: 25, EXPERT: 36 };
// Cut on a word boundary: a mid-word truncation looks like a broken template, not an excerpt.
const trim = (s, n) => s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n)).replace(/[,;:]$/, "") + "\u2026";

const days = (await db.collection("potd_days").get()).docs.sort((a, b) => b.id.localeCompare(a.id));
const rows = [];
for (const d of days) {
  const pid = d.get("puzzleId");
  if (!pid) continue;
  const p = await db.collection("puzzles").doc(pid).get();
  if (!p.exists) continue;
  const msg = String(p.get("message") || "");
  const lines = msg.split("\n").map(s => s.trim()).filter(Boolean);
  rows.push({
    date: d.id,
    id: pid,
    thumb: p.get("thumbnailUrl") || "",
    difficulty: p.get("difficulty") || "MEDIUM",
    // line 0 is "Puzzle of the Day for <weekday>, <month> <day>." -- the caption is what follows.
    // The photo credit belongs on the puzzle, not on a card: left in, a 150-char slice cuts it
    // mid-name ("Photo: NPS / Rhodes S"), which reads like a bug.
    caption: lines.slice(1).join(" ").split(/\s(?:Photo|Image|Credit):/)[0].trim(),
  });
}

const fmt = (iso) => {
  const [y, m, dd] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
};
// Deterministic per-puzzle shuffle: same page every time it is regenerated.
const order = (seedStr) => {
  let h = 2166136261;
  for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const a = [...Array(9).keys()];
  for (let i = 8; i > 0; i--) { h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a.every((v, i) => v === i) ? [...a.slice(1), a[0]] : a;   // never render it already solved
};

const cards = rows.map(r => {
  const o = order(r.id);
  const tiles = o.map(src => {
    const x = (src % 3) * 50, y = Math.floor(src / 3) * 50;
    return `<i style="background-image:url('${esc(r.thumb)}');background-position:${x}% ${y}%"></i>`;
  }).join("");
  return `    <li class="card">
      <a href="/solve/?p=${esc(r.id)}">
        <span class="grid" aria-hidden="true">${tiles}</span>
        <span class="meta"><b>${esc(fmt(r.date))}</b><em>${PIECES[r.difficulty] || 16} pieces</em></span>
        <span class="cap">${esc(trim(r.caption, 150))}</span>
      </a>
    </li>`;
}).join("\n");

const jsonld = {
  "@context": "https://schema.org", "@type": "ItemList",
  name: "Every Phuzzle of the Day",
  numberOfItems: rows.length,
  itemListElement: rows.map((r, i) => ({ "@type": "ListItem", position: i + 1,
    url: `https://phuzzles.app/solve/?p=${r.id}`, name: `Phuzzle of the Day, ${fmt(r.date)}` })),
};

const gtag = fs.readFileSync("/tmp/claude-1000/-home-me/8320ef49-3c24-4b11-a089-67586866f146/scratchpad/gtag.html", "utf8").split("</script>")[0] + "</script>";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Every Phuzzle of the Day — solve any of them free</title>
<meta name="description" content="${rows.length} daily photo puzzles, newest first. Solve any of them in your browser: no app, no account, no sign-up." />
<link rel="canonical" href="https://phuzzles.app/daily/" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://phuzzles.app/daily/" />
<meta property="og:title" content="Every Phuzzle of the Day" />
<meta property="og:description" content="${rows.length} daily photo puzzles. Solve any of them in your browser, nothing to install." />
<meta property="og:image" content="https://phuzzles.app/img/og-card.jpg" />
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
.wrap{max-width:1060px;margin:0 auto;padding:56px 20px 80px}
h1{font-family:'Archivo',sans-serif;font-weight:800;font-size:clamp(34px,6vw,55px);line-height:1.06;letter-spacing:-.02em}
.lede{color:var(--muted);margin-top:16px;max-width:60ch;font-size:18px}
.lede a{color:var(--teal)}
ul{list-style:none;display:grid;gap:22px;margin-top:40px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.card a{display:block;text-decoration:none;color:inherit;background:var(--panel);border-radius:14px;overflow:hidden;
  box-shadow:0 14px 30px -18px rgba(0,0,0,.9);transition:transform .15s ease}
.card a:hover,.card a:focus-visible{transform:translateY(-3px)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);aspect-ratio:1;gap:1px;background:#15152a}
.grid i{display:block;background-size:300% 300%;background-repeat:no-repeat}
.meta{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:13px 14px 0}
.meta b{font-weight:600;font-size:15px}
.meta em{font-style:normal;color:var(--muted);font-size:13px;white-space:nowrap}
.cap{display:block;padding:6px 14px 15px;color:var(--muted);font-size:13.5px}
footer{margin-top:60px;color:var(--muted);font-size:14px}
footer a{color:var(--teal)}
</style>
</head>
<body>
<div class="wrap">
  <h1>Every Phuzzle of the Day</h1>
  <p class="lede">${rows.length} daily photo puzzles, newest first. Every one is still solvable in your browser —
     no app, no account, nothing to install. <a href="/today/">Today's is here</a>, and a new one lands at 11:00 Eastern.</p>
  <p class="lede">The previews are scrambled, same as the puzzles. That is rather the point.</p>
  <ul>
${cards}
  </ul>
  <footer>
    <a href="/">Phuzzles</a> · Made by Rebel Studios ·
    Photos are public domain or openly licensed; each puzzle credits its source.
  </footer>
</div>
</body>
</html>
`;
fs.mkdirSync("daily", { recursive: true });
fs.writeFileSync("daily/index.html", html);
console.log(`wrote daily/index.html with ${rows.length} puzzles (${(html.length/1024).toFixed(1)} KB)`);
