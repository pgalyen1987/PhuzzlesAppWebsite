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
        <span class="meta"><b>${esc(fmt(r.date))}</b><em data-pc="${PIECES[r.difficulty] || 16}">${PIECES[r.difficulty] || 16} pieces</em></span>
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
<title>Every Phuzzle of the Day: solve any of them free</title>
<meta name="description" content="${rows.length} daily photo puzzles, newest first. Solve any of them in your browser: no app, no account, no sign-up." />
<link rel="canonical" href="https://phuzzles.app/daily/" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://phuzzles.app/daily/" />
<meta property="og:title" content="Every Phuzzle of the Day" />
<meta property="og:description" content="${rows.length} daily photo puzzles. Solve any of them in your browser, nothing to install." />
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
/* The exit this page did not have. Proportions step by phi off the h1's 55px cap. */
.send{margin-top:97px;max-width:655px;background:var(--panel);border-radius:14px;padding:clamp(21px,5vw,34px)}
.send h2{font-family:'Archivo',sans-serif;font-weight:800;font-size:clamp(26px,4vw,34px);line-height:1.12;letter-spacing:-.015em}
.send p{color:var(--muted);margin-top:13px;max-width:56ch}
.send a{color:var(--teal)}
.stores{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:21px}
.stores a{display:block;border-radius:8px}
.stores img{height:44px;width:auto}
/* Google's badge PNG carries transparent padding that Apple's SVG does not */
.stores .gp{height:64px;margin:-10px -8px}
.stores a:focus-visible{outline:2px solid var(--teal);outline-offset:3px}
.price{margin-top:16px;font-size:14px;color:var(--muted)}
</style>
</head>
<body>
<div class="wrap">
  <h1 id="t-h1">Every Phuzzle of the Day</h1>
  <p class="lede" id="t-lede1">${rows.length} daily photo puzzles, newest first. Every one is still solvable in your
     browser. No app, no account, nothing to install. <a href="/today/">Today's is here</a>, and a new
     one lands at 11:00 Eastern.</p>
  <p class="lede" id="t-lede2">The previews are scrambled, same as the puzzles. That is rather the point.</p>
  <ul>
${cards}
  </ul>
  <section class="send">
    <h2 id="t-sh2">Send one of your own</h2>
    <p id="t-sp1">These ${rows.length} are ours. They work the way the one you send works: a photo in pieces, and a note
       underneath it that shows up when the last piece lands. Yours would be your photo, and the
       thing you actually want to say.</p>
    <p id="t-sp2">Making one needs the app, on an iPhone or on Android. Solving one needs nothing at all,
       same as every puzzle on this page.</p>
    <div class="stores">
      <a href="https://apps.apple.com/app/id6766833614" target="_blank" rel="noopener"><img id="t-ios" src="/app-store-badge.svg" alt="Download on the App Store" /></a>
      <a href="https://play.google.com/store/apps/details?id=rebelstudios.phuzzles.app&amp;referrer=utm_source%3Dphuzzles.app%26utm_medium%3Darchive_page%26utm_campaign%3Ddaily" target="_blank" rel="noopener"><img id="t-gp" class="gp" src="/google-play-badge.png" alt="Get it on Google Play" /></a>
    </div>
    <p class="price" id="t-price">Free, with ads. <a href="/">How Phuzzles works</a></p>
  </section>
  <footer id="t-footer">
    <a href="/">Phuzzles</a> · Made by Rebel Studios ·
    Photos are public domain or openly licensed; each puzzle credits its source.
  </footer>
