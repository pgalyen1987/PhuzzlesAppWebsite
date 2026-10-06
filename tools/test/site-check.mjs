// Browser checks for phuzzles.app, run on a checkout before main is pushed (a push to main deploys the site).
//   node tools/test/site-check.mjs [root]     (root: the folder served as phuzzles.app; default this checkout)
// It drives a private headless Chromium. Every request to https://phuzzles.app is answered from root with GitHub
// Pages' rules, so /puzzle/<id> gets 404.html with a 404 as it does live. Firebase is stubbed with one made-up puzzle
// per check, or the real SDK runs with sign-up answered here, so nothing signs in, reads or writes production.
// Photos are answered with a local PNG, cloud functions are blocked, and every Analytics hit is answered inside the
// browser, so nothing is recorded. The real gtag.js and Firebase SDK still load from Google, so it needs a network.
// Needs playwright-core and Chromium: PLAYWRIGHT_CORE (a playwright-core folder) and CHROMIUM, by default
// ~/agent-browser's playwright-core and /usr/bin/chromium.
// Written in the 2026-10-05 fix run, from the before/after harness that showed each of these fixes.
import { createRequire } from "node:module";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(homedir(), "agent-browser", "package.json"));
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const PNG = readFileSync(join(ROOT, "logo-128.png"));

// ── GitHub Pages, as observed live ───────────────────────────────────────────────────────────────────────────
// /x/ -> x/index.html; /x -> the file x, else x.html, else a 301 to /x/ when x/index.html exists; anything else is
// 404.html WITH status 404; an extensionless file is application/octet-stream.
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf", ".xml": "application/xml" };
const isFile = (p) => existsSync(p) && statSync(p).isFile();
function pagesAnswer(url) {
  const u = new URL(url);
  let path;
  try { path = decodeURIComponent(u.pathname); } catch (e) { path = null; }
  const notFound = () => ({ status: 404, contentType: TYPES[".html"], body: readFileSync(join(ROOT, "404.html")) });
  if (path === null || path.includes("\0") || path.split("/").includes("..")) return notFound();
  const fsPath = join(ROOT, path);
  if (path.endsWith("/")) {
    const idx = join(fsPath, "index.html");
    return isFile(idx) ? { status: 200, contentType: TYPES[".html"], body: readFileSync(idx) } : notFound();
  }
  if (isFile(fsPath)) return { status: 200, contentType: TYPES[extname(fsPath)] || "application/octet-stream", body: readFileSync(fsPath) };
  if (isFile(fsPath + ".html")) return { status: 200, contentType: TYPES[".html"], body: readFileSync(fsPath + ".html") };
  if (isFile(join(fsPath, "index.html"))) return { status: 301, headers: { location: u.pathname + "/" + u.search } };
  return notFound();
}

// ── Firebase, stood in for: sign-in, and one doc get (or a query) answered from the scenario ─────────────────
const firebaseStub = (scen) => `
window.__SCEN = ${JSON.stringify(scen)};
// A number in potdAt or sentAt becomes an object with toMillis(), as Firestore hands timestamps over.
if (window.__SCEN.doc) for (const k of ["potdAt", "sentAt"]) { const v = window.__SCEN.doc[k]; if (typeof v === "number") window.__SCEN.doc[k] = { toMillis: () => v }; }
window.firebase = {
  initializeApp(){},
  auth(){ return { signInAnonymously(){
    const a = window.__SCEN.auth;
    if (a === 'busy') return Promise.reject({ code: 'auth/too-many-requests' });
    if (a === 'offline') return Promise.reject({ code: 'auth/network-request-failed' });
    return Promise.resolve({}); } }; },
  firestore(){
    const S = window.__SCEN;
    const snap = (id, d) => ({ id, exists: !!d, data: () => d, get: (k) => d && d[k] });
    return { collection(){ return {
      doc(id){ return { get(){
        if (S.getError) return Promise.reject({ code: S.getError });
        return Promise.resolve(snap(id, S.doc || null)); } }; },
      where(){ return { get(){ return Promise.resolve({ docs: S.doc ? [snap(S.dailyId || 'DailyDoc12345', S.doc)] : [] }); } }; }
    }; } };
  }
};`;

// One private context. scen: stub Firebase with it; realSdk: load Google's SDK, with sign-up answered "busy" here or
// cut off; gtag: load the real gtag.js (its collect hits are still answered here).
async function open(browser, { scen = null, realSdk = false, signUp = "block", gtag = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: false });
  const p = await ctx.newPage();
  const seen = { collect: [], errors: [], storage: [], pages: [] };
  p.on("pageerror", (e) => seen.errors.push(String(e.message).slice(0, 160)));
  if (scen) await p.addInitScript(firebaseStub(scen));
  await ctx.route("**/*", async (route) => {
    const req = route.request(), u = req.url();
    let h; try { h = new URL(u).hostname; } catch (e) { return route.abort(); }
    if (h === "phuzzles.app") { seen.pages.push({ url: u, referer: req.headers()["referer"] || null }); return route.fulfill(pagesAnswer(u)); }
    if (h === "www.gstatic.com" && u.includes("/firebasejs/")) return realSdk ? route.continue() : route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    if (h === "identitytoolkit.googleapis.com") {
      if (signUp === "busy") return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { code: 400, message: "TOO_MANY_ATTEMPTS_TRY_LATER", errors: [{ message: "TOO_MANY_ATTEMPTS_TRY_LATER", domain: "global", reason: "invalid" }] } }) });
      return route.abort("internetdisconnected");
    }
    if (h === "firebasestorage.googleapis.com" || h === "evil.example") { seen.storage.push(u); return route.fulfill({ status: 200, contentType: "image/png", body: PNG }); }
    if (h.endsWith("google-analytics.com") || h.endsWith("analytics.google.com") || u.includes("/g/collect")) {
      seen.collect.push({ url: u, body: req.postData() || "" });
      return route.fulfill({ status: 204, body: "" });
    }
    if (h === "www.googletagmanager.com") return gtag ? route.continue() : route.abort();
    return route.abort(); // firestore, securetoken, cloud functions and anything else
  });
  return { ctx, p, seen };
}

// Every event Analytics was handed, with the hit's shared parameters (dl, dr, dt) merged in.
function gaEvents(seen) {
  const out = [];
  for (const c of seen.collect) {
    const shared = Object.fromEntries(new URL(c.url).searchParams.entries());
    for (const line of c.body ? c.body.split("\n").filter(Boolean) : [""]) out.push({ ...shared, ...Object.fromEntries(new URLSearchParams(line).entries()) });
  }
  return out;
}
const visible = (p) => p.evaluate(() => ["loading", "game", "won", "install", "notfound", "none"]
  .filter((id) => { const e = document.getElementById(id); return e && !e.classList.contains("hidden") && !e.hidden; })
  .map((id) => id + ":" + (document.querySelector("#" + id + " h1")?.textContent || "").trim()));
const miniShown = (p) => p.evaluate(() => ["play", "empty"].filter((id) => document.getElementById(id) && !document.getElementById(id).hidden));

// Solve a mounted board by clicking: which piece a cell shows is read from its background position.
async function solveByClicking(p) {
  for (let guard = 0; guard < 80; guard++) {
    const s = await p.evaluate(() => {
      const tiles = [...document.querySelectorAll("#board .tile")];
      const pos = tiles.map((t) => t.style.backgroundPosition);
      const key = (v) => { const [x, y] = v.split(" ").map(parseFloat); return [y, x]; };
      const sorted = [...new Set(pos)].sort((a, b) => { const A = key(a), B = key(b); return A[0] - B[0] || A[1] - B[1]; });
      return { order: pos.map((v) => sorted.indexOf(v)), done: document.getElementById("board").classList.contains("solved") };
    });
    if (s.done) return true;
    const cell = s.order.findIndex((k, i) => k !== i);
    if (cell < 0) return true;
    const tiles = p.locator("#board .tile");
    await tiles.nth(s.order.indexOf(cell)).click();
    await tiles.nth(cell).click();
    await p.waitForTimeout(60);
  }
  return false;
}