</div>
<script>
// i18n. This page is a recipient's surface too: it reaches people with no app installed, so it
// speaks the browser's language and falls back to English. English stays as the server-rendered
// text, so a missing key cannot drift. The <head>/og tags stay English, same reason as /solve/:
// a static host can't know the reader's language before the preview is built. Dates on the cards
// stay in a neutral long form; the per-card caption is the puzzle's own message and is left as-is.
(function(){
  var N = ${rows.length};
  var l = ((navigator.languages && navigator.languages[0]) || navigator.language || "en").toLowerCase();
  var LANG =
    (l === "ja" || l.indexOf("ja-") === 0) ? "ja" :
    (l === "fr" || l.indexOf("fr-") === 0) ? "fr" :
    (l === "es" || l.indexOf("es-") === 0) ? "es" :
    (l === "de" || l.indexOf("de-") === 0) ? "de" :
    (l === "pt" || l.indexOf("pt-") === 0) ? "pt" : "en";
  if (LANG === "en") return;
  var STR = {
    ja: {
      h1: "これまでの Phuzzle of the Day",
      lede1: function(n){ return n + "日分の写真パズル、新しい順です。どれも今もブラウザで解けます。アプリも、アカウントも、インストールも要りません。<a href='/today/'>今日の分はこちら</a>。新作は毎日アメリカ東部時間11:00に出ます。"; },
      lede2: "プレビューはパズルと同じように、ばらばらにしてあります。それがこのページの趣旨です。",
      sh2: "自分の写真で送る",
      sp1: function(n){ return "この" + n + "問はわたしたちのものです。あなたが送るパズルと仕組みは同じで、ばらばらになった写真と、最後のピースがはまった瞬間に現れる一言がついています。あなたのなら、あなたの写真と、本当に伝えたい言葉になります。"; },
      sp2: "作るにはアプリが要ります（iPhone か Android）。解くほうは何も要りません。このページのどのパズルとも同じです。",
      price: "無料、広告つき。<a href='/'>Phuzzlesの仕組み</a>",
      footer: "<a href='/'>Phuzzles</a> · 制作：Rebel Studios · 写真はパブリックドメインか、オープンライセンスのものです。各パズルに出典を記載しています。",
      ios: "App Store からダウンロード",
      gp: "Google Play で手に入れよう",
      pieces: function(n){ return n + "ピース"; }
    },
    fr: {
      h1: "Tous les Phuzzle of the Day",
      lede1: function(n){ return n + " puzzles photo quotidiens, du plus récent au plus ancien. Chacun se résout encore dans votre navigateur. Pas d'appli, pas de compte, rien à installer. <a href='/today/'>Celui du jour est ici</a>, et un nouveau arrive chaque jour à 11h00 (heure de l'Est des États-Unis)."; },
      lede2: "Les aperçus sont mélangés, comme les puzzles. C'est précisément l'intérêt.",
      sh2: "Envoyez le vôtre",
      sp1: function(n){ return "Ces " + n + " sont les nôtres. Ils fonctionnent comme celui que vous envoyez : une photo en morceaux, et un mot en dessous qui apparaît quand la dernière pièce se met en place. Le vôtre, ce serait votre photo et ce que vous avez vraiment envie de dire."; },
      sp2: "Pour en créer un, il faut l'appli, sur iPhone ou sur Android. Pour en résoudre un, il ne faut rien du tout, comme chaque puzzle de cette page.",
      price: "Gratuit, avec publicités. <a href='/'>Comment marche Phuzzles</a>",
      footer: "<a href='/'>Phuzzles</a> · Fait par Rebel Studios · Les photos sont dans le domaine public ou sous licence ouverte ; chaque puzzle crédite sa source.",
      ios: "Télécharger dans l'App Store",
      gp: "Disponible sur Google Play",
      pieces: function(n){ return n + " pièces"; }
    },
    es: {
      h1: "Todos los Phuzzle of the Day",
      lede1: function(n){ return n + " puzzles de fotos diarios, del más nuevo al más antiguo. Todos se pueden resolver todavía en tu navegador. Sin app, sin cuenta, nada que instalar. <a href='/today/'>El de hoy está aquí</a>, y uno nuevo llega cada día a las 11:00 (hora del Este de EE. UU.)."; },
      lede2: "Las vistas previas están revueltas, igual que los puzzles. Esa es justamente la idea.",
      sh2: "Envía uno tuyo",
      sp1: function(n){ return "Estos " + n + " son nuestros. Funcionan igual que el que tú envías: una foto en piezas y una nota debajo que aparece cuando encaja la última pieza. El tuyo sería tu foto y lo que de verdad quieres decir."; },
      sp2: "Para crear uno hace falta la app, en iPhone o en Android. Para resolver uno no hace falta nada, igual que cada puzzle de esta página.",
      price: "Gratis, con anuncios. <a href='/'>Cómo funciona Phuzzles</a>",
      footer: "<a href='/'>Phuzzles</a> · Hecho por Rebel Studios · Las fotos son de dominio público o con licencia abierta; cada puzzle cita su fuente.",
      ios: "Descárgalo en el App Store",
      gp: "Disponible en Google Play",
      pieces: function(n){ return n + " piezas"; }
    },
    de: {
      h1: "Alle Phuzzle of the Day",
      lede1: function(n){ return n + " tägliche Fotopuzzles, neueste zuerst. Jedes lässt sich noch im Browser lösen. Keine App, kein Konto, nichts zu installieren. <a href='/today/'>Das von heute ist hier</a>, und jeden Tag um 11:00 Uhr (US-Ostküstenzeit) kommt ein neues dazu."; },
      lede2: "Die Vorschauen sind verwürfelt, genau wie die Puzzles. Das ist durchaus der Sinn der Sache.",
      sh2: "Verschick dein eigenes",
      sp1: function(n){ return "Diese " + n + " sind von uns. Sie funktionieren wie das, das du verschickst: ein Foto in Teilen und darunter eine Nachricht, die erscheint, sobald das letzte Teil liegt. Deins wäre dein Foto und das, was du wirklich sagen willst."; },
      sp2: "Zum Erstellen braucht es die App, auf dem iPhone oder auf Android. Zum Lösen braucht es gar nichts, wie bei jedem Puzzle auf dieser Seite.",
      price: "Kostenlos, mit Werbung. <a href='/'>So funktioniert Phuzzles</a>",
      footer: "<a href='/'>Phuzzles</a> · Von Rebel Studios · Die Fotos sind gemeinfrei oder offen lizenziert; jedes Puzzle nennt seine Quelle.",
      ios: "Laden im App Store",
      gp: "Jetzt bei Google Play",
      pieces: function(n){ return n + " Teile"; }
    },
    pt: {
      h1: "Todos os Phuzzle of the Day",
      lede1: function(n){ return n + " quebra-cabeças de fotos diários, do mais novo ao mais antigo. Todos ainda dá para resolver no seu navegador. Sem app, sem conta, nada para instalar. <a href='/today/'>O de hoje está aqui</a>, e um novo chega todo dia às 11:00 (horário do leste dos EUA)."; },
      lede2: "As prévias estão embaralhadas, como os quebra-cabeças. É justamente essa a ideia.",
      sh2: "Envie um seu",
      sp1: function(n){ return "Estes " + n + " são nossos. Funcionam como aquele que você manda: uma foto em pedaços e um recado embaixo que aparece quando a última peça se encaixa. O seu seria a sua foto e o que você realmente quer dizer."; },
      sp2: "Para criar um, precisa do app, no iPhone ou no Android. Para resolver um, não precisa de nada, como em todos os quebra-cabeças desta página.",
      price: "Grátis, com anúncios. <a href='/'>Como o Phuzzles funciona</a>",
      footer: "<a href='/'>Phuzzles</a> · Feito pela Rebel Studios · As fotos são de domínio público ou com licença aberta; cada quebra-cabeça cita a sua fonte.",
      ios: "Baixar na App Store",
      gp: "Disponível no Google Play",
      pieces: function(n){ return n + " peças"; }
    }
  };
  var d = STR[LANG];
  document.documentElement.lang = LANG;
  function byId(id){ return document.getElementById(id); }
  function txt(id, v){ var el = byId(id); if (el && v != null) el.textContent = v; }
  function html(id, v){ var el = byId(id); if (el && v != null) el.innerHTML = v; }
  txt("t-h1", d.h1);
  html("t-lede1", d.lede1(N));
  txt("t-lede2", d.lede2);
  txt("t-sh2", d.sh2);
  txt("t-sp1", d.sp1(N));
  txt("t-sp2", d.sp2);
  html("t-price", d.price);
  html("t-footer", d.footer);
  var ios = byId("t-ios"); if (ios && d.ios) ios.alt = d.ios;
  var gp = byId("t-gp"); if (gp && d.gp) gp.alt = d.gp;
  var ems = document.querySelectorAll(".meta em[data-pc]");
  for (var i = 0; i < ems.length; i++) { ems[i].textContent = d.pieces(+ems[i].getAttribute("data-pc")); }
})();
</script>
</body>
</html>
`;
fs.mkdirSync("daily", { recursive: true });
fs.writeFileSync("daily/index.html", html);
console.log(`wrote daily/index.html with ${rows.length} puzzles (${(html.length/1024).toFixed(1)} KB)`);