// ── The checks ───────────────────────────────────────────────────────────────────────────────────────────────
const BUCKET = "https://firebasestorage.googleapis.com/v0/b/phuzzles.firebasestorage.app/o/";
const ANDROID = BUCKET + "puzzles%2Fuid1%2Fa.jpg?alt=media&token=t-1";
const IOS = ANDROID.replace("googleapis.com/", "googleapis.com:443/"); // the iPhone app's SDK names the port
const EVIL = "https://evil.example/track.png";
const QUOTE = ANDROID.replace("a.jpg", "a.jpg')");
const CLIMB = BUCKET + "a/../../../someone-elses.appspot.com/o/x.jpg?alt=media"; // the browser resolves the ../ first
const link = (imageUrl) => ({ imageUrl, difficulty: "EASY", senderUsername: "tester", receiverId: "__link__", senderId: "u1", linkShared: true });
const ID = "QAtestNotARealId123";

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail).slice(0, 400)}`); };
const noErrors = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
try {
  // Which photos the shared-link solver plays: our bucket in either app's form, nothing else.
  const solver = {};
  for (const [name, url] of [["android", ANDROID], ["ios", IOS], ["foreign", EVIL], ["quote", QUOTE], ["climb", CLIMB]]) {
    const { ctx, p, seen } = await open(browser, { scen: { auth: "ok", doc: link(url) } });
    await p.goto("https://phuzzles.app/puzzle/HarnessDoc123", { waitUntil: "load" });
    await p.waitForTimeout(1500);
    const views = await visible(p);
    const solved = name === "ios" && views.some((v) => v.startsWith("game")) ? await solveByClicking(p) : null;
    solver[name] = { views, solved, photos: seen.storage.length };
    noErrors.push(...seen.errors);
    await ctx.close();
  }
  const has = (r, s) => r.views.some((v) => v.startsWith(s));
  check("solver: an Android photo plays", has(solver.android, "game"), solver.android);
  check("solver: an iPhone photo (:443) plays and solves", has(solver.ios, "game") && solver.ios.solved === true, solver.ios);
  check("solver: a foreign host gets the install wall, nothing fetched", has(solver.foreign, "install") && solver.foreign.photos === 0, solver.foreign);
  check("solver: a quote in the address gets the install wall", has(solver.quote, "install") && solver.quote.photos === 0, solver.quote);
  check("solver: a ../ out of our bucket gets the install wall, nothing fetched", has(solver.climb, "install") && solver.climb.photos === 0, solver.climb);

  // The mini app's copy of the same check.
  const mini = {};
  for (const [name, url] of [["android", ANDROID], ["ios", IOS], ["foreign", EVIL], ["climb", CLIMB]]) {
    const { ctx, p, seen } = await open(browser, { scen: { auth: "ok", doc: link(url) } });
    await p.goto("https://phuzzles.app/mini/?p=HarnessDoc1234567", { waitUntil: "load" });
    await p.waitForTimeout(1500);
    mini[name] = { shown: await miniShown(p), photos: seen.storage.length };
    noErrors.push(...seen.errors);
    await ctx.close();
  }
  check("mini: an Android photo plays", mini.android.shown.includes("play"), mini.android);
  check("mini: an iPhone photo (:443) plays", mini.ios.shown.includes("play"), mini.ios);
  check("mini: a foreign host is refused, nothing fetched", mini.foreign.shown.includes("empty") && mini.foreign.photos === 0, mini.foreign);
  check("mini: a ../ out of our bucket is refused, nothing fetched", mini.climb.shown.includes("empty") && mini.climb.photos === 0, mini.climb);

  // Analytics never gets a link puzzle's id (it is the puzzle's only key), and the pages opened from one learn only
  // the origin. A solved link puzzle, then the brand link home; the same on the mini app.
  {
    const { ctx, p, seen } = await open(browser, { scen: { auth: "ok", doc: link(ANDROID) }, gtag: true });
    await p.goto(`https://phuzzles.app/puzzle/${ID}?utm_source=test&utm_medium=qa`, { waitUntil: "load" });
    await p.waitForTimeout(2500);
    await solveByClicking(p);
    await p.waitForTimeout(1500);
    await p.click("a.brand"); await p.waitForLoadState("load"); await p.waitForTimeout(2500);
    const homeReferrer = await p.evaluate(() => document.referrer);
    await p.goto(`https://phuzzles.app/mini/?p=${ID}&utm_source=test&utm_medium=qa`, { waitUntil: "load" });
    await p.waitForTimeout(2500);
    await p.click("a.brand"); await p.waitForLoadState("load"); await p.waitForTimeout(2500);
    const miniHomeReferrer = await p.evaluate(() => document.referrer);
    await p.goto("about:blank"); await p.waitForTimeout(500);
    await ctx.close();
    const evs = gaEvents(seen);
    const leaks = evs.filter((e) => JSON.stringify(e).includes(ID)).map((e) => e.en + " " + (e.dl || ""));
    check("analytics: hits were seen at all (real gtag.js loaded)", evs.some((e) => e.en === "page_view"), evs.length);
    check("analytics: no hit carries a link puzzle's id (/puzzle/ and /mini/)", leaks.length === 0, leaks);
    check("referrer: the homepage and the mini app's home see only https://phuzzles.app/",
      homeReferrer === "https://phuzzles.app/" && miniHomeReferrer === "https://phuzzles.app/", { homeReferrer, miniHomeReferrer });
    noErrors.push(...seen.errors);
  }
  // The daily is public: its events name it (puzzle_id), its page view still goes without the id, and it plays.
  {
    const DID = "DailyDoc12345678";
    const doc = { imageUrl: ANDROID, difficulty: "EASY", senderUsername: "phuzzles", senderId: "phuzzles-official", receiverId: "__potd__",
      isPotd: true, isPublic: true, potdAt: Date.now(), message: "Puzzle of the Day.\nA corgi." };
    const { ctx, p, seen } = await open(browser, { scen: { auth: "ok", doc }, gtag: true });
    await p.goto(`https://phuzzles.app/solve/${DID}?utm_source=potd-share&utm_medium=share`, { waitUntil: "load" });
    await p.waitForTimeout(2500);
    const title = await p.textContent("#game-title");
    await solveByClicking(p);
    await p.waitForTimeout(1500);
    const share = await p.evaluate(() => !!document.getElementById("share-today"));
    const won = await p.textContent("#won h1");
    await p.click("a.brand"); await p.waitForLoadState("load"); await p.waitForTimeout(2000);
    await ctx.close();
    const evs = gaEvents(seen);
    check("daily: plays as Today's Phuzzle, says the swaps, offers Share", title === "Today's Phuzzle" && /^Solved in \d+ swaps?\.$/.test(won) && share, { title, won, share });
    check("daily: no id in the page address Analytics gets, puzzle_id on open and solve",
      !evs.some((e) => (e.dl || "").includes(DID)) && ["puzzle_open", "puzzle_solved_web"].every((n) => evs.some((e) => e.en === n && e["ep.puzzle_id"] === DID)),
      evs.map((e) => e.en + " " + (e["ep.puzzle_id"] || "") + " " + (e.dl || "")));
    noErrors.push(...seen.errors);
  }
  // A refused anonymous sign-up, and no connection at all, say so instead of asking for an install; the real SDK.
  for (const [mode, signUp] of [["busy", "busy"], ["offline", "block"]]) {
    for (const path of ["/puzzle/OVSjHWR0soePRAALlSW8", "/solve/OVSjHWR0soePRAALlSW8", "/today/"]) {
      const { ctx, p, seen } = await open(browser, { realSdk: true, signUp, gtag: mode === "busy" });
      await p.goto("https://phuzzles.app" + path, { waitUntil: "load" });
      await p.waitForTimeout(mode === "offline" ? 9000 : 5000);
      const views = await visible(p);
      const want = (path === "/today/" ? "none:" : "notfound:") + (mode === "busy" ? "Too many" : "Couldn");
      check(`${mode}: ${path} says so`, views.some((v) => v.startsWith(want)), views);
      if (mode === "busy" && path.startsWith("/puzzle/")) {
        const leaks = gaEvents(seen).filter((e) => JSON.stringify(e).includes("OVSjHWR0soePRAALlSW8")).map((e) => e.en);
        check("busy: the refused sign-up's hits carry no id", leaks.length === 0, leaks);
      }
      noErrors.push(...seen.errors);
      await ctx.close();
    }
  }
  // Malformed escapes, a missing puzzle, a private one, and a keyboard.
  for (const path of ["/puzzle/%C0%80", "/puzzle/%FF", "/solve/abc%E2%28"]) {
    const { ctx, p, seen } = await open(browser, { scen: { auth: "ok", doc: link(ANDROID) } });
    await p.goto("https://phuzzles.app" + path, { waitUntil: "load" });
    await p.waitForTimeout(1500);
    const views = await visible(p);
    check(`malformed ${path} says Page not found`, views.some((v) => v.startsWith("notfound:Page not found")), views);
    noErrors.push(...seen.errors);
    await ctx.close();
  }
  for (const [name, scen] of [["missing", { auth: "ok", doc: null }], ["private", { auth: "ok", getError: "permission-denied" }]]) {
    const { ctx, p, seen } = await open(browser, { scen });
    await p.goto("https://phuzzles.app/puzzle/HarnessDoc123", { waitUntil: "load" });
    await p.waitForTimeout(1200);
    const views = await visible(p);
    check(`a ${name} puzzle gets the install wall`, views.some((v) => v.startsWith("install")), views);
    noErrors.push(...seen.errors);
    await ctx.close();
  }
  {
    const { ctx, p, seen } = await open(browser, { scen: { auth: "ok", doc: link(ANDROID) } });
    await p.goto("https://phuzzles.app/puzzle/HarnessDoc123", { waitUntil: "load" });
    await p.waitForTimeout(1500);
    let cls = "";
    for (let i = 0; i < 12; i++) { await p.keyboard.press("Tab"); cls = await p.evaluate(() => document.activeElement?.className || ""); if (cls.includes("tile")) break; }
    await p.keyboard.press("Enter"); await p.keyboard.press("Tab"); await p.keyboard.press("Enter");
    await p.waitForTimeout(400);
    const moves = await p.textContent("#moves");
    check("keyboard: Tab to a tile, Enter, Tab, Enter swaps", moves === "1 swap", { cls, moves });
    noErrors.push(...seen.errors);
    await ctx.close();
  }
  // The pages the stores and posts link to, at phone width; the policy's promises; files that must not be served.
  {
    const { ctx, p, seen } = await open(browser, { realSdk: true });
    const bad = {};
    for (const path of ["/", "/privacy", "/terms", "/child-safety", "/delete-account", "/request-data-deletion", "/reset-password", "/get/", "/today/", "/mini/", "/p/poster/"]) {
      const r = await p.goto("https://phuzzles.app" + path, { waitUntil: "load" }).catch(() => null);
      await p.waitForTimeout(300);
      const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => null);
      if (!r || r.status() !== 200 || wide !== false) bad[path] = { status: r && r.status(), wide };
    }
    check("pages: each answers 200 with no sideways scroll at 390 px", Object.keys(bad).length === 0, bad);
    await p.goto("https://phuzzles.app/privacy", { waitUntil: "load" });
    const items = await p.evaluate(() => [...document.querySelectorAll("li")].map((li) => li.textContent.trim()));
    check("privacy: no promise to delete \"all associated data\"", !items.some((t) => /all associated data/i.test(t)), items.filter((t) => /delete/i.test(t)));
    check("privacy: names Google Cloud Vision, which checks public photos", items.some((t) => t.startsWith("Google Cloud Vision:")), null);
    const served = {};
    for (const path of ["/DISTRIBUTION_KIT.md", "/IOS_LAUNCH_CHECKLIST.md", "/robots.txt"]) served[path] = (await p.goto("https://phuzzles.app" + path).catch(() => null))?.status() ?? null;
    check("the old planning docs are not served (robots.txt is)", served["/DISTRIBUTION_KIT.md"] === 404 && served["/IOS_LAUNCH_CHECKLIST.md"] === 404 && served["/robots.txt"] === 200, served);
    noErrors.push(...seen.errors);
    await ctx.close();
  }
  check("no page errors anywhere", noErrors.length === 0, noErrors);
} finally {
  await browser.close();
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
